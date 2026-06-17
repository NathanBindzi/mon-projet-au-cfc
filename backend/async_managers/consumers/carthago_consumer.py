"""
Consumer Kafka Carthago Budget — version finale
================================================

Ce consumer couvre le cas B du flux :
  Carthago envoie les données APRÈS que l'instructeur
  a saisi la référence EB dans SUIFACT.

Flux complet rappel :
  ① INSERT/UPDATE dans carthago_budget.carthago
  ② Debezium → topic "carthago.carthago_budget.carthago"
  ③ JDBC Sink → cfc_db.carthago_staging (table tampon sans FK)
  ④ CE consumer lit le topic directement (pas staging)
     et cherche factures.referenceEB == payload.CODE
  ⑤ Si trouvé → crée/met à jour dans validations
     Si non trouvé → log avertissement (l'instructeur n'a pas encore
     saisi la référence EB, ce sera fait à l'étape ③ de factures.py)
"""

import json
import asyncio
import logging
import time
from datetime import datetime, date as date_type, timedelta

from kafka import KafkaConsumer
from sqlalchemy.orm import Session

from models.models import (
    Facture, Validation, Log,
    ActionLogEnum, StatutEtapeEnum
)
from schemas.database import SessionLocal
from settings import settings

logger = logging.getLogger("carthago_consumer")


