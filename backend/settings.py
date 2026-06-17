"""
Gestion des variables d'environnement
Charge automatiquement le fichier .env
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Base de données
    DATABASE_URL: str = "mysql+pymysql://root:root_secret_2026@localhost:3306/cfc_db"

    # JWT
    SECRET_KEY: str = "ton_secret_key_ici"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Kafka
    KAFKA_BROKER: str = "localhost:29092"

    # ── Délai d'échéance des factures ──────────────────────────────────────────
    # Durée en MINUTES entre la date de réception et l'échéance automatique.
    # En test : 5 minutes.
    # En production : 2880 = 2 jours (60 * 24 * 2).
    # Valeur surchargeable dans .env : DELAI_ECHEANCE_MINUTES=2880
    DELAI_ECHEANCE_MINUTES: int = 5

    class Config:
        env_file = ".env"


# Instance globale des settings
settings = Settings()