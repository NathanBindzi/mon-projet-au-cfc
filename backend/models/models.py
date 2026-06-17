"""
Modèles SQLAlchemy
Chaque classe représente une table dans MySQL (cfc_db)
"""

from sqlalchemy import (
    Column, Integer, String, Text, Boolean,
    DateTime, Date, Enum, ForeignKey
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from schemas.database import Base
import enum


# ─────────────────────────────────────────
# ÉNUMÉRATIONS
# ─────────────────────────────────────────

class RoleEnum(str, enum.Enum):
    AGENT_COURRIER = "AGENT_COURRIER"
    INSTRUCTEUR    = "INSTRUCTEUR"
    SUPERVISEUR    = "SUPERVISEUR"
    ADMINISTRATEUR = "ADMINISTRATEUR"


class StatutFactureEnum(str, enum.Enum):
    RECEPTIONNE    = "RECEPTIONNE"
    EN_INSTRUCTION = "EN_INSTRUCTION"
    EB_SAISI       = "EB_SAISI"
    VALIDE         = "VALIDE"
    BLOQUE         = "BLOQUE"
    PAYE           = "PAYE"


class StatutEtapeEnum(str, enum.Enum):
    EN_COURS = "EN_COURS"
    VALIDEE  = "VALIDEE"
    REJETEE  = "REJETEE"
    BLOQUEE  = "BLOQUEE"


class TypeAlerteEnum(str, enum.Enum):
    DEPASSEMENT_DELAI = "DEPASSEMENT_DELAI"
    BLOCAGE_DOSSIER   = "BLOCAGE_DOSSIER"
    PIECE_MANQUANTE   = "PIECE_MANQUANTE"


class ActionLogEnum(str, enum.Enum):
    FACTURE_CREEE            = "FACTURE_CREEE"
    REFERENCE_EB_SAISIE      = "REFERENCE_EB_SAISIE"
    TICKET_EB_GENERE         = "TICKET_EB_GENERE"
    VALIDATION_EFFECTUEE     = "VALIDATION_EFFECTUEE"
    DOSSIER_BLOQUE           = "DOSSIER_BLOQUE"
    DOSSIER_DEBLOQUE         = "DOSSIER_DEBLOQUE"
    ALERTE_DECLENCHEE        = "ALERTE_DECLENCHEE"
    STATUT_CHANGE            = "STATUT_CHANGE"
    DONNEES_CARTHAGO_SYNCEES = "DONNEES_CARTHAGO_SYNCEES"
    CONNEXION                = "CONNEXION"
    MODIFICATION_DOSSIER     = "MODIFICATION_DOSSIER"
    HABILITATION_MODIFIEE    = "HABILITATION_MODIFIEE"


# ─────────────────────────────────────────
# TABLE DE JONCTION : facture_courrier
# Relation many-to-many entre Facture et Courrier
# ─────────────────────────────────────────
class FactureCourrier(Base):
    __tablename__ = "facture_courrier"

    idFactureCourrier = Column(Integer, primary_key=True, autoincrement=True)
    idFacture         = Column(Integer, ForeignKey("factures.idFacture"),  nullable=False)
    idCourrier        = Column(Integer, ForeignKey("courriers.idCourrier"), nullable=False)
    dateAssociation   = Column(DateTime, server_default=func.now())


# ─────────────────────────────────────────
# TABLE : utilisateurs
# ─────────────────────────────────────────
class Utilisateur(Base):
    __tablename__ = "utilisateurs"

    idUtilisateur = Column(Integer, primary_key=True, autoincrement=True)
    nom           = Column(String(100), nullable=False)
    prenom        = Column(String(100), nullable=False)
    email         = Column(String(150), nullable=False, unique=True)
    motDePasse    = Column(String(255), nullable=False)
    role          = Column(Enum(RoleEnum), nullable=False)
    actif         = Column(Boolean, default=True)
    created_at    = Column(DateTime, server_default=func.now())

    # Relations
    factures    = relationship("Facture",    back_populates="instructeur")
    validations = relationship("Validation", back_populates="utilisateur")
    tickets     = relationship("TicketEB",   back_populates="generePar")
    alertes     = relationship("Alerte",     back_populates="destinataire")
    logs        = relationship("Log",        back_populates="utilisateur")


# ─────────────────────────────────────────
# TABLE : courriers
# Données importées depuis Mailsoft via Debezium/Kafka
# ─────────────────────────────────────────
class Courrier(Base):
    __tablename__ = "courriers"

    idCourrier      = Column(Integer, primary_key=True, autoincrement=True)
    numero_courrier = Column(String(100), nullable=False, unique=True)
    objet_courrier  = Column(Text)
    expediteur      = Column(String(100))
    destinataire    = Column(String(100))
    date_signature  = Column(Date)
    position        = Column(String(200))   # Service actuel du courrier dans Mailsoft
    parcours        = Column(String(200))   # Historique du parcours, ex: "DSI,DG,DCF"
    created_at      = Column(DateTime, server_default=func.now())

    # Relation many-to-many avec Facture via la table de jonction
    factures = relationship(
        "Facture",
        secondary="facture_courrier",
        back_populates="courriers"
    )


# ─────────────────────────────────────────
# TABLE : factures
# Entité centrale — suit une facture de A à Z
# ─────────────────────────────────────────
class Facture(Base):
    __tablename__ = "factures"

    idFacture     = Column(Integer, primary_key=True, autoincrement=True)
    codeUnique    = Column(String(200), nullable=False, unique=True)
    referenceEB   = Column(String(100))
    statut        = Column(Enum(StatutFactureEnum), default=StatutFactureEnum.RECEPTIONNE)
    dateReception = Column(DateTime, server_default=func.now())
    dateEcheance  = Column(DateTime, server_default=func.now())
    created_at    = Column(DateTime, server_default=func.now())
    updated_at    = Column(DateTime, server_default=func.now(), onupdate=func.now())

    # Clé étrangère vers l'instructeur qui gère la facture
    idUtilisateur = Column(Integer, ForeignKey("utilisateurs.idUtilisateur"))

    # Relations
    courriers   = relationship(
        "Courrier",
        secondary="facture_courrier",
        back_populates="factures"
    )
    instructeur = relationship("Utilisateur",  back_populates="factures")
    validations = relationship("Validation",   back_populates="facture")
    ticket      = relationship("TicketEB",     back_populates="facture", uselist=False)
    alertes     = relationship("Alerte",       back_populates="facture")
    logs        = relationship("Log",          back_populates="facture")


# ─────────────────────────────────────────
# TABLE : validations
# Contient ExpressionBesoin (Carthago) + EtapeTraitement
# Les colonnes CODE_, DESCRIPTION_... correspondent exactement
# aux noms de colonnes dans le schéma SQL (suffixe _)
# ─────────────────────────────────────────
class Validation(Base):
    __tablename__ = "validations"

    idValidation = Column(Integer, primary_key=True, autoincrement=True)

    # ── Données ExpressionBesoin issues de Carthago Budget ────────────────
    # Noms alignés avec le schéma SQL (suffixe _) et avec le frontend
    # qui accède à step.DESCRIPTION_ dans TraceModal
    CODE            = Column("CODE",         String(100))
    DESCRIPTION     = Column("DESCRIPTION",  Text)
    DOCUMENTDATE    = Column("DOCUMENTDAT", Date)
    TYPE           = Column("TYPE",         String(200))
    IDENTIFIER  = Column("IDENTIFIER",   String(100))
    CUSER       = Column("CUSER",        String(100))
    UUSER       = Column("UUSER",        String(100))
    CDATE       = Column("CDATE",        DateTime)
    UDATE       = Column("UDATE",        DateTime)
    VERSIONNUM  = Column("VERSIONNUM",   Integer, default=1)
    WITHFORCING = Column("WITHFORCING",  Boolean, default=False)

    # ── Données EtapeTraitement ───────────────────────────────────────────
    nomEtape    = Column(String(150))
    statutEtape = Column(Enum(StatutEtapeEnum), default=StatutEtapeEnum.EN_COURS)
    dateDebut   = Column(DateTime)
    dateFin     = Column(DateTime)
    delaiJours  = Column(Integer, default=0)
    commentaire = Column(Text)

    # Clés étrangères
    idFacture     = Column(Integer, ForeignKey("factures.idFacture"),      nullable=False)
    idUtilisateur = Column(Integer, ForeignKey("utilisateurs.idUtilisateur"))

    # Relations
    facture     = relationship("Facture",     back_populates="validations")
    utilisateur = relationship("Utilisateur", back_populates="validations")
    logs        = relationship("Log",         back_populates="validation")


# ─────────────────────────────────────────
# TABLE : tickets_eb
# Ticket généré automatiquement lors de la saisie EB.
# Le router factures.py le crée dans saisir_reference_eb()
# et retourne le codeTicket directement dans la réponse API,
# sans appel supplémentaire nécessaire côté frontend.
# ─────────────────────────────────────────
class TicketEB(Base):
    __tablename__ = "tickets_eb"

    idTicket       = Column(Integer, primary_key=True, autoincrement=True)
    codeTicket     = Column(String(100), nullable=False, unique=True)
    dateGeneration = Column(DateTime, server_default=func.now())
    # Copie de la référence EB pour retrouver le ticket sans jointure
    referenceEB    = Column(String(100))

    # Clés étrangères
    idFacture     = Column(Integer, ForeignKey("factures.idFacture"),      nullable=False)
    idUtilisateur = Column(Integer, ForeignKey("utilisateurs.idUtilisateur"))

    # Relations
    facture   = relationship("Facture",     back_populates="ticket")
    generePar = relationship("Utilisateur", back_populates="tickets")


# ─────────────────────────────────────────
# TABLE : alertes
# Alertes automatiques (retards, blocages, pièces manquantes)
# ─────────────────────────────────────────
class Alerte(Base):
    __tablename__ = "alertes"

    idAlerte     = Column(Integer, primary_key=True, autoincrement=True)
    typeAlerte   = Column(Enum(TypeAlerteEnum), nullable=False)
    message      = Column(Text, nullable=False)
    lue          = Column(Boolean, default=False)
    dateEmission = Column(DateTime, server_default=func.now())

    # Clés étrangères
    idFacture     = Column(Integer, ForeignKey("factures.idFacture"),      nullable=False)
    idUtilisateur = Column(Integer, ForeignKey("utilisateurs.idUtilisateur"))

    # Relations
    facture      = relationship("Facture",     back_populates="alertes")
    destinataire = relationship("Utilisateur", back_populates="alertes")


# ─────────────────────────────────────────
# TABLE : logs
# Journal complet et immuable de toutes les actions.
# topicKafka est NULL pour les actions manuelles,
# renseigné pour les actions déclenchées par le consumer Kafka.
# ─────────────────────────────────────────
class Log(Base):
    __tablename__ = "logs"

    idLog         = Column(Integer, primary_key=True, autoincrement=True)
    action        = Column(Enum(ActionLogEnum), nullable=False)
    ancienStatut  = Column(String(100))
    nouveauStatut = Column(String(100))
    commentaire   = Column(Text)
    topicKafka    = Column(String(200))  # NULL si action manuelle
    dateAction    = Column(DateTime, server_default=func.now())

    # Clés étrangères
    idFacture     = Column(Integer, ForeignKey("factures.idFacture"))
    idUtilisateur = Column(Integer, ForeignKey("utilisateurs.idUtilisateur"))
    idValidation  = Column(Integer, ForeignKey("validations.idValidation"))

    # Relations
    facture     = relationship("Facture",     back_populates="logs")
    utilisateur = relationship("Utilisateur", back_populates="logs")
    validation  = relationship("Validation",  back_populates="logs")