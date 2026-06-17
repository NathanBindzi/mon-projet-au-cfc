# ════════════════════════════════════════════════════════
# ALERTES
# ════════════════════════════════════════════════════════

from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from schemas.database import get_db
from models.models import Alerte, TypeAlerteEnum, Utilisateur
from services.auth_service import get_utilisateur_actuel, verifier_role
from models.models import Alerte, TypeAlerteEnum, Utilisateur

router_alertes = APIRouter()

class AlerteCreate(BaseModel):
    typeAlerte:   TypeAlerteEnum
    message:      str
    idFacture:    int
    idUtilisateur: Optional[int]


class AlerteResponse(BaseModel):
    idAlerte:     int
    typeAlerte:   str
    message:      str
    lue:          bool
    dateEmission: Optional[datetime]
    idFacture:    int

    class Config:
        from_attributes = True


@router_alertes.get(
    "/",
    response_model=List[AlerteResponse],
    summary="Lister toutes les alertes"
)
def lister_alertes(
    lue:  Optional[bool] = None,
    db:   Session        = Depends(get_db),
    _:    Utilisateur    = Depends(get_utilisateur_actuel)
):
    """
    IMPORTANCE :
    Retourne toutes les alertes actives.
    Filtrable par statut lu/non lu.
    Affiché dans la page Alertes.jsx et dans
    le badge de notification de la Navbar.
    Le superviseur voit les alertes en temps réel.
    """
    query = db.query(Alerte)
    if lue is not None:
        query = query.filter(Alerte.lue == lue)
    return query.order_by(Alerte.dateEmission.desc()).all()


@router_alertes.get(
    "/facture/{id_facture}",
    response_model=List[AlerteResponse],
    summary="Alertes d'une facture spécifique"
)
def alertes_par_facture(
    id_facture: int,
    db:         Session   = Depends(get_db),
    _:          Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    IMPORTANCE :
    Retourne toutes les alertes liées à une facture.
    Affiché dans la page de détail d'une facture.
    """
    return db.query(Alerte).filter(
        Alerte.idFacture == id_facture
    ).all()


@router_alertes.put(
    "/{id_alerte}/lue",
    summary="Marquer une alerte comme lue"
)
def marquer_alerte_lue(
    id_alerte:   int,
    db:          Session      = Depends(get_db),
    utilisateur: Utilisateur  = Depends(get_utilisateur_actuel)
):
    """
    IMPORTANCE :
    Marque une alerte comme lue après traitement.
    Met à jour le badge de notification dans la Navbar.
    Action disponible pour tous les utilisateurs connectés.
    """
    alerte = db.query(Alerte).filter(
        Alerte.idAlerte == id_alerte
    ).first()

    if not alerte:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alerte introuvable"
        )

    alerte.lue = True
    db.commit()

    return {"message": "Alerte marquée comme lue"}


@router_alertes.put(
    "/toutes/lues",
    summary="Marquer toutes les alertes comme lues"
)
def marquer_toutes_lues(
    db: Session   = Depends(get_db),
    _:  Utilisateur = Depends(verifier_role(["SUPERVISEUR", "ADMINISTRATEUR"]))
):
    """
    IMPORTANCE :
    Marque toutes les alertes non lues comme lues en une action.
    Pratique pour le superviseur après consultation du tableau de bord.
    Réservé au SUPERVISEUR et l'ADMINISTRATEUR.
    """
    db.query(Alerte).filter(Alerte.lue == False).update({"lue": True})
    db.commit()

    return {"message": "Toutes les alertes marquées comme lues"}


@router_alertes.get(
    "/stats/non-lues",
    summary="Nombre d'alertes non lues"
)
def count_alertes_non_lues(
    db: Session   = Depends(get_db),
    _:  Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    IMPORTANCE :
    Retourne le nombre d'alertes non lues.
    Utilisé par le badge de notification dans la Navbar de React.
    Appelé régulièrement pour maintenir le compteur à jour.
    """
    from sqlalchemy import func
    count = db.query(func.count(Alerte.idAlerte)).filter(
        Alerte.lue == False
    ).scalar()

    return {"non_lues": count}

# ── Endpoint de vérification manuelle ────────────────────────────────────────
# Permet au superviseur/admin de déclencher manuellement une vérification
# sans attendre l'heure de la vérification automatique.

@router_alertes.post(
    "/verifier",
    summary="Déclencher manuellement la vérification des alertes"
)
def verifier_alertes_manuellement(
    db: Session = Depends(get_db),
    _:  Utilisateur = Depends(verifier_role(["SUPERVISEUR", "ADMINISTRATEUR"]))
):
    """
    Lance immédiatement le scan de toutes les factures actives
    et crée les alertes manquantes (dépassements, pièces manquantes).
    Utile pour tester ou pour forcer une vérification hors cycle.
    """
    # Import ici pour éviter les imports circulaires
    from services.alerte_service import verifier_et_creer_alertes
    resultats = verifier_et_creer_alertes()
    return {
        "message": "Vérification terminée",
        "alertes_creees": resultats
    }
