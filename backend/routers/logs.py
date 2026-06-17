# ════════════════════════════════════════════════════════
# LOGS ACTION
# ════════════════════════════════════════════════════════
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime

from models.models import Log, Utilisateur, Facture
from schemas.database import get_db
from services.auth_service import get_utilisateur_actuel, verifier_role

router_logs = APIRouter()


class LogResponse(BaseModel):
    idLog:           int
    action:          str
    ancienStatut:    Optional[str]
    nouveauStatut:   Optional[str]
    commentaire:     Optional[str]
    topicKafka:      Optional[str]
    dateAction:      Optional[datetime]
    idFacture:       Optional[int]
    codeFacture:     Optional[str]   # code lisible de la facture
    idUtilisateur:   Optional[int]
    nomUtilisateur:  Optional[str]   # prénom + nom de l'agent

    class Config:
        from_attributes = True


def _enrich_log(log: Log) -> dict:
    """Sérialise un Log en ajoutant nomUtilisateur et codeFacture."""
    nom_utilisateur = None
    if log.utilisateur:
        nom_utilisateur = f"{log.utilisateur.prenom} {log.utilisateur.nom}"

    code_facture = None
    if log.facture:
        code_facture = log.facture.codeUnique

    return {
        "idLog":           log.idLog,
        "action":          log.action,
        "ancienStatut":    log.ancienStatut,
        "nouveauStatut":   log.nouveauStatut,
        "commentaire":     log.commentaire,
        "topicKafka":      log.topicKafka,
        "dateAction":      log.dateAction,
        "idFacture":       log.idFacture,
        "codeFacture":     code_facture,
        "idUtilisateur":   log.idUtilisateur,
        "nomUtilisateur":  nom_utilisateur,
    }


@router_logs.get(
    "/",
    response_model=List[LogResponse],
    summary="Journal complet de toutes les actions"
)
def lister_logs(
    action: Optional[str] = None,
    skip:   int           = 0,
    limit:  int           = 100,
    db:     Session       = Depends(get_db),
    _:      Utilisateur   = Depends(verifier_role([
        "SUPERVISEUR", "ADMINISTRATEUR"
    ]))
):
    """
    IMPORTANCE :
    Journal d'audit complet de toutes les actions du système.
    Filtrable par type d'action.
    Affiché dans la page Logs.jsx.
    Réservé au SUPERVISEUR et l'ADMINISTRATEUR.
    Permet de tracer qui a fait quoi et quand.
    """
    query = db.query(Log).options(
        joinedload(Log.utilisateur),
        joinedload(Log.facture),
    )
    if action:
        query = query.filter(Log.action == action)

    logs = query.order_by(
        Log.dateAction.desc()
    ).offset(skip).limit(limit).all()

    return [_enrich_log(l) for l in logs]


@router_logs.get(
    "/facture/{id_facture}",
    response_model=List[LogResponse],
    summary="Logs d'une facture spécifique"
)
def logs_par_facture(
    id_facture: int,
    db:         Session   = Depends(get_db),
    _:          Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    IMPORTANCE :
    Retourne tous les logs d'une facture spécifique.
    Affiché dans la timeline de DetailFacture.jsx.
    Accessible à tous les utilisateurs connectés.
    """
    logs = db.query(Log).options(
        joinedload(Log.utilisateur),
        joinedload(Log.facture),
    ).filter(
        Log.idFacture == id_facture
    ).order_by(Log.dateAction.asc()).all()

    return [_enrich_log(l) for l in logs]


@router_logs.get(
    "/utilisateur/{id_utilisateur}",
    response_model=List[LogResponse],
    summary="Logs d'un utilisateur spécifique"
)
def logs_par_utilisateur(
    id_utilisateur: int,
    db:             Session   = Depends(get_db),
    _:              Utilisateur = Depends(verifier_role(["ADMINISTRATEUR"]))
):
    """
    IMPORTANCE :
    Retourne tous les logs d'un utilisateur spécifique.
    Permet à l'admin de voir toutes les actions d'un agent.
    Outil d'audit pour le contrôle interne.
    Réservé à l'ADMINISTRATEUR.
    """
    logs = db.query(Log).options(
        joinedload(Log.utilisateur),
        joinedload(Log.facture),
    ).filter(
        Log.idUtilisateur == id_utilisateur
    ).order_by(Log.dateAction.desc()).all()

    return [_enrich_log(l) for l in logs]