class CarthagoConsumer:

    def __init__(self):
        self.consumer = None
        self.running  = False
        self.topic    = "carthago.carthago_budget.carthago"
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Reçoit la loop FastAPI depuis kafka_manager (pour WebSocket)."""
        self._loop = loop

    # ──────────────────────────────────────────────────────────────────────────

    def start(self) -> None:
        try:
            self.consumer = KafkaConsumer(
                self.topic,
                bootstrap_servers=[settings.KAFKA_BROKER],
                group_id="cfc-carthago-group",
                value_deserializer=lambda m: json.loads(m.decode("utf-8")) if m else None,
                auto_offset_reset="earliest",
                enable_auto_commit=True,
                max_poll_records=10
            )
            self.running = True
            logger.info(f"✅ CarthagoConsumer démarré → topic : {self.topic}")
            self._consume_messages()
        except Exception as e:
            logger.error(f"❌ Erreur démarrage CarthagoConsumer : {e}")
            self.running = False

    def _consume_messages(self) -> None:
        while self.running:
            try:
                for message in self.consumer:
                    payload = message.value

                    # Tombstone Kafka (message null = suppression de clé)
                    if payload is None:
                        continue

                    # Suppression logique injectée par ExtractNewRecordState
                    if payload.get("__deleted") in ("true", True):
                        logger.info(f"DELETE ignoré CODE={payload.get('CODE')}")
                        continue

                    self._process(payload)

            except Exception as e:
                logger.error(f"❌ Erreur consommation Carthago : {e}")
                time.sleep(2)

    # ──────────────────────────────────────────────────────────────────────────
    # Traitement principal
    # ──────────────────────────────────────────────────────────────────────────

    def _process(self, payload: dict) -> None:
        """
        Logique centrale — couvre uniquement le Cas 2 :
        L'instructeur a saisi la référence EB AVANT que Carthago n'insère la donnée.

        Le Cas 1 (Carthago déjà présent au moment de la saisie EB) est désormais
        géré directement dans factures.py → saisir_reference_eb().

        Ici on vérifie donc toujours si une validation existe déjà pour éviter
        le doublon dans le cas où les deux chemins se croisent.
        """
        db: Session = SessionLocal()
        try:
            code = payload.get("CODE") or payload.get("code")
            if not code:
                logger.warning(f"Payload sans CODE ignoré : {payload}")
                return

            # Cherche la facture dont la référence EB correspond au CODE Carthago
            facture = db.query(Facture).filter(
                Facture.referenceEB == code
            ).first()

            if not facture:
                # L'instructeur n'a pas encore saisi cette référence EB dans SUIFACT.
                # On ne peut rien faire pour l'instant.
                logger.info(
                    f"ℹ️ CODE={code} : aucune facture avec referenceEB='{code}'. "
                    f"En attente de la saisie EB par l'instructeur."
                )
                return

            # ── Vérification anti-doublon ─────────────────────────────────────────
            # saisir_reference_eb() a peut-être déjà créé cette validation
            # si Carthago avait la donnée au moment de la saisie EB.
            existing = db.query(Validation).filter(
                Validation.idFacture == facture.idFacture,
                Validation.CODE      == code
            ).first()

            if existing:
                # Mise à jour des colonnes Carthago uniquement (pas les colonnes SUIFACT)
                logger.info(f"🔄 Validation CODE={code} déjà existante → mise à jour")
                created = self._upsert_validation(db, facture, code, payload)
            else:
                # Création : l'instructeur a saisi l'EB mais Carthago n'avait pas encore
                # la donnée. Le consumer arrive maintenant avec la donnée fraîche.
                logger.info(f"✨ Nouvelle validation Carthago → CODE={code}")
                created = self._upsert_validation(db, facture, code, payload)

            db.commit()
            logger.info(
                f"{'✨ Créé' if created else '🔄 MàJ'} validation Carthago "
                f"CODE={code} → facture #{facture.idFacture}"
            )

            # Notifie les clients React de la mise à jour
            self._broadcast(facture)

        except Exception as e:
            db.rollback()
            logger.error(f"❌ Erreur traitement CODE={payload.get('CODE')} : {e}")
        finally:
            db.close()

        # ──────────────────────────────────────────────────────────────────────────
        # Upsert validation
        # ──────────────────────────────────────────────────────────────────────────

    def _upsert_validation(
        self,
        db:      Session,
        facture: Facture,
        code:    str,
        payload: dict,
    ) -> bool:
        """
        Crée ou met à jour la ligne dans validations.
        Retourne True si création, False si mise à jour.
        """

        # Extraire et convertir les champs Carthago
        description = payload.get("DESCRIPTION") or payload.get("description")
        documentdat = _to_date(payload.get("DOCUMENTDAT") or payload.get("documentdat"))
        type_       = payload.get("TYPE")        or payload.get("type")
        identifier  = payload.get("IDENTIFIER")  or payload.get("identifier")
        cuser       = payload.get("CUSER")       or payload.get("cuser")
        uuser       = payload.get("UUSER")       or payload.get("uuser")
        cdate       = _to_datetime(payload.get("CDATE") or payload.get("cdate"))
        udate       = _to_datetime(payload.get("UDATE") or payload.get("udate"))
        versionnum  = int(payload.get("VERSIONNUM") or payload.get("versionnum") or 1)
        withforcing = bool(payload.get("WITHFORCING") or payload.get("withforcing") or False)

        existing = db.query(Validation).filter(
            Validation.idFacture == facture.idFacture,
            Validation.CODE      == code
        ).first()

        if existing:
            # Mise à jour des colonnes Carthago uniquement
            # On ne touche pas aux colonnes SUIFACT (nomEtape, statutEtape, etc.)
            existing.DESCRIPTION  = description
            existing.DOCUMENTDATE = documentdat
            existing.TYPE         = type_
            existing.IDENTIFIER   = identifier
            existing.CUSER        = cuser
            existing.UUSER        = uuser
            existing.CDATE        = cdate
            existing.UDATE        = udate
            existing.VERSIONNUM   = versionnum
            existing.WITHFORCING  = withforcing

            db.add(Log(
                action       = ActionLogEnum.DONNEES_CARTHAGO_SYNCEES,
                commentaire  = f"Données Carthago mises à jour via consumer Kafka CODE={code}",
                topicKafka   = self.topic,
                idFacture    = facture.idFacture,
                idValidation = existing.idValidation
            ))
            return False

        else:
            v = Validation(
                CODE        = code,
                DESCRIPTION = description,
                DOCUMENTDATE= documentdat,
                TYPE        = type_,
                IDENTIFIER  = identifier,
                CUSER       = cuser,
                UUSER       = uuser,
                CDATE       = cdate,
                UDATE       = udate,
                VERSIONNUM  = versionnum,
                WITHFORCING = withforcing,
                # Colonnes SUIFACT générées automatiquement
                nomEtape    = f"Carthago — {type_ or 'Expression de besoin'}",
                statutEtape = StatutEtapeEnum.EN_COURS,
                dateDebut   = datetime.now(),
                idFacture   = facture.idFacture,
            )
            db.add(v)
            db.flush()

            db.add(Log(
                action        = ActionLogEnum.DONNEES_CARTHAGO_SYNCEES,
                nouveauStatut = StatutEtapeEnum.EN_COURS.value,
                commentaire   = f"Données Carthago synchronisées via consumer Kafka CODE={code}",
                topicKafka    = self.topic,
                idFacture     = facture.idFacture,
                idValidation  = v.idValidation
            ))
            return True

    # ──────────────────────────────────────────────────────────────────────────
    # Broadcast WebSocket
    # ──────────────────────────────────────────────────────────────────────────

    def _broadcast(self, facture: Facture) -> None:
        """Notifie les clients React que la facture a été mise à jour."""
        if self._loop is None or self._loop.is_closed():
            return
        try:
            from async_managers.websocket_manager import manager
            coro = manager.broadcast_facture_update({
                "idFacture":  facture.idFacture,
                "codeUnique": facture.codeUnique,
                "statut":     facture.statut.value,
                "referenceEB": facture.referenceEB,
                "updated_at":  datetime.now().isoformat(),
            })
            asyncio.run_coroutine_threadsafe(coro, self._loop)
        except Exception as e:
            logger.error(f"❌ Broadcast WebSocket échoué : {e}")

    # ──────────────────────────────────────────────────────────────────────────

    def stop(self) -> None:
        self.running = False
        if self.consumer:
            self.consumer.close()
        logger.info("⛔ CarthagoConsumer arrêté")


# ──────────────────────────────────────────────────────────────────────────────
# Utilitaires de conversion de dates
# Debezium encode les dates MySQL en entiers :
#   DATE     → jours depuis 1970-01-01
#   DATETIME → millisecondes depuis 1970-01-01 00:00:00 UTC
# ──────────────────────────────────────────────────────────────────────────────

def _to_date(value) -> "date_type | None":
    if value is None:
        return None
    try:
        if isinstance(value, int):
            return date_type(1970, 1, 1) + timedelta(days=value)
        if isinstance(value, str):
            return datetime.fromisoformat(value).date()
        if isinstance(value, date_type):
            return value
    except Exception:
        pass
    return None


def _to_datetime(value) -> "datetime | None":
    if value is None:
        return None
    try:
        if isinstance(value, int):
            return datetime.utcfromtimestamp(value / 1000)
        if isinstance(value, str):
            return datetime.fromisoformat(value)
        if isinstance(value, datetime):
            return value
    except Exception:
        pass
    return None


# Instance globale importée par kafka_manager
carthago_consumer = CarthagoConsumer()