"""
Scheduler des échéances de factures
====================================
Ce module contient le job cron qui tourne toutes les minutes
pour détecter les factures dont l'échéance vient de passer.

Fonctionnement :
  1. APScheduler déclenche `verifier_echeances()` toutes les minutes.
  2. La fonction cherche les factures actives dont dateEcheance <= maintenant.
  3. Pour chaque facture en retard sans alerte existante, elle :
       - crée une alerte DEPASSEMENT_DELAI pour chaque instructeur,
         superviseur et administrateur actif
       - loggue l'action dans la table logs
       - broadcaste une notification WebSocket à tous les clients connectés
  4. Anti-doublon : on vérifie qu'aucune alerte DEPASSEMENT_DELAI n'existe
     déjà pour cette facture avant d'en créer de nouvelles.

Intégration dans FastAPI :
  - start_scheduler() est appelé dans @app.on_event("startup")
  - stop_scheduler()  est appelé dans @app.on_event("shutdown")
"""

import asyncio
import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from schemas.database import SessionLocal
from models.models import (
    Facture, Alerte, Log, Utilisateur,
    StatutFactureEnum, TypeAlerteEnum,
    ActionLogEnum, RoleEnum
)
from settings import settings

logger = logging.getLogger("echeance_scheduler")

# Instance globale du scheduler — initialisée une seule fois au démarrage
_scheduler = BackgroundScheduler(timezone="Africa/Douala")


# ─────────────────────────────────────────────────────────────────────────────
# Fonction utilitaire : calcule et persiste les échéances manquantes
# ─────────────────────────────────────────────────────────────────────────────

def _calculer_echeances_manquantes(db: Session) -> int:
    """
    Parcourt toutes les factures qui n'ont pas encore de dateEcheance
    et leur en attribue une automatiquement.

    dateEcheance = dateReception + DELAI_ECHEANCE_MINUTES minutes

    Retourne le nombre de factures mises à jour.
    """
    # Statuts terminaux : ces factures n'ont plus besoin d'échéance
    statuts_termines = [StatutFactureEnum.VALIDE, StatutFactureEnum.PAYE]

    factures_sans_echeance = db.query(Facture).filter(
        Facture.dateEcheance.is_(None),          # pas encore d'échéance
        Facture.dateReception.isnot(None),       # mais a une date de réception
        Facture.statut.notin_(statuts_termines)  # et n'est pas terminée
    ).all()

    count = 0
    for facture in factures_sans_echeance:
        facture.dateEcheance = facture.dateReception + timedelta(
            minutes=settings.DELAI_ECHEANCE_MINUTES
        )
        count += 1

    if count > 0:
        db.flush()
        logger.info(f"📅 {count} échéance(s) calculée(s) automatiquement")

    return count


# ─────────────────────────────────────────────────────────────────────────────
# Job principal : vérifie les dépassements
# ─────────────────────────────────────────────────────────────────────────────

