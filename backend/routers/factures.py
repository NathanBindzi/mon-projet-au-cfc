"""
Router : Factures
Adapté aux modèles existants :
- FactureCourrier (table de jonction)
- Courrier (avec parcours, position, objet_courrier)
- Facture (entité centrale)
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime
import json

from schemas.database import get_db
from models.models import (
    Facture, Courrier, FactureCourrier, Utilisateur,
    Log, Validation, StatutFactureEnum, StatutEtapeEnum,
    ActionLogEnum, TicketEB
)
from services.auth_service import get_utilisateur_actuel, verifier_role
from async_managers.websocket_manager import manager

router = APIRouter()


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _generer_code_unique() -> str:
    """Génère un code unique horodaté pour une facture"""
    return f"FACTURE-{datetime.now().strftime('%Y%m%d%H%M%S')}"


def _creer_facture_depuis_courrier(
    db: Session,
    courrier: Courrier,
    id_utilisateur: Optional[int],
    date_echeance: Optional[date] = None,
    topic_kafka: Optional[str] = None,
) -> Facture:
    """
    Crée une facture et l'associe au courrier via FactureCourrier.
    Enregistre un log de la création.
    """
    facture = Facture(
        codeUnique    = _generer_code_unique(),
        idUtilisateur = id_utilisateur,
        dateEcheance  = date_echeance,
        dateReception = datetime.now()
    )
    db.add(facture)
    db.flush()  # On récupère l'idFacture sans commit

    # Association many-to-many courrier ↔ facture
    association = FactureCourrier(
        idFacture      = facture.idFacture,
        idCourrier     = courrier.idCourrier,
        dateAssociation = datetime.now()
    )
    db.add(association)
    db.flush()

    # Log de création
    log = Log(
        action        = ActionLogEnum.FACTURE_CREEE,
        nouveauStatut = StatutFactureEnum.RECEPTIONNE.value,
        commentaire   = f"Facture créée depuis le courrier {courrier.numero_courrier}",
        topicKafka    = topic_kafka,
        idFacture     = facture.idFacture,
        idUtilisateur = id_utilisateur
    )
    db.add(log)
    return facture
# ─────────────────────────────────────────

# ─────────────────────────────────────────
# SCHÉMAS Pydantic
# ─────────────────────────────────────────

class CourrierInfoResponse(BaseModel):
    """Infos courrier incluses dans la réponse facture"""
    idCourrier:      int
    numero_courrier: str
    objet_courrier:  Optional[str]
    expediteur:      Optional[str]
    destinataire:    Optional[str]
    position:        Optional[str]   # Service actuel du courrier
    parcours:        Optional[str]   # Parcours complet ex: "DSI,DG,DCF"
    created_at:      Optional[datetime]

    class Config:
        from_attributes = True


class FactureCreate(BaseModel):
    """Données pour créer une facture manuellement"""
    idCourrier:   int
    dateEcheance: Optional[datetime] = None


class FactureResponse(BaseModel):
    """Réponse complète d'une facture avec ses courriers"""
    idFacture:     int
    codeUnique:    str
    referenceEB:   Optional[str]
    statut:        str
    dateReception: Optional[datetime]
    dateEcheance:  Optional[datetime]
    idUtilisateur: Optional[int]
    courriers:     List[CourrierInfoResponse] = []
    created_at:    Optional[datetime]
    updated_at:    Optional[datetime]

    class Config:
        from_attributes = True


class FactureSyncItem(BaseModel):
    idFacture:       int
    idCourrier:      int
    codeUnique:      str
    numero_courrier: str


class FactureSyncResponse(BaseModel):
    total_courriers:     int
    factures_existantes: int
    factures_creees:     int
    factures:            List[FactureSyncItem]


class ChangerStatutSchema(BaseModel):
    """Données pour changer le statut"""
    statut:      StatutFactureEnum
    commentaire: Optional[str] = None


class SaisirEBSchema(BaseModel):
    """Données pour saisir la référence EB"""
    referenceEB: str
    

# ─────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────

