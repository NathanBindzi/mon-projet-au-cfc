"""
Service d'authentification
Gère le hachage des mots de passe et la génération des tokens JWT
"""

from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from schemas.database import get_db
from settings import settings
from models.models import Utilisateur

# ─────────────────────────────────────────
# Configuration du hachage des mots de passe
# bcrypt est l'algorithme le plus sécurisé
# ─────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─────────────────────────────────────────
# Schéma OAuth2 — indique où trouver le token
# tokenUrl = l'endpoint de login
# ─────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hacher_mot_de_passe(mot_de_passe: str) -> str:
    """Hache un mot de passe en clair avec bcrypt"""
    return pwd_context.hash(mot_de_passe)


def verifier_mot_de_passe(mot_de_passe: str, hash: str) -> bool:
    """Vérifie qu'un mot de passe correspond à son hash"""
    return pwd_context.verify(mot_de_passe, hash)


def creer_token_jwt(data: dict) -> str:
    """
    Génère un token JWT signé.
    Le token contient : l'email, le rôle et la date d'expiration.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": int(expire.timestamp())})
    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )


def get_utilisateur_actuel(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Utilisateur:
    """
    Dépendance FastAPI — extrait et vérifie le token JWT.
    Utilisée dans tous les endpoints protégés.
    Retourne l'utilisateur connecté ou lève une erreur 401.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token invalide ou expiré",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Décode le token
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Cherche l'utilisateur en base
    utilisateur = db.query(Utilisateur).filter(
        Utilisateur.email == email
    ).first()

    if utilisateur is None or not utilisateur.actif:
        raise credentials_exception

    return utilisateur


def verifier_role(roles_autorises: list):
    """
    Dépendance de vérification des rôles.
    Vérifie que l'utilisateur connecté a le bon rôle.

    Utilisation :
    @router.get("/...", dependencies=[Depends(verifier_role(["ADMIN"]))])
    """
    def _verifier(
        utilisateur: Utilisateur = Depends(get_utilisateur_actuel)
    ):
        if utilisateur.role not in roles_autorises:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Accès refusé. Rôles autorisés : {roles_autorises}"
            )
        return utilisateur
    return _verifier