"""
Router : Courriers
Endpoints : liste, détail, parcours, recherche

IMPORTANCE :
Les courriers sont importés automatiquement depuis Mailsoft via Debezium.
Ces endpoints permettent de les consulter et de suivre leur parcours
entre les différents services du CFC.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date

from schemas.database import get_db
from models.models import Courrier, Utilisateur
from services.auth_service import get_utilisateur_actuel

router = APIRouter()


# ─────────────────────────────────────────
# SCHÉMAS Pydantic
# ─────────────────────────────────────────

from datetime import date, datetime

class CourrierResponse(BaseModel):
    idCourrier:      int
    numero_courrier: str
    objet_courrier:  Optional[str] = None
    expediteur:      Optional[str] = None
    destinataire:    Optional[str] = None
    date_signature:  Optional[datetime] = None  # datetime au lieu de date
    position:        Optional[str] = None
    parcours:        Optional[str] = None

 

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────

@router.get(
    "/",
    response_model=List[CourrierResponse],
    summary="Lister tous les courriers de nature FACTURE"
)
def lister_courriers(
    
    db:       Session        = Depends(get_db),
    _:        Utilisateur    = Depends(get_utilisateur_actuel)
):
    return db.query(Courrier).all()
    """
    IMPORTANCE :
    Retourne la liste des courriers importés depuis Mailsoft.
    Filtrable par nature (FACTURE) et statut d'archivage.
    Affiché dans la page de liste des courriers de React.
    Accessible à tous les utilisateurs connectés.
    """




@router.get(
    "/recherche",
    response_model=List[CourrierResponse],
    summary="Rechercher un courrier par numéro"
)
def rechercher_courrier(
    q:  str       = Query(..., description="Numéro de courrier à rechercher"),
    db: Session   = Depends(get_db),
    _:  Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    IMPORTANCE :
    Recherche rapide par numéro de courrier.
    Utilisé dans la barre de recherche de React.
    Permet de trouver instantanément un dossier.
    """
    courriers = db.query(Courrier).filter(
        Courrier.numero_courrier.like(f"%{q}%")
    ).all()

    return courriers


@router.get(
    "/{id_courrier}",
    response_model=CourrierResponse,
    summary="Détail d'un courrier"
)
def get_courrier(
    id_courrier: int,
    db:          Session   = Depends(get_db),
    _:           Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    IMPORTANCE :
    Retourne toutes les informations d'un courrier spécifique.
    Affiché dans la page de détail d'une facture.
    """
    courrier = db.query(Courrier).filter(
        Courrier.idCourrier == id_courrier
    ).first()

    if not courrier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Courrier introuvable"
        )
    return courrier


@router.get(
    "/{id_courrier}/parcours",
    summary="Obtenir le parcours d'un courrier entre services"
)
def get_parcours_courrier(
    id_courrier: int,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(get_utilisateur_actuel)
):
    courrier = db.query(Courrier).filter(
        Courrier.idCourrier == id_courrier
    ).first()

    if not courrier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Courrier introuvable"
        )

    parcours_brut = courrier.parcours or ""

    # Découpe le parcours en étapes : "DSI -> DG, DG -> DAF"
    etapes = [e.strip() for e in parcours_brut.split(",")] if parcours_brut else []

    return {
        "idCourrier":        courrier.idCourrier,
        "numeroCourrier":    courrier.numero_courrier,
        "parcours_brut":     parcours_brut,
        "etapes":            etapes,
        "position_actuelle": courrier.position,
        "nombre_etapes":     len(etapes)
    }

@router.get(
    "/stats/par-nature",
    summary="Statistiques des courriers par nature"
)
def stats_par_nature(
    db: Session   = Depends(get_db),
    _:  Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    IMPORTANCE :
    Retourne le nombre de courriers par nature (FACTURE, COURRIER, etc.)
    Utilisé dans les graphiques du tableau de bord.
    """
    from sqlalchemy import func

    stats = db.query(
        Courrier.CODE_NATURE_COURRIER,
        func.count(Courrier.idCourrier).label("total")
    ).group_by(Courrier.CODE_NATURE_COURRIER).all()

    return [
        {"nature": s[0], "total": s[1]}
        for s in stats
    ]