@router.get(
    "/",
    response_model=List[FactureResponse],
    summary="Lister toutes les factures avec leurs courriers"
)
def lister_factures(
    statut: Optional[str] = Query(None),
    skip:   int           = Query(0),
    limit:  int           = Query(50),
    db:     Session       = Depends(get_db),
    _:      Utilisateur   = Depends(get_utilisateur_actuel)
):
    """
    Retourne toutes les factures avec les courriers associés.
    Chaque facture inclut : position (service actuel), objet,
    expéditeur et parcours depuis la table courriers.
    """
    query = db.query(Facture).options(
        joinedload(Facture.courriers)
    )
    if statut:
        query = query.filter(Facture.statut == statut)

    return query.order_by(
        Facture.created_at.desc()
    ).offset(skip).limit(limit).all()


@router.get(
    "/dashboard/stats",
    summary="Statistiques tableau de bord"
)
def get_dashboard_stats(
    db: Session     = Depends(get_db),
    _:  Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    KPIs pour le tableau de bord superviseur.
    Inclut :
    - Répartition par statut
    - Délai moyen de traitement (dateReception → updated_at)
    - Taux de factures en retard (dateEcheance dépassée et non payées)
    - Durée moyenne par service (position du courrier associé)
    - Nombre de blocages (logs DOSSIER_BLOQUE)
    - Taux de traçabilité (factures avec au moins une validation / total)
    """
    from sqlalchemy import func, case
    from models.models import Alerte, Validation, Log, Courrier, FactureCourrier

    # ── Comptages par statut ──────────────────────────────────────────────────
    stats_statut = db.query(
        Facture.statut,
        func.count(Facture.idFacture).label("total")
    ).group_by(Facture.statut).all()

    total            = db.query(func.count(Facture.idFacture)).scalar() or 0
    alertes_non_lues = db.query(
        func.count(Alerte.idAlerte)
    ).filter(Alerte.lue == False).scalar() or 0

    # ── Délai moyen de traitement (en jours) ─────────────────────────────────
    # Factures ayant une date de réception ET une date de mise à jour
    factures_terminees = db.query(Facture).filter(
        Facture.dateReception.isnot(None),
        Facture.updated_at.isnot(None),
        Facture.statut.in_([
            StatutFactureEnum.VALIDE,
            StatutFactureEnum.PAYE,
            StatutFactureEnum.EB_SAISI,
        ])
    ).all()

    if factures_terminees:
        delais = []
        for f in factures_terminees:
            delta = (f.updated_at - f.dateReception).days
            if delta >= 0:
                delais.append(delta)
        delai_moyen_jours = round(sum(delais) / len(delais), 1) if delais else 0
    else:
        delai_moyen_jours = 0

    # ── Taux de factures en retard ────────────────────────────────────────────
    # Factures dont la dateEcheance est dépassée et qui ne sont ni VALIDE ni PAYE
    from datetime import date as date_type
    aujourd_hui = date_type.today()

    total_avec_echeance = db.query(func.count(Facture.idFacture)).filter(
        Facture.dateEcheance.isnot(None)
    ).scalar() or 0

    en_retard = db.query(func.count(Facture.idFacture)).filter(
        Facture.dateEcheance.isnot(None),
        Facture.dateEcheance < aujourd_hui,
        Facture.statut.notin_([
            StatutFactureEnum.VALIDE,
            StatutFactureEnum.PAYE,
        ])
    ).scalar() or 0

    taux_retard = round((en_retard / total_avec_echeance * 100), 1) if total_avec_echeance > 0 else 0

    # ── Durée moyenne par service (position du courrier) ─────────────────────
    # On regroupe les factures par position de leur premier courrier associé
    # et on calcule la durée moyenne de traitement pour chaque service
    factures_avec_courrier = db.query(Facture, Courrier).join(
        FactureCourrier, FactureCourrier.idFacture == Facture.idFacture
    ).join(
        Courrier, Courrier.idCourrier == FactureCourrier.idCourrier
    ).filter(
        Facture.dateReception.isnot(None),
        Facture.updated_at.isnot(None),
        Courrier.position.isnot(None)
    ).all()

    durees_par_service: dict = {}
    for facture, courrier in factures_avec_courrier:
        service = courrier.position.strip() if courrier.position else "Inconnu"
        if not service:
            continue
        delta = (facture.updated_at - facture.dateReception).days
        if delta >= 0:
            if service not in durees_par_service:
                durees_par_service[service] = []
            durees_par_service[service].append(delta)

    duree_par_service = [
        {
            "service": service,
            "duree_moyenne_jours": round(sum(durees) / len(durees), 1),
            "nombre_factures": len(durees)
        }
        for service, durees in sorted(
            durees_par_service.items(),
            key=lambda x: sum(x[1]) / len(x[1]),
            reverse=True
        )
    ]

    # ── Nombre de blocages ────────────────────────────────────────────────────
    from models.models import ActionLogEnum as ALE
    nombre_blocages = db.query(func.count(Log.idLog)).filter(
        Log.action == ALE.DOSSIER_BLOQUE
    ).scalar() or 0

    # ── Taux de traçabilité ───────────────────────────────────────────────────
    # Factures ayant au moins une validation enregistrée / total
    factures_tracees = db.query(
        func.count(func.distinct(Validation.idFacture))
    ).scalar() or 0

    taux_tracabilite = round((factures_tracees / total * 100), 1) if total > 0 else 0

    return {
        # Comptages classiques
        "total":            total,
        "alertes_non_lues": alertes_non_lues,
        "par_statut": [
            {"statut": s[0], "total": s[1]}
            for s in stats_statut
        ],
        # Nouveaux KPIs
        "delai_moyen_jours":    delai_moyen_jours,
        "taux_retard":          taux_retard,          # en %
        "en_retard":            en_retard,
        "nombre_blocages":      nombre_blocages,
        "taux_tracabilite":     taux_tracabilite,     # en %
        "factures_tracees":     factures_tracees,
        "duree_par_service":    duree_par_service,    # liste triée par durée desc
    }


@router.get(
    "/recherche",
    response_model=List[FactureResponse],
    summary="Rechercher une facture"
)
def rechercher_facture(
    q:  str         = Query(...),
    db: Session     = Depends(get_db),
    _:  Utilisateur = Depends(get_utilisateur_actuel)
):
    """Recherche par code unique ou référence EB"""
    return db.query(Facture).options(
        joinedload(Facture.courriers)
    ).filter(
        (Facture.codeUnique.like(f"%{q}%")) |
        (Facture.referenceEB.like(f"%{q}%"))
    ).all()


@router.post(
    "/synchroniser-courriers",
    response_model=FactureSyncResponse,
    summary="Créer les factures manquantes depuis les courriers"
)
def synchroniser_courriers_factures(
    db:          Session     = Depends(get_db),
    utilisateur: Utilisateur = Depends(verifier_role([
        "AGENT_COURRIER", "INSTRUCTEUR",
        "SUPERVISEUR", "ADMINISTRATEUR"
    ]))
):
    """
    Parcourt tous les courriers importés depuis Mailsoft.
    Pour chaque courrier sans facture associée, crée une facture
    et l'associe via la table facture_courrier.
    Endpoint clé pour initialiser les factures depuis les courriers.
    """
    total_courriers = db.query(Courrier).count()

    # Courriers qui n'ont pas encore de facture
    courriers_sans_facture = db.query(Courrier).outerjoin(
        FactureCourrier,
        FactureCourrier.idCourrier == Courrier.idCourrier
    ).filter(
        FactureCourrier.idFactureCourrier.is_(None)
    ).all()

    factures_creees = []
    for courrier in courriers_sans_facture:
        facture = _creer_facture_depuis_courrier(
            db             = db,
            courrier       = courrier,
            id_utilisateur = utilisateur.idUtilisateur,
            topic_kafka    = "mailsoft.mailsoft.mailsoft"
        )
        factures_creees.append({
            "idFacture":       facture.idFacture,
            "idCourrier":      courrier.idCourrier,
            "codeUnique":      facture.codeUnique,
            "numero_courrier": courrier.numero_courrier
        })

    db.commit()

    # Nombre de courriers déjà associés
    factures_existantes = db.query(Courrier).join(
        FactureCourrier,
        FactureCourrier.idCourrier == Courrier.idCourrier
    ).distinct().count()

    return {
        "total_courriers":     total_courriers,
        "factures_existantes": factures_existantes,
        "factures_creees":     len(factures_creees),
        "factures":            factures_creees
    }


@router.get(
    "/{id_facture}",
    summary="Détail complet d'une facture"
)
def get_facture(
    id_facture: int,
    db:         Session     = Depends(get_db),
    _:          Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    Retourne la facture complète avec :
    courriers, validations, ticket, alertes, logs.
    Utilisé par DetailFacture.jsx.
    """
    facture = db.query(Facture).options(
        joinedload(Facture.courriers),
        joinedload(Facture.instructeur),
        joinedload(Facture.validations),
        joinedload(Facture.ticket),
        joinedload(Facture.alertes),
        joinedload(Facture.logs)
    ).filter(Facture.idFacture == id_facture).first()

    if not facture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Facture introuvable"
        )

    return {
        "idFacture":     facture.idFacture,
        "codeUnique":    facture.codeUnique,
        "referenceEB":   facture.referenceEB,
        "statut":        facture.statut,
        "dateReception": facture.dateReception,
        "dateEcheance":  facture.dateEcheance,
        "courriers":     facture.courriers,
        "instructeur":   facture.instructeur,
        "validations":   facture.validations,
        "ticket":        facture.ticket,
        "alertes":       facture.alertes,
        "logs":          facture.logs
    }


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
    summary="Créer manuellement une facture"
)
def creer_facture(
    data:        FactureCreate,
    db:          Session     = Depends(get_db),
    utilisateur: Utilisateur = Depends(get_utilisateur_actuel)
):
    """Création manuelle d'une facture depuis un courrier existant"""
    courrier = db.query(Courrier).filter(
        Courrier.idCourrier == data.idCourrier
    ).first()
    if not courrier:
        raise HTTPException(404, "Courrier introuvable")

    # Vérifier qu'aucune facture n'existe déjà pour ce courrier
    existante = db.query(FactureCourrier).filter(
        FactureCourrier.idCourrier == data.idCourrier
    ).first()
    if existante:
        raise HTTPException(400, "Une facture existe déjà pour ce courrier")

    nouvelle_facture = _creer_facture_depuis_courrier(
        db             = db,
        courrier       = courrier,
        id_utilisateur = utilisateur.idUtilisateur,
        date_echeance  = data.dateEcheance
    )
    db.commit()
    db.refresh(nouvelle_facture)

    return {
        "message":    "Facture créée avec succès",
        "idFacture":  nouvelle_facture.idFacture,
        "codeUnique": nouvelle_facture.codeUnique
    }


