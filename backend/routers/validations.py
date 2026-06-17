# VALIDATIONS — VERSION CORRIGÉE
# BUG CORRIGÉ : Le 422 vient du fait que Pydantic v2 rejette
# "2026-06-10T14:30" (sans secondes) pour le type Optional[datetime].
# SOLUTION : recevoir les dates en Optional[str] et convertir manuellement.

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import date, datetime

from schemas.database import get_db
from models.models import (
    StatutFactureEnum, Validation, Facture, Log,
    Utilisateur, StatutEtapeEnum, ActionLogEnum
)
from services.auth_service import get_utilisateur_actuel, verifier_role

router_validations = APIRouter()


# ── Utilitaires de conversion (Pydantic v2 est strict sur le format ISO) ──────

def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    """
    Convertit une chaîne ISO en datetime de façon tolérante.
    Accepte : "2026-06-10T14:30", "2026-06-10T14:30:00", "2026-06-10"
    """
    if not value:
        return None
    # On essaie les formats du plus précis au moins précis
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None  # format inconnu → None plutôt qu'une erreur 500


def _parse_date(value: Optional[str]) -> Optional[date]:
    """Convertit une chaîne en date en extrayant les 10 premiers caractères."""
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


# ── Schémas ───────────────────────────────────────────────────────────────────

class ValidationCreate(BaseModel):
    """
    CORRECTION : dateDebut/dateFin/DOCUMENTDAT sont Optional[str].
    Le frontend envoie "2026-06-10T14:30" (sans secondes),
    rejeté par Pydantic v2 avec le type datetime → 422.
    """
    nomEtape:    str
    dateDebut:   Optional[str] = None   # ← str, pas datetime
    dateFin:     Optional[str] = None   # ← str, pas datetime
    delaiJours:  Optional[int] = None
    commentaire: Optional[str] = None
    CODE:        Optional[str] = None
    DESCRIPTION: Optional[str] = None
    DOCUMENTDAT: Optional[str] = None   # ← str, pas date
    TYPE:        Optional[str] = None


class ValidationUpdate(BaseModel):
    """CORRECTION : dateFin en Optional[str]."""
    statutEtape: StatutEtapeEnum
    commentaire: Optional[str] = None
    dateFin:     Optional[str] = None   # ← str, pas datetime


class ValidationResponse(BaseModel):
    idValidation: int
    nomEtape:     Optional[str]      = None
    statutEtape:  Optional[str]      = None
    dateDebut:    Optional[datetime] = None
    dateFin:      Optional[datetime] = None
    delaiJours:   Optional[int]      = None
    commentaire:  Optional[str]      = None
    CODE:         Optional[str]      = None
    DESCRIPTION:  Optional[str]      = None
    idFacture:    int

    class Config:
        from_attributes  = True
        populate_by_name = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router_validations.get(
    "/facture/{id_facture}",
    response_model=List[ValidationResponse],
    summary="Lister les validations d'une facture"
)
def lister_validations(
    id_facture: int,
    db:         Session     = Depends(get_db),
    _:          Utilisateur = Depends(get_utilisateur_actuel)
):
    return db.query(Validation).filter(
        Validation.idFacture == id_facture
    ).order_by(Validation.idValidation.asc()).all()