def verifier_echeances() -> None:
    """
    Job exécuté toutes les minutes par APScheduler.

    Étapes :
      1. Calcule les échéances manquantes (nouvelles factures)
      2. Cherche les factures en retard sans alerte existante
      3. Récupère tous les utilisateurs à notifier (instructeur + superviseur + admin)
      4. Crée une alerte par utilisateur concerné
      5. Loggue l'action
      6. Broadcaste via WebSocket (thread-safe avec run_coroutine_threadsafe)
    """
    db: Session = SessionLocal()
    try:
        maintenant = datetime.now()

        # ── Étape 1 : calculer les échéances manquantes ───────────────────────
        _calculer_echeances_manquantes(db)

        # ── Étape 2 : factures en retard sans alerte de dépassement ───────────
        # On exclut les factures déjà soldées (VALIDE, PAYE)
        # et celles qui ont déjà une alerte DEPASSEMENT_DELAI.
        statuts_termines = [StatutFactureEnum.VALIDE, StatutFactureEnum.PAYE]

        # Sous-requête : idFacture des factures qui ont DÉJÀ une alerte.
        # On utilise select() explicite plutôt que subquery() pour éviter
        # le SAWarning "Coercing Subquery object into a select()".
        from sqlalchemy import select
        factures_deja_alertees = select(Alerte.idFacture).where(
            Alerte.typeAlerte == TypeAlerteEnum.DEPASSEMENT_DELAI
        )

        # Factures en retard sans alerte.
        # dateEcheance est maintenant un DateTime — comparaison directe possible.
        factures_en_retard = db.query(Facture).filter(
            Facture.dateEcheance.isnot(None),                  # a une échéance
            Facture.dateEcheance <= maintenant,                # échéance passée
            Facture.statut.notin_(statuts_termines),           # non terminée
            Facture.idFacture.notin_(factures_deja_alertees)   # pas encore alertée
        ).all()

        if not factures_en_retard:
            # Rien à faire — log silencieux pour ne pas polluer les logs
            return

        logger.info(
            f"⏰ {len(factures_en_retard)} facture(s) en retard détectée(s)"
        )

        # ── Étape 3 : utilisateurs à notifier ────────────────────────────────
        # On notifie instructeur, superviseur ET administrateur
        roles_a_notifier = [
            RoleEnum.INSTRUCTEUR,
            RoleEnum.SUPERVISEUR,
            RoleEnum.ADMINISTRATEUR,
        ]

        utilisateurs_cibles = db.query(Utilisateur).filter(
            Utilisateur.role.in_(roles_a_notifier),
            Utilisateur.actif == True    # seulement les comptes actifs
        ).all()

        if not utilisateurs_cibles:
            logger.warning("⚠️ Aucun utilisateur actif à notifier")
            return

        alertes_creees = []  # on les collecte pour le broadcast WebSocket

        for facture in factures_en_retard:

            # Calcul du retard en minutes — soustraction directe possible
            # car dateEcheance est maintenant un DateTime comme maintenant.
            retard_minutes = int(
                (maintenant - facture.dateEcheance).total_seconds() / 60
            )
            retard_txt = (
                f"{retard_minutes} minute(s)"
                if retard_minutes < 60
                else f"{retard_minutes // 60}h{retard_minutes % 60:02d}"
            )

            # ── Étape 4 : créer une alerte par utilisateur cible ─────────────
            for utilisateur in utilisateurs_cibles:
                alerte = Alerte(
                    typeAlerte    = TypeAlerteEnum.DEPASSEMENT_DELAI,
                    message       = (
                        f"Facture {facture.codeUnique} — échéance dépassée "
                        f"de {retard_txt}. "
                        f"Réception le "
                        f"{facture.dateReception.strftime('%d/%m/%Y %H:%M') if facture.dateReception else '—'}."
                    ),
                    lue           = False,
                    idFacture     = facture.idFacture,
                    idUtilisateur = utilisateur.idUtilisateur,
                )
                db.add(alerte)
                alertes_creees.append((facture, alerte))

            # ── Étape 5 : log de l'action ─────────────────────────────────────
            db.add(Log(
                action        = ActionLogEnum.ALERTE_DECLENCHEE,
                ancienStatut  = facture.statut.value,
                nouveauStatut = facture.statut.value,
                commentaire   = (
                    f"Alerte dépassement délai — retard : {retard_txt} "
                    f"— {len(utilisateurs_cibles)} utilisateur(s) notifié(s)"
                ),
                idFacture     = facture.idFacture,
            ))

            logger.info(
                f"🔔 Alerte créée : facture #{facture.idFacture} "
                f"({facture.codeUnique}) — retard {retard_txt}"
            )

        # Commit global : toutes les alertes et logs d'un coup
        db.commit()

        # ── Étape 6 : broadcast WebSocket ────────────────────────────────────
        # APScheduler tourne dans un thread séparé (BackgroundScheduler).
        # On ne peut pas faire `await` directement ici.
        # On récupère la loop asyncio de FastAPI et on y soumet nos coroutines.
        _broadcast_alertes(alertes_creees)

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Erreur dans verifier_echeances : {e}", exc_info=True)
    finally:
        db.close()


def _broadcast_alertes(alertes: list) -> None:
    """
    Envoie une notification WebSocket pour chaque alerte créée.
    Gère le passage thread → asyncio avec run_coroutine_threadsafe.

    On ne broadcast qu'une seule fois par facture (pas une fois par utilisateur)
    pour éviter d'inonder les clients connectés.
    """
    # Dédoublonnage : une seule notification par facture
    factures_vues = set()
    alertes_uniques = []
    for facture, alerte in alertes:
        if facture.idFacture not in factures_vues:
            factures_vues.add(facture.idFacture)
            alertes_uniques.append((facture, alerte))

    if not alertes_uniques:
        return

    try:
        # Import ici pour éviter une dépendance circulaire au chargement
        from async_managers.websocket_manager import manager
        import asyncio

        # Récupère la loop FastAPI courante
        # (fonctionne car le scheduler démarre après FastAPI)
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            logger.warning("⚠️ Pas de loop asyncio disponible pour le broadcast")
            return

        if loop.is_closed():
            return

        for facture, alerte in alertes_uniques:
            coro = manager.broadcast_alerte({
                "idFacture":   facture.idFacture,
                "codeFacture": facture.codeUnique,
                "typeAlerte":  TypeAlerteEnum.DEPASSEMENT_DELAI.value,
                "message":     alerte.message,
                "dateEmission": datetime.now().isoformat(),
            })
            # Soumet la coroutine dans la loop FastAPI depuis ce thread
            asyncio.run_coroutine_threadsafe(coro, loop)

    except Exception as e:
        # Non bloquant : une erreur WebSocket ne doit pas annuler les alertes BD
        logger.error(f"❌ Erreur broadcast alertes : {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Démarrage / arrêt du scheduler
# Appelés par main.py dans les hooks startup / shutdown
# ─────────────────────────────────────────────────────────────────────────────

def start_scheduler() -> None:
    """
    Démarre le scheduler et enregistre le job de vérification des échéances.
    Appelé une seule fois au démarrage de FastAPI.

    Le job tourne toutes les minutes (interval=1).
    Pour la production, on peut passer à interval=5 ou interval=10
    pour réduire la charge sur la base de données.
    """
    _scheduler.add_job(
        func     = verifier_echeances,
        trigger  = "interval",
        minutes  = 1,          # vérifie toutes les minutes
        id       = "echeance_check",
        name     = "Vérification des échéances de factures",
        replace_existing = True,   # évite les doublons si restart
    )
    _scheduler.start()
    logger.info(
        f"✅ Scheduler démarré — vérification toutes les minutes "
        f"(délai échéance : {settings.DELAI_ECHEANCE_MINUTES} min)"
    )


def stop_scheduler() -> None:
    """
    Arrête proprement le scheduler.
    Appelé dans le hook shutdown de FastAPI.
    """
    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("⛔ Scheduler arrêté")