@router.put(
    "/{id_facture}/statut",
    summary="Changer le statut d'une facture"
)
async def changer_statut(
    id_facture:  int,
    data:        ChangerStatutSchema,
    db:          Session     = Depends(get_db),
    utilisateur: Utilisateur = Depends(verifier_role([
        "INSTRUCTEUR", "VALIDATEUR",
        "SUPERVISEUR", "ADMINISTRATEUR"
    ]))
):
    """
    Change le statut et broadcaste via WebSocket.
    Le frontend React reçoit la mise à jour en temps réel.
    """
    facture = db.query(Facture).options(
        joinedload(Facture.courriers)
    ).filter(Facture.idFacture == id_facture).first()

    if not facture:
        raise HTTPException(404, "Facture introuvable")
    
    if facture.statut == StatutFactureEnum.PAYE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de modifier le statut d'une facture déjà payée."
        )

    ancien_statut  = facture.statut
    facture.statut = data.statut
    facture.updated_at = datetime.now()

    log = Log(
        action        = ActionLogEnum.STATUT_CHANGE,
        ancienStatut  = ancien_statut.value,
        nouveauStatut = data.statut.value,
        commentaire   = data.commentaire,
        idFacture     = id_facture,
        idUtilisateur = utilisateur.idUtilisateur
    )
    db.add(log)
    db.commit()

    # Broadcast WebSocket → React reçoit la mise à jour
    await manager.broadcast_facture_update({
        "idFacture":  facture.idFacture,
        "codeUnique": facture.codeUnique,
        "statut":     facture.statut.value,
        "referenceEB": facture.referenceEB,
        "updated_at": facture.updated_at.isoformat()
    })

    return {
        "message":        "Statut mis à jour",
        "ancien_statut":  ancien_statut.value,
        "nouveau_statut": data.statut.value
    }


