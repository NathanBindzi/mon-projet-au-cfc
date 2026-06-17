"""
Router : Utilisateurs
Endpoints : liste, détail, création, modification, désactivation

IMPORTANCE :
Permet à l'administrateur de gérer les habilitations.
Chaque utilisateur a un rôle qui détermine ce qu'il peut faire.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import List, Optional

from schemas.database import get_db
from models.models import Utilisateur, RoleEnum
from services.auth_service import (
    get_utilisateur_actuel,
    verifier_role,
    hacher_mot_de_passe
)

router = APIRouter()


# ─────────────────────────────────────────
# SCHÉMAS Pydantic
# ─────────────────────────────────────────

class UtilisateurResponse(BaseModel):
    idUtilisateur: int
    nom:           str
    prenom:        str
    email:         str
    role:          str
    actif:         bool

    class Config:
        from_attributes = True


class UpdateRoleSchema(BaseModel):
    role: RoleEnum


class UpdateMotDePasseSchema(BaseModel):
    ancien_mot_de_passe: str
    nouveau_mot_de_passe: str


# ─────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────

@router.get(
    "/",
    response_model=List[UtilisateurResponse],
    summary="Lister tous les utilisateurs"
)
def lister_utilisateurs(
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(verifier_role(["ADMINISTRATEUR"]))
):
    """
    IMPORTANCE :
    Permet à l'admin de voir tous les comptes créés.
    Affiché dans la page Gestion des Habilitations de React.
    Réservé à l'ADMINISTRATEUR uniquement.
    """
    return db.query(Utilisateur).all()


@router.get(
    "/{id_utilisateur}",
    response_model=UtilisateurResponse,
    summary="Détail d'un utilisateur"
)
def get_utilisateur(
    id_utilisateur: int,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(verifier_role(["ADMINISTRATEUR"]))
):
    """
    IMPORTANCE :
    Récupère les infos d'un utilisateur spécifique.
    Utilisé pour pré-remplir le formulaire de modification.
    """
    utilisateur = db.query(Utilisateur).filter(
        Utilisateur.idUtilisateur == id_utilisateur
    ).first()

    if not utilisateur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable"
        )
    return utilisateur


@router.put(
    "/{id_utilisateur}/role",
    summary="Modifier le rôle d'un utilisateur"
)
def modifier_role(
    id_utilisateur: int,
    data: UpdateRoleSchema,
    db: Session = Depends(get_db),
    actuel: Utilisateur = Depends(verifier_role(["ADMINISTRATEUR"]))
):
    """
    IMPORTANCE :
    Permet à l'admin de changer le rôle d'un utilisateur.
    Ex: passer un AGENT_COURRIER en INSTRUCTEUR.
    Action loggée dans logs_action.
    Réservé à l'ADMINISTRATEUR.
    """
    utilisateur = db.query(Utilisateur).filter(
        Utilisateur.idUtilisateur == id_utilisateur
    ).first()

    if not utilisateur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable"
        )

    ancien_role = utilisateur.role
    utilisateur.role = data.role
    db.commit()

    return {
        "message":    f"Rôle modifié avec succès",
        "ancien_role": ancien_role,
        "nouveau_role": data.role
    }


@router.put(
    "/{id_utilisateur}/desactiver",
    summary="Désactiver un compte utilisateur"
)
def desactiver_utilisateur(
    id_utilisateur: int,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(verifier_role(["ADMINISTRATEUR"]))
):
    """
    IMPORTANCE :
    Désactive un compte sans le supprimer.
    L'utilisateur ne pourra plus se connecter.
    Les données historiques sont préservées.
    Réservé à l'ADMINISTRATEUR.
    """
    utilisateur = db.query(Utilisateur).filter(
        Utilisateur.idUtilisateur == id_utilisateur
    ).first()

    if not utilisateur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable"
        )

    utilisateur.actif = False
    db.commit()

    return {"message": "Compte désactivé avec succès"}


@router.put(
    "/{id_utilisateur}/activer",
    summary="Réactiver un compte utilisateur"
)
def activer_utilisateur(
    id_utilisateur: int,
    db: Session = Depends(get_db),
    _: Utilisateur = Depends(verifier_role(["ADMINISTRATEUR"]))
):
    """
    IMPORTANCE :
    Réactive un compte précédemment désactivé.
    L'utilisateur peut de nouveau se connecter.
    """
    utilisateur = db.query(Utilisateur).filter(
        Utilisateur.idUtilisateur == id_utilisateur
    ).first()

    if not utilisateur:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Utilisateur introuvable"
        )

    utilisateur.actif = True
    db.commit()

    return {"message": "Compte réactivé avec succès"}


@router.put(
    "/mot-de-passe",
    summary="Changer son mot de passe"
)
def changer_mot_de_passe(
    data: UpdateMotDePasseSchema,
    db: Session = Depends(get_db),
    utilisateur: Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    IMPORTANCE :
    Permet à n'importe quel utilisateur connecté
    de changer son propre mot de passe.
    Vérifie l'ancien mot de passe avant de modifier.
    """
    from services.auth_service import verifier_mot_de_passe

    if not verifier_mot_de_passe(
        data.ancien_mot_de_passe, utilisateur.motDePasse
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ancien mot de passe incorrect"
        )

    utilisateur.motDePasse = hacher_mot_de_passe(data.nouveau_mot_de_passe)
    db.commit()

    return {"message": "Mot de passe modifié avec succès"}