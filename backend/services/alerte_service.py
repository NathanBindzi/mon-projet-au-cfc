"""
Service de génération automatique des alertes.

Appelé :
  1. Au démarrage de FastAPI (60s après pour laisser la DB s'initialiser)
  2. Toutes les heures via un thread daemon
  3. Manuellement via POST /api/alertes/verifier

Génère 2 types d'alertes automatiques :
  - DEPASSEMENT_DELAI  : dateEcheance dépassée + statut actif (pas VALIDE/PAYE)
  - PIECE_MANQUANTE    : EN_INSTRUCTION depuis > 5 jours sans aucune validation

BLOCAGE_DOSSIER est déjà créé directement dans factures.py au moment du blocage,
donc ce service ne le régénère pas (évite les doublons).
"""

import logging
import threading
import time
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from schemas.database import SessionLocal
from models.models import (
    Facture, Alerte, Log, Validation,
    StatutFactureEnum, TypeAlerteEnum, ActionLogEnum
)

logger = logging.getLogger("alerte_service")

# ── Seuils configurables ──────────────────────────────────────────────────────
# Nombre de jours en EN_INSTRUCTION sans validation avant d'alerter "pièce manquante"
SEUIL_SANS_VALIDATION_JOURS = 1

# Vérification toutes les heures (en secondes)
INTERVALLE_SECONDES = 3600


def verifier_et_creer_alertes() -> dict:
    """
    Scanne toutes les factures actives et crée les alertes manquantes.

    La clé anti-doublon : on vérifie qu'il n'existe pas déjà une alerte
    non lue (lue=False) du même type pour la même facture.
    Quand le superviseur marque l'alerte comme lue, la prochaine vérification
    peut recréer une alerte si le problème persiste.

    Retourne un dict résumant les alertes créées (utile pour l'endpoint manuel).
    """
    db: Session = SessionLocal()
    resultats = {"depassements_delai": 0, "pieces_manquantes": 0, "total": 0}

    try:
        aujourd_hui = date.today()

        # ── 1. DEPASSEMENT_DELAI ──────────────────────────────────────────────
        # Factures avec dateEcheance dépassée, statut encore actif
        factures_en_retard = db.query(Facture).filter(
            Facture.dateEcheance.isnot(None),
            Facture.dateEcheance < aujourd_hui,
            Facture.statut.notin_([
                StatutFactureEnum.VALIDE,
                StatutFactureEnum.PAYE,
                StatutFactureEnum.BLOQUE,  # déjà alerté via factures.py
            ])
        ).all()

        for facture in factures_en_retard:
            # Anti-doublon : une seule alerte active (non lue) par facture
            deja_alerte = db.query(Alerte).filter(
                Alerte.idFacture  == facture.idFacture,
                Alerte.typeAlerte == TypeAlerteEnum.DEPASSEMENT_DELAI,
                Alerte.lue        == False,
            ).first()

            if not deja_alerte:
                jours_retard = (aujourd_hui - facture.dateEcheance).days

                db.add(Alerte(
                    typeAlerte    = TypeAlerteEnum.DEPASSEMENT_DELAI,
                    message       = (
                        f"La facture {facture.codeUnique} a dépassé son échéance "
                        f"de {jours_retard} jour{'s' if jours_retard > 1 else ''}. "
                        f"Statut actuel : {facture.statut.value}. Action requise."
                    ),
                    lue           = False,
                    idFacture     = facture.idFacture,
                    idUtilisateur = facture.idUtilisateur,
                ))

                # Log pour la traçabilité complète
                db.add(Log(
                    action       = ActionLogEnum.ALERTE_DECLENCHEE,
                    nouveauStatut = TypeAlerteEnum.DEPASSEMENT_DELAI.value,
                    commentaire  = f"Alerte auto : {jours_retard}j de retard",
                    idFacture    = facture.idFacture,
                ))

                resultats["depassements_delai"] += 1
                logger.info(f"⚠️ DEPASSEMENT_DELAI → {facture.codeUnique} ({jours_retard}j)")

        # ── 2. PIECE_MANQUANTE ────────────────────────────────────────────────
        # Factures en EN_INSTRUCTION depuis > SEUIL jours sans aucune validation
        seuil_date = datetime.now() - timedelta(days=SEUIL_SANS_VALIDATION_JOURS)

        # IDs des factures qui ont au moins une validation
        factures_avec_validation = db.query(Validation.idFacture).distinct().subquery()

        factures_inactives = db.query(Facture).filter(
            Facture.statut       == StatutFactureEnum.EN_INSTRUCTION,
            Facture.dateReception <= seuil_date,
            # Exclut les factures qui ont déjà au moins une validation
            Facture.idFacture.notin_(
                db.query(Validation.idFacture).distinct()
            ),
        ).all()

        for facture in factures_inactives:
            deja_alerte = db.query(Alerte).filter(
                Alerte.idFacture  == facture.idFacture,
                Alerte.typeAlerte == TypeAlerteEnum.PIECE_MANQUANTE,
                Alerte.lue        == False,
            ).first()

            if not deja_alerte:
                jours = (datetime.now() - facture.dateReception).days

                db.add(Alerte(
                    typeAlerte    = TypeAlerteEnum.PIECE_MANQUANTE,
                    message       = (
                        f"La facture {facture.codeUnique} est en instruction depuis "
                        f"{jours} jour{'s' if jours > 1 else ''} sans aucune étape "
                        f"de traitement. Vérifier les pièces justificatives."
                    ),
                    lue           = False,
                    idFacture     = facture.idFacture,
                    idUtilisateur = facture.idUtilisateur,
                ))

                db.add(Log(
                    action        = ActionLogEnum.ALERTE_DECLENCHEE,
                    nouveauStatut = TypeAlerteEnum.PIECE_MANQUANTE.value,
                    commentaire   = f"Alerte auto : aucune validation après {jours}j",
                    idFacture     = facture.idFacture,
                ))

                resultats["pieces_manquantes"] += 1
                logger.info(f"⚠️ PIECE_MANQUANTE → {facture.codeUnique} ({jours}j sans action)")

        db.commit()
        resultats["total"] = resultats["depassements_delai"] + resultats["pieces_manquantes"]
        logger.info(f"✅ Vérification alertes : {resultats}")
        return resultats

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Erreur vérification alertes : {e}")
        return resultats
    finally:
        db.close()


def _boucle_periodique():
    """
    Thread daemon qui vérifie les alertes toutes les heures.
    Attend 60s au démarrage pour laisser la DB s'initialiser.
    """
    time.sleep(60)  # délai initial
    logger.info("🕐 Scheduler alertes démarré — vérification toutes les heures")

    while True:
        try:
            verifier_et_creer_alertes()
        except Exception as e:
            logger.error(f"❌ Boucle alertes : {e}")
        time.sleep(INTERVALLE_SECONDES)


def start_alerte_scheduler():
    """
    Lance le thread de vérification périodique en arrière-plan.
    Appeler depuis @app.on_event("startup") dans main.py.
    """
    t = threading.Thread(
        target=_boucle_periodique,
        daemon=True,  # s'arrête automatiquement avec FastAPI
        name="alerte-scheduler"
    )
    t.start()
    logger.info("✅ Thread scheduler alertes lancé")
    return t