@router.put(
    "/{id_facture}/reference-eb",
    summary="Saisir la référence EB — point de bascule Mailsoft/Carthago"
)
async def saisir_reference_eb(
    id_facture:  int,
    data:        SaisirEBSchema,
    db:          Session     = Depends(get_db),
    utilisateur: Utilisateur = Depends(verifier_role([
        "INSTRUCTEUR", "ADMINISTRATEUR"
    ]))
):
    """
    Saisit la référence EB et :
    1. Passe le statut à EB_SAISI
    2. Génère automatiquement un ticket EB
    3. Importe immédiatement les données Carthago liées à cette référence EB
       en interrogeant directement la base carthago_budget
    4. Broadcaste la mise à jour via WebSocket
    """
    import uuid as uuid_lib
    import logging
    from sqlalchemy import create_engine, text
    from models.models import Validation, StatutEtapeEnum

    logger = logging.getLogger("saisir_reference_eb")

    facture = db.query(Facture).options(
        joinedload(Facture.courriers)
    ).filter(Facture.idFacture == id_facture).first()

    if not facture:
        raise HTTPException(404, "Facture introuvable")

    ancien_statut       = facture.statut
    facture.referenceEB = data.referenceEB
    facture.statut      = StatutFactureEnum.EB_SAISI
    facture.updated_at  = datetime.now()

    # ── Génération automatique du ticket EB ────────────────────────────────
    ticket_existant = db.query(TicketEB).filter(
        TicketEB.idFacture == id_facture
    ).first()

    code_ticket = None
    if not ticket_existant:
        annee       = datetime.now().year
        code_court  = str(uuid_lib.uuid4())[:8].upper()
        code_ticket = f"TK-{annee}-{code_court}"

        ticket = TicketEB(
            codeTicket    = code_ticket,
            idFacture     = id_facture,
            idUtilisateur = utilisateur.idUtilisateur
        )
        db.add(ticket)

        db.add(Log(
            action        = ActionLogEnum.TICKET_EB_GENERE,
            commentaire   = f"Ticket généré automatiquement : {code_ticket}",
            idFacture     = id_facture,
            idUtilisateur = utilisateur.idUtilisateur
        ))
    else:
        code_ticket = ticket_existant.codeTicket

    # ── Log saisie EB ─────────────────────────────────────────────────────────
    db.add(Log(
        action        = ActionLogEnum.REFERENCE_EB_SAISIE,
        ancienStatut  = ancien_statut.value,
        nouveauStatut = StatutFactureEnum.EB_SAISI.value,
        commentaire   = f"Référence EB saisie : {data.referenceEB}",
        idFacture     = id_facture,
        idUtilisateur = utilisateur.idUtilisateur
    ))

    # ── Import immédiat des données Carthago ──────────────────────────────────
    # On interroge directement carthago_budget.carthago avec le CODE == referenceEB.
    # Si Carthago contient déjà la ligne, on crée la validation immédiatement.
    # Si Carthago ne l'a pas encore, ce sera le carthago_consumer qui s'en chargera
    # dès que la donnée arrivera dans le topic Kafka (Cas 2 toujours couvert).
    carthago_importe = False
    try:
        # Connexion séparée vers la base Carthago
        # (indépendante de la session cfc_db en cours)
        carthago_engine = create_engine(
            "mysql+pymysql://root:root_secret_2026@127.0.0.1:3306/carthago_budget",
            pool_pre_ping=True   # vérifie la connexion avant d'exécuter la requête
        )

        with carthago_engine.connect() as carthago_conn:
            # Cherche dans carthago toutes les lignes dont CODE == referenceEB saisie
            result = carthago_conn.execute(
                text("SELECT * FROM carthago WHERE CODE = :code"),
                {"code": data.referenceEB}
            ).fetchone()

        if result:
            # Vérifie qu'une validation n'existe pas déjà pour éviter le doublon
            existing = db.query(Validation).filter(
                Validation.idFacture == id_facture,
                Validation.CODE      == data.referenceEB
            ).first()

            if not existing:
                # Convertit le résultat en dictionnaire pour accéder aux colonnes
                row = result._mapping

                validation = Validation(
                    # Colonnes issues de Carthago
                    CODE        = data.referenceEB,
                    DESCRIPTION = row.get("DESCRIPTION"),
                    TYPE        = row.get("TYPE"),
                    IDENTIFIER  = row.get("IDENTIFIER"),
                    CUSER       = row.get("CUSER"),
                    UUSER       = row.get("UUSER"),
                    VERSIONNUM  = int(row.get("VERSIONNUM") or 1),
                    WITHFORCING = bool(row.get("WITHFORCING") or False),

                    # Colonnes SUIFACT générées automatiquement
                    nomEtape    = f"Carthago — {row.get('TYPE') or 'Expression de besoin'}",
                    statutEtape = StatutEtapeEnum.EN_COURS,
                    dateDebut   = datetime.now(),
                    idFacture   = id_facture,
                    idUtilisateur = utilisateur.idUtilisateur
                )
                db.add(validation)
                db.flush()  # récupère l'idValidation sans commit

                # Log de la synchronisation Carthago
                db.add(Log(
                    action        = ActionLogEnum.DONNEES_CARTHAGO_SYNCEES,
                    nouveauStatut = StatutEtapeEnum.EN_COURS.value,
                    commentaire   = f"Données Carthago importées à la saisie EB : {data.referenceEB}",
                    topicKafka    = None,  # action manuelle, pas Kafka
                    idFacture     = id_facture,
                    idUtilisateur = utilisateur.idUtilisateur,
                    idValidation  = validation.idValidation
                ))
                carthago_importe = True
                logger.info(f"✅ Données Carthago importées pour EB={data.referenceEB}")
            else:
                # La validation existe déjà (créée par le consumer Kafka auparavant)
                logger.info(f"ℹ️ Validation Carthago déjà existante pour EB={data.referenceEB}")
        else:
            # Carthago ne contient pas encore cette référence EB.
            # Le carthago_consumer.py prendra le relais quand la donnée
            # sera insérée dans Carthago et propagée via Kafka.
            logger.info(
                f"ℹ️ CODE={data.referenceEB} absent de Carthago pour l'instant. "
                f"Import différé au consumer Kafka."
            )

    except Exception as e:
        # Non bloquant : si Carthago est indisponible, on ne bloque pas la saisie EB.
        # La facture est quand même créée, et le consumer Kafka rattrapera l'import.
        logger.warning(f"⚠️ Import Carthago échoué pour {data.referenceEB} : {e}")

    # ── Commit global (facture + ticket + logs + validation éventuelle) ───────
    db.commit()

    # ── Broadcast WebSocket ───────────────────────────────────────────────────
    await manager.broadcast_facture_update({
        "idFacture":        facture.idFacture,
        "codeUnique":       facture.codeUnique,
        "statut":           facture.statut.value,
        "referenceEB":      facture.referenceEB,
        "updated_at":       facture.updated_at.isoformat()
    })

    return {
        "message":           "Référence EB saisie avec succès",
        "referenceEB":       data.referenceEB,
        "statut":            StatutFactureEnum.EB_SAISI.value,
        "codeTicket":        code_ticket,
        # Indique au frontend si les données Carthago ont été importées immédiatement
        "carthago_importe":  carthago_importe
    }


@router.put(
    "/{id_facture}/bloquer",
    summary="Bloquer une facture"
)
async def bloquer_facture(
    id_facture:  int,
    commentaire: str,
    db:          Session     = Depends(get_db),
    utilisateur: Utilisateur = Depends(verifier_role([
        "VALIDATEUR", "SUPERVISEUR", "ADMINISTRATEUR"
    ]))
):
    """Bloque la facture et crée une alerte automatique"""
    from models.models import Alerte, TypeAlerteEnum

    facture = db.query(Facture).options(
        joinedload(Facture.courriers)
    ).filter(Facture.idFacture == id_facture).first()

    if not facture:
        raise HTTPException(404, "Facture introuvable")
    if facture.statut == StatutFactureEnum.PAYE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de bloquer une facture déjà payée."
        )

    ancien_statut      = facture.statut
    facture.statut     = StatutFactureEnum.BLOQUE
    facture.updated_at = datetime.now()

    db.add(Alerte(
        typeAlerte    = TypeAlerteEnum.BLOCAGE_DOSSIER,
        message       = f"Facture {facture.codeUnique} bloquée : {commentaire}",
        idFacture     = id_facture,
        idUtilisateur = utilisateur.idUtilisateur
    ))
    db.add(Log(
        action        = ActionLogEnum.DOSSIER_BLOQUE,
        ancienStatut  = ancien_statut.value,
        nouveauStatut = StatutFactureEnum.BLOQUE.value,
        commentaire   = commentaire,
        idFacture     = id_facture,
        idUtilisateur = utilisateur.idUtilisateur
    ))
    db.commit()

    await manager.broadcast_facture_update({
        "idFacture":  facture.idFacture,
        "codeUnique": facture.codeUnique,
        "statut":     facture.statut.value,
        "referenceEB": facture.referenceEB,
        "updated_at": facture.updated_at.isoformat()
    })

    return {"message": "Facture bloquée et alerte créée"}


@router.put(
    "/{id_facture}/debloquer",
    summary="Débloquer une facture"
)
async def debloquer_facture(
    id_facture:  int,
    commentaire: str,
    db:          Session     = Depends(get_db),
    utilisateur: Utilisateur = Depends(verifier_role([
        "VALIDATEUR", "SUPERVISEUR", "ADMINISTRATEUR"
    ]))
):
    """Débloque la facture et remet en EN_INSTRUCTION"""
    facture = db.query(Facture).options(
        joinedload(Facture.courriers)
    ).filter(Facture.idFacture == id_facture).first()

    if not facture:
        raise HTTPException(404, "Facture introuvable")
    if facture.statut != StatutFactureEnum.BLOQUE:
        raise HTTPException(400, "La facture n'est pas bloquée")

    facture.statut     = StatutFactureEnum.EN_INSTRUCTION
    facture.updated_at = datetime.now()

    db.add(Log(
        action        = ActionLogEnum.DOSSIER_DEBLOQUE,
        ancienStatut  = StatutFactureEnum.BLOQUE.value,
        nouveauStatut = StatutFactureEnum.EN_INSTRUCTION.value,
        commentaire   = commentaire,
        idFacture     = id_facture,
        idUtilisateur = utilisateur.idUtilisateur
    ))
    db.commit()

    await manager.broadcast_facture_update({
        "idFacture":  facture.idFacture,
        "codeUnique": facture.codeUnique,
        "statut":     facture.statut.value,
        "referenceEB": facture.referenceEB,
        "updated_at": facture.updated_at.isoformat()
    })

    return {"message": "Facture débloquée avec succès"}


@router.get(
    "/{id_facture}/historique",
    summary="Historique complet d'une facture"
)
def get_historique(
    id_facture: int,
    db:         Session     = Depends(get_db),
    _:          Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    CORRECTION de la déconnexion :

    AVANT (bugué) : retournait { "idFacture": ..., "historique": [Log, ...] }
      → apiGetHistoriqueFacture dans api.ts attend LogResponse[] (un tableau direct)
      → quand le frontend faisait .map() sur un objet, erreur de sérialisation
      → FastAPI renvoyait une 500 à cause des objets SQLAlchemy non-sérialisables
      → apiFetch interprétait ça comme une session expirée → clearToken() → déconnexion

    APRÈS (corrigé) : retourne directement un tableau de dicts sérialisables.
    On sérialise manuellement les champs pour éviter les problèmes d'enum et datetime.
    """
    facture = db.query(Facture).filter(
        Facture.idFacture == id_facture
    ).first()

    if not facture:
        raise HTTPException(404, "Facture introuvable")

    logs = db.query(Log).filter(
        Log.idFacture == id_facture
    ).order_by(Log.dateAction.asc()).all()

    # Sérialisation manuelle : convertit les enums en string et les dates en ISO
    # pour éviter l'erreur "Object of type ActionLogEnum is not JSON serializable"
    return [
        {
            "idLog":          log.idLog,
            "action":         log.action.value if log.action else None,  # enum → str
            "ancienStatut":   log.ancienStatut,
            "nouveauStatut":  log.nouveauStatut,
            "commentaire":    log.commentaire,
            "topicKafka":     log.topicKafka,
            "dateAction":     log.dateAction.isoformat() if log.dateAction else None,
            "idFacture":      log.idFacture,
            "codeFacture":    None,           # pas de jointure ici pour rester léger
            "idUtilisateur":  log.idUtilisateur,
            "nomUtilisateur": None,           # idem
        }
        for log in logs
    ]