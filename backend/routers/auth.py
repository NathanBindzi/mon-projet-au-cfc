"""
Router : Authentification
Endpoints : login, register, profil

IMPORTANCE :
Ces endpoints sont la porte d'entrée de toute l'application.
Sans authentification, personne ne peut accéder à l'API.
Le token JWT retourné est utilisé dans tous les autres endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional

from schemas.database import get_db
from models.models import Utilisateur, RoleEnum
from services.auth_service import (
    hacher_mot_de_passe,
    verifier_mot_de_passe,
    creer_token_jwt,
    get_utilisateur_actuel
)

router = APIRouter()


# ─────────────────────────────────────────
# SCHÉMAS Pydantic
# ─────────────────────────────────────────

class RegisterSchema(BaseModel):
    """Données nécessaires pour créer un compte"""
    nom:        str
    prenom:     str
    email:      EmailStr
    motDePasse: str
    role:       RoleEnum


class TokenSchema(BaseModel):
    """Réponse retournée après connexion"""
    access_token: str
    token_type:   str
    utilisateur:  dict


class ProfilSchema(BaseModel):
    """Informations du profil utilisateur"""
    idUtilisateur: int
    nom:           str
    prenom:        str
    email:         str
    role:          str
    actif:         bool

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# ENDPOINTS
# ─────────────────────────────────────────

@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Créer un compte utilisateur"
)
def register(
    data: RegisterSchema,
    db: Session = Depends(get_db)
):
    """
    IMPORTANCE :
    Permet à l'administrateur de créer des comptes utilisateurs.
    Vérifie que l'email n'existe pas déjà.
    Hache le mot de passe avant de le stocker.
    """
    # Vérifier que l'email n'existe pas déjà
    existant = db.query(Utilisateur).filter(
        Utilisateur.email == data.email
    ).first()

    if existant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un compte avec cet email existe déjà"
        )

    # Créer le nouvel utilisateur
    nouvel_utilisateur = Utilisateur(
        nom        = data.nom,
        prenom     = data.prenom,
        email      = data.email,
        motDePasse = hacher_mot_de_passe(data.motDePasse),
        role       = data.role
    )

    db.add(nouvel_utilisateur)
    db.commit()
    db.refresh(nouvel_utilisateur)

    return {
        "message": "Compte créé avec succès",
        "idUtilisateur": nouvel_utilisateur.idUtilisateur
    }


@router.post(
    "/login",
    response_model=TokenSchema,
    summary="Se connecter et obtenir un token JWT"
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    IMPORTANCE :
    Endpoint principal d'authentification.
    Vérifie email + mot de passe, retourne un token JWT.
    Ce token est requis pour tous les autres endpoints.

    Le token contient : email, rôle, expiration.
    React le stocke dans localStorage et l'envoie
    dans chaque requête via le header Authorization.
    """
    # Chercher l'utilisateur par email
    utilisateur = db.query(Utilisateur).filter(
        Utilisateur.email == form_data.username
    ).first()

    # Vérifier email et mot de passe
    if not utilisateur or not verifier_mot_de_passe(
        form_data.password, utilisateur.motDePasse
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Vérifier que le compte est actif
    if not utilisateur.actif:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Compte désactivé. Contactez l'administrateur."
        )

    # Générer le token JWT
    token = creer_token_jwt({
        "sub":  utilisateur.email,
        "role": utilisateur.role.value
    })

    return {
        "access_token": token,
        "token_type":   "bearer",
        "utilisateur": {
            "id":     utilisateur.idUtilisateur,
            "nom":    utilisateur.nom,
            "prenom": utilisateur.prenom,
            "email":  utilisateur.email,
            "role":   utilisateur.role.value
        }
    }


@router.get(
    "/me",
    response_model=ProfilSchema,
    summary="Obtenir le profil de l'utilisateur connecté"
)
def get_profil(
    utilisateur: Utilisateur = Depends(get_utilisateur_actuel)
):
    """
    IMPORTANCE :
    Permet à React de récupérer les infos de l'utilisateur connecté.
    Utilisé au chargement de l'application pour afficher
    le nom, le prénom et adapter l'interface selon le rôle.
    """
    return utilisateur