@router_validations.post(
    "/facture/{id_facture}",
    status_code=status.HTTP_201_CREATED,
    summary="Créer une étape de validation"
)
def creer_validation(
    id_facture:  int,
    data:        ValidationCreate,
    db:          Session      = Depends(get_db),
    utilisateur: Utilisateur  = Depends(verifier_role([
        "INSTRUCTEUR", "VALIDATEUR", "ADMINISTRATEUR"
    ]))
):
    """
    CORRECTION du 422 : dates converties manuellement avec _parse_datetime()
    après réception en string, évitant le rejet strict de Pydantic v2.
    """
    facture = db.query(Facture).filter(
        Facture.idFacture == id_facture
    ).first()
    if not facture:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Facture introuvable")

    if facture.statut == StatutFactureEnum.PAYE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible d'ajouter une étape : cette facture est payée et définitivement clôturée."
        )

    if facture.statut == StatutFactureEnum.BLOQUE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible d'ajouter une étape : cette facture est bloquée. Débloquez-la d'abord."
        )

    # Conversion manuelle — tolère tous les formats ISO courants
    date_debut_parsed  = _parse_datetime(data.dateDebut) or datetime.now()
    date_fin_parsed    = _parse_datetime(data.dateFin)
    documentdat_parsed = _parse_date(data.DOCUMENTDAT)

    validation = Validation(
        nomEtape      = data.nomEtape,
        dateDebut     = date_debut_parsed,
        dateFin       = date_fin_parsed,
        delaiJours    = data.delaiJours or 0,
        commentaire   = data.commentaire,
        CODE          = data.CODE,
        DESCRIPTION   = data.DESCRIPTION,
        DOCUMENTDATE  = documentdat_parsed,
        TYPE          = data.TYPE,
        idFacture     = id_facture,
        idUtilisateur = utilisateur.idUtilisateur
    )
    db.add(validation)
    db.flush()

    db.add(Log(
        action        = ActionLogEnum.VALIDATION_EFFECTUEE,
        commentaire   = f"Étape créée : {data.nomEtape}",
        idFacture     = id_facture,
        idUtilisateur = utilisateur.idUtilisateur,
        idValidation  = validation.idValidation
    ))
    db.commit()

    return {"message": "Étape créée avec succès", "idValidation": validation.idValidation}


@router_validations.put(
    "/{id_validation}",
    summary="Mettre à jour le statut d'une étape"
)
def mettre_a_jour_validation(
    id_validation: int,
    data:          ValidationUpdate,
    db:            Session      = Depends(get_db),
    utilisateur:   Utilisateur  = Depends(verifier_role([
        "VALIDATEUR", "SUPERVISEUR", "ADMINISTRATEUR"
    ]))
):
    """CORRECTION : dateFin reçu en str et converti manuellement."""
    validation = db.query(Validation).filter(
        Validation.idValidation == id_validation
    ).first()
    if not validation:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Validation introuvable")
    facture = db.query(Facture).filter(
        Facture.idFacture == validation.idFacture
    ).first()

    if facture and facture.statut == StatutFactureEnum.PAYE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de modifier une étape : cette facture est payée et définitivement clôturée."
        )

    if facture and facture.statut == StatutFactureEnum.BLOQUE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossible de modifier une étape : cette facture est bloquée. Débloquez-la d'abord."
        )

    ancien_statut          = validation.statutEtape
    validation.statutEtape = data.statutEtape
    validation.commentaire = data.commentaire

    date_fin_parsed = _parse_datetime(data.dateFin)

    statuts_cloture = [StatutEtapeEnum.VALIDEE, StatutEtapeEnum.REJETEE, StatutEtapeEnum.BLOQUEE]
    if data.statutEtape in statuts_cloture:
        date_fin = date_fin_parsed or datetime.now()
        validation.dateFin = date_fin
        if validation.dateDebut:
            delta = (date_fin - validation.dateDebut).days
            validation.delaiJours = max(0, delta)
    elif date_fin_parsed:
        validation.dateFin = date_fin_parsed

    db.add(Log(
        action        = ActionLogEnum.VALIDATION_EFFECTUEE,
        ancienStatut  = ancien_statut.value if ancien_statut else None,
        nouveauStatut = data.statutEtape.value,
        commentaire   = data.commentaire,
        idFacture     = validation.idFacture,
        idUtilisateur = utilisateur.idUtilisateur,
        idValidation  = id_validation
    ))
    db.commit()

    return {
        "message":        "Étape mise à jour avec succès",
        "ancien_statut":  ancien_statut.value if ancien_statut else None,
        "nouveau_statut": data.statutEtape.value
    }