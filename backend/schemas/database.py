"""
Configuration de la connexion à la base de données MySQL
Utilise SQLAlchemy comme ORM
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from settings import settings

# ─────────────────────────────────────────
# Création du moteur SQLAlchemy
# pool_pre_ping : vérifie la connexion avant chaque requête
# ─────────────────────────────────────────
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600  # Recycle les connexions toutes les heures
)

# ─────────────────────────────────────────
# Session factory
# autocommit=False : les transactions sont explicites
# autoflush=False  : pas de flush automatique
# ─────────────────────────────────────────
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# ─────────────────────────────────────────
# Classe de base pour tous les modèles
# ─────────────────────────────────────────
Base = declarative_base()


def get_db():
    """
    Générateur de session de base de données.
    Utilisé comme dépendance dans les endpoints FastAPI.
    Garantit que la session est fermée après chaque requête.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()