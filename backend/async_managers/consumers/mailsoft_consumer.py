"""
Consumer Kafka Mailsoft
Écoute les événements Mailsoft et crée automatiquement les factures.
Le connecteur JDBC sink s'occupe déjà d'insérer dans courriers.
Ce consumer se charge uniquement de créer la facture associée,
puis notifie les clients connectés via WebSocket.
"""

import json
import asyncio
import logging
from kafka import KafkaConsumer
from sqlalchemy.orm import Session
from datetime import datetime

from models.models import Courrier, Facture, FactureCourrier, Log, ActionLogEnum, StatutFactureEnum
from schemas.database import SessionLocal
from settings import settings

logger = logging.getLogger("mailsoft_consumer")


class MailsoftConsumer:
    """Consumer pour traiter les événements Mailsoft"""

    def __init__(self):
        self.consumer    = None
        self.running     = False
        self.topic       = "mailsoft.mailsoft.mailsoft"
        # Loop FastAPI injectée par kafka_manager avant le démarrage du thread
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """
        Reçoit la loop FastAPI depuis le thread principal (kafka_manager).
        Doit être appelé AVANT start() pour que le broadcast fonctionne.
        """
        self._loop = loop
        logger.info("✅ Event loop FastAPI enregistrée dans le consumer")

    # ──────────────────────────────────────────────────────────────────────────
    # Broadcast WebSocket depuis un thread synchrone
    # ──────────────────────────────────────────────────────────────────────────

    def _broadcast_nowait(self, facture_data: dict, event_type: str = "created") -> None:
        """
        Planifie un broadcast WebSocket dans la loop FastAPI.

        Le consumer tourne dans un thread daemon séparé : on ne peut pas
        faire `await manager.broadcast_...()` directement.
        On utilise run_coroutine_threadsafe() qui est conçu exactement
        pour ce cas — il est thread-safe et non-bloquant.

        event_type : "created" → broadcast_facture_created (le frontend recharge)
                     "updated" → broadcast_facture_update  (le frontend met à jour la ligne)
        """
        if self._loop is None or self._loop.is_closed():
            logger.warning("⚠️ Pas de loop disponible, broadcast WebSocket ignoré")
            return

        try:
            from async_managers.websocket_manager import manager

            # Choisir la bonne coroutine selon le type d'événement
            if event_type == "created":
                coro = manager.broadcast_facture_created(facture_data)
            else:
                coro = manager.broadcast_facture_update(facture_data)

            # Planifie la coroutine dans la loop FastAPI — thread-safe
            asyncio.run_coroutine_threadsafe(coro, self._loop)
            logger.info(
                f"📡 Broadcast WebSocket '{event_type}' planifié "
                f"pour facture {facture_data.get('codeUnique')}"
            )

        except Exception as e:
            # Non-bloquant : une erreur ici ne doit jamais empêcher
            # la création de la facture en base
            logger.error(f"❌ Erreur broadcast WebSocket: {str(e)}")

    # ──────────────────────────────────────────────────────────────────────────
    # Démarrage / consommation
    # ──────────────────────────────────────────────────────────────────────────

    def start(self):
        """Démarre le consumer Kafka"""
        try:
            self.consumer = KafkaConsumer(
                self.topic,
                bootstrap_servers=[settings.KAFKA_BROKER],
                group_id="cfc-factures-group",
                value_deserializer=lambda m: json.loads(m.decode('utf-8')) if m else None,
                auto_offset_reset='earliest',
                enable_auto_commit=True,
                max_poll_records=1
            )
            self.running = True
            logger.info(f"✅ Consumer Mailsoft démarré sur le topic: {self.topic}")
            self._consume_messages()
        except Exception as e:
            logger.error(f"❌ Erreur au démarrage du consumer: {str(e)}")
            self.running = False

    def _consume_messages(self):
        """Consomme les messages du topic Mailsoft"""
        while self.running:
            try:
                for message in self.consumer:
                    payload = message.value

                    # Ignorer les tombstones
                    if payload is None:
                        logger.info("⚠️ Message tombstone ignoré")
                        continue

                    # Ignorer les événements de suppression (__deleted = true)
                    if payload.get("__deleted") == "true" or payload.get("__deleted") is True:
                        logger.info("⚠️ Événement DELETE ignoré")
                        continue

                    logger.info(f"📦 Payload reçu: {json.dumps(payload, default=str)}")
                    self._process_mailsoft_event(payload)

            except Exception as e:
                logger.error(f"❌ Erreur lors de la consommation: {str(e)}")

    # ──────────────────────────────────────────────────────────────────────────
    # Traitement d'un événement
    # ──────────────────────────────────────────────────────────────────────────

    def _process_mailsoft_event(self, payload: dict):
        """
        Traite un événement Mailsoft.
        1. Trouve ou crée le courrier en base
        2. Crée la facture associée si elle n'existe pas encore
        3. Notifie les clients React via WebSocket
        """
        if "payload" in payload:
            payload = payload["payload"]

        db: Session = SessionLocal()
        try:
            numero_courrier = (
                payload.get("NUMERO_COURRIER")
                or payload.get("numero_courrier")
            )

            if not numero_courrier:
                logger.warning(f"⚠️ Payload sans numero_courrier, ignoré: {payload}")
                return

            # ── Attendre que le sink JDBC ait inséré le courrier ─────────────
            courrier = None
            for tentative in range(5):
                courrier = db.query(Courrier).filter(
                    Courrier.numero_courrier == numero_courrier
                ).first()
                if courrier:
                    break
                logger.info(f"⏳ Courrier {numero_courrier} pas encore inséré, tentative {tentative + 1}/5")
                import time
                time.sleep(1)
                db.expire_all()

            if not courrier:
                # Tentative d'insertion manuelle avec gestion du doublon
                logger.warning(
                    f"⚠️ Courrier {numero_courrier} introuvable après 5 tentatives, "
                    f"tentative d'insertion manuelle"
                )
                try:
                    courrier = Courrier(
                        numero_courrier=numero_courrier,
                        objet_courrier=payload.get("OBJET_COURRIER") or payload.get("objet_courrier"),
                        expediteur=payload.get("NUMERO_EXPEDITEUR") or payload.get("expediteur"),
                        destinataire=str(payload.get("NUMERO_DESTINATAIRE") or payload.get("destinataire") or ""),
                        position=str(payload.get("POSITION") or payload.get("position") or ""),
                    )
                    db.add(courrier)
                    db.flush()
                    logger.info(f"✅ Courrier {numero_courrier} créé manuellement")

                except Exception:
                    # Doublon : le sink l'a inséré juste avant nous
                    db.rollback()
                    logger.warning(f"⚠️ Doublon détecté pour {numero_courrier}, récupération depuis la BD")
                    courrier = db.query(Courrier).filter(
                        Courrier.numero_courrier == numero_courrier
                    ).first()
                    if not courrier:
                        logger.error(f"❌ Impossible de récupérer le courrier {numero_courrier} après doublon")
                        return

            # ── Vérifier si une facture existe déjà pour ce courrier ─────────
            facture_courrier = db.query(FactureCourrier).filter(
                FactureCourrier.idCourrier == courrier.idCourrier
            ).first()

            if facture_courrier:
                # ── Mise à jour ───────────────────────────────────────────────
                facture = db.query(Facture).filter(
                    Facture.idFacture == facture_courrier.idFacture
                ).first()
                facture.updated_at = datetime.now()

                db.add(Log(
                    action=ActionLogEnum.MODIFICATION_DOSSIER,
                    ancienStatut=facture.statut.value if facture.statut else None,
                    nouveauStatut=facture.statut.value if facture.statut else None,
                    commentaire=f"Courrier mis à jour: {numero_courrier}",
                    topicKafka=self.topic,
                    idFacture=facture.idFacture
                ))
                db.commit()
                logger.info(f"🔄 Facture mise à jour pour courrier: {numero_courrier}")

                # Notifier les clients de la mise à jour
                self._broadcast_nowait({
                    "idFacture":   facture.idFacture,
                    "codeUnique":  facture.codeUnique,
                    "statut":      facture.statut.value,
                    "referenceEB": facture.referenceEB,
                    "updated_at":  facture.updated_at.isoformat(),
                }, event_type="updated")

            else:
                # ── Création ──────────────────────────────────────────────────
                code_unique = f"FACT-{numero_courrier}-{datetime.now().strftime('%Y%m%d%H%M%S')}"

                facture = Facture(
                    codeUnique=code_unique,
                    statut=StatutFactureEnum.RECEPTIONNE,
                    dateReception=datetime.now()
                )
                db.add(facture)
                db.flush()

                db.add(FactureCourrier(
                    idFacture=facture.idFacture,
                    idCourrier=courrier.idCourrier,
                    dateAssociation=datetime.now()
                ))

                db.add(Log(
                    action=ActionLogEnum.FACTURE_CREEE,
                    nouveauStatut=StatutFactureEnum.RECEPTIONNE.value,
                    commentaire=f"Facture créée automatiquement depuis courrier Mailsoft: {numero_courrier}",
                    topicKafka=self.topic,
                    idFacture=facture.idFacture
                ))
                db.commit()
                logger.info(f"✨ Nouvelle facture créée: {code_unique}")

                # Notifier les clients : nouvelle facture → ils rechargent la liste
                self._broadcast_nowait({
                    "idFacture":   facture.idFacture,
                    "codeUnique":  code_unique,
                    "statut":      StatutFactureEnum.RECEPTIONNE.value,
                    "referenceEB": None,
                    "updated_at":  datetime.now().isoformat(),
                }, event_type="created")

        except Exception as e:
            db.rollback()
            logger.error(f"❌ Erreur lors du traitement: {str(e)}")
        finally:
            db.close()

    # ──────────────────────────────────────────────────────────────────────────

    def stop(self):
        """Arrête le consumer"""
        self.running = False
        if self.consumer:
            self.consumer.close()
        logger.info("⛔ Consumer Mailsoft arrêté")


# Instance globale
mailsoft_consumer = MailsoftConsumer()