/* Script d'initialisation de la base de données pour le projet de gestion des factures et courriers */

CREATE DATABASE IF NOT EXISTS cfc_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE cfc_db;

/* Table staging alimentée par carthago-sink-connector (schema.evolution=none) */
CREATE TABLE IF NOT EXISTS carthago_staging (
    CODE             VARCHAR(100) NOT NULL PRIMARY KEY,
    DESCRIPTION      TEXT,
    DOCUMENTDAT      DATE,
    TYPE             VARCHAR(200),
    IDENTIFIER       VARCHAR(100),
    CUSER            VARCHAR(100),
    UUSER            VARCHAR(100),
    CDATE            DATETIME,
    UDATE            DATETIME,
    VERSIONNUM       INT,
    WITHFORCING      TINYINT(1) DEFAULT 0,
    ERREUR           TEXT,
    ISWITHGENERATION TINYINT(1) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS utilisateurs (
    idUtilisateur   INT          AUTO_INCREMENT PRIMARY KEY,
    nom             VARCHAR(100) NOT NULL,
    prenom          VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    motDePasse      VARCHAR(255) NOT NULL,
    role            ENUM('AGENT_COURRIER','INSTRUCTEUR',
                         'VALIDATEUR','SUPERVISEUR',
                         'ADMINISTRATEUR') NOT NULL,
    actif           TINYINT(1)   DEFAULT 1,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courriers (
    idCourrier              INT          AUTO_INCREMENT PRIMARY KEY,
    numero_courrier         VARCHAR(100) NOT NULL UNIQUE,
    objet_courrier          TEXT,
    expediteur              VARCHAR(100),
    destinataire            VARCHAR(100),
    date_signature          DATE,
    position                VARCHAR(200),
    parcours                VARCHAR(200), 
    created_at              DATETIME     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS factures (
    idFacture       INT          AUTO_INCREMENT PRIMARY KEY,
    codeUnique      VARCHAR(200) NOT NULL UNIQUE,
    referenceEB     VARCHAR(100),
    statut          ENUM('RECEPTIONNE','EN_INSTRUCTION',
                         'EB_SAISI','VALIDE',
                         'BLOQUE','PAYE') DEFAULT 'RECEPTIONNE',
    dateReception   DATETIME     DEFAULT CURRENT_TIMESTAMP,
    dateEcheance    DATE,
    created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP
                                 ON UPDATE CURRENT_TIMESTAMP,
    idUtilisateur   INT,
    FOREIGN KEY (idUtilisateur) REFERENCES utilisateurs(idUtilisateur)
);

/* Table de jonction : Relation many-to-many entre factures et courriers */
CREATE TABLE IF NOT EXISTS facture_courrier (
    idFactureCourrier INT          AUTO_INCREMENT PRIMARY KEY,
    idFacture         INT          NOT NULL,
    idCourrier        INT          NOT NULL,
    dateAssociation   DATETIME     DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (idFacture)     REFERENCES factures(idFacture) ON DELETE CASCADE,
    FOREIGN KEY (idCourrier)    REFERENCES courriers(idCourrier) ON DELETE CASCADE,
    UNIQUE KEY unique_facture_courrier (idFacture, idCourrier)
);

CREATE TABLE IF NOT EXISTS tickets_eb (
    idTicket        INT          AUTO_INCREMENT PRIMARY KEY,
    codeTicket      VARCHAR(100) NOT NULL UNIQUE,
    dateGeneration  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    referenceEB     VARCHAR(100),
    idFacture       INT          NOT NULL,
    idUtilisateur   INT,
    FOREIGN KEY (idFacture)     REFERENCES factures(idFacture),
    FOREIGN KEY (idUtilisateur) REFERENCES utilisateurs(idUtilisateur)
);

CREATE TABLE IF NOT EXISTS validations (
    idValidation    INT          AUTO_INCREMENT PRIMARY KEY,
    -- Infos ExpressionBesoin (Carthago)
    CODE           VARCHAR(100),
    DESCRIPTION    TEXT,
    DOCUMENTDATE   DATE,
    TYPE           VARCHAR(200),
    IDENTIFIER     VARCHAR(100),
    CUSER          VARCHAR(100),
    UUSER          VARCHAR(100),
    CDATE          DATETIME,
    UDATE          DATETIME,
    VERSIONNUM     INT          DEFAULT 1,
    WITHFORCING_    TINYINT(1)   DEFAULT 0,
    -- Infos EtapeTraitement
    nomEtape        VARCHAR(150),
    statutEtape     ENUM('EN_COURS','VALIDEE',
                         'REJETEE','BLOQUEE') DEFAULT 'EN_COURS',
    dateDebut       DATETIME,
    dateFin         DATETIME,
    delaiJours      INT          DEFAULT 0,
    commentaire     TEXT,
    -- Relations
    idFacture       INT          NOT NULL,
    idUtilisateur   INT,
    FOREIGN KEY (idFacture)     REFERENCES factures(idFacture),
    FOREIGN KEY (idUtilisateur) REFERENCES utilisateurs(idUtilisateur)
);

CREATE TABLE IF NOT EXISTS alertes (
    idAlerte        INT          AUTO_INCREMENT PRIMARY KEY,
    typeAlerte      ENUM('DEPASSEMENT_DELAI','BLOCAGE_DOSSIER',
                         'PIECE_MANQUANTE') NOT NULL,
    message         TEXT         NOT NULL,
    lue             TINYINT(1)   DEFAULT 0,
    dateEmission    DATETIME     DEFAULT CURRENT_TIMESTAMP,
    idFacture       INT          NOT NULL,
    idUtilisateur   INT,
    FOREIGN KEY (idFacture)     REFERENCES factures(idFacture),
    FOREIGN KEY (idUtilisateur) REFERENCES utilisateurs(idUtilisateur)
);

CREATE TABLE IF NOT EXISTS logs (
    idLog           INT          AUTO_INCREMENT PRIMARY KEY,
    action          VARCHAR(200) NOT NULL,
    ancienStatut    VARCHAR(100),
    nouveauStatut   VARCHAR(100),
    commentaire     TEXT,
    topicKafka      VARCHAR(200),
    dateAction      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    idFacture       INT,
    idUtilisateur   INT,
    FOREIGN KEY (idFacture)     REFERENCES factures(idFacture),
    FOREIGN KEY (idUtilisateur) REFERENCES utilisateurs(idUtilisateur)
);

/* Table pour stocker les données de Carthago liées aux factures */
USE Carthago_budget;

CREATE TABLE IF NOT EXISTS carthago (
    id                  INT          AUTO_INCREMENT PRIMARY KEY,
    CDATE              DATETIME,
    CUSER              VARCHAR(100),
    UUSER              VARCHAR(100),
    CODE               VARCHAR(100) NOT NULL UNIQUE,
    DESCRIPTION        TEXT,
    DOCUMENTDAT       DATE,
    ERREUR             TEXT,
    IDENTIFIER         VARCHAR(100),
    ISWITHGENERATION   TINYINT(1)   DEFAULT 0,
    TYPE               VARCHAR(200),
    UDATE              DATETIME,
    VERSIONNUM         INT,
    WITHFORCING        TINYINT(1)   DEFAULT 0,
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP
);

/* Table pour stocker les données   de mailsoft */
CREATE DATABASE IF NOT EXISTS mailsoft
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE mailsoft;

CREATE TABLE IF NOT EXISTS mailsoft (
    id                          INT          AUTO_INCREMENT PRIMARY KEY,
    NUMERO_COURRIER             VARCHAR(100) NOT NULL UNIQUE,
    NUMERO_EXPEDITEUR           VARCHAR(100),
    ID_DOSSIER                  INT,
    NUMERO_SERVICE_CREATION     INT,
    ID_CLASSE_OBJET             VARCHAR(100),
    NUMERO_DESTINATAIRE         INT,
    CODE_TYPE_COURRIER          VARCHAR(50),
    CODE_NATURE_COURRIER        VARCHAR(50),
    OBJET_COURRIER              TEXT,
    DATE1                       DATETIME,
    DATE_EXTERNE                DATE,
    REFERENCE_EXTERNE           VARCHAR(100),
    DATE_SIGNATURE              DATE,
    DATE_DEPOT                  DATE,
    REFERENCE_DEPOT             VARCHAR(100),
    MESSAGE_ELECTRONIQUE        TEXT,
    DATE_SUPPRESSION            DATETIME,
    MSG_ELECTRONIQUE_ENVOYE     TINYINT(1)   DEFAULT 0,
    MESSAGE_ID                  VARCHAR(100),
    ID_DOSSIER_COURRIER         INT,
    NUMERO_PERSONNE_SIGNATAIRE  VARCHAR(100),
    ID_MENTION                  INT,
    POSITION                    INT,
    DATE_DERNIER_MVT            DATETIME,
    POSITION_STR                VARCHAR(200),
    NUMERO_BORDEREAU_DEPART     VARCHAR(100),
    DATE_DECHARGE               DATETIME,
    NUM_PERSONNE_DECHARGE       VARCHAR(100),
    DATE_EXT_DECHARGE           DATETIME,
    NOM_PERSONNE_DECHARGE_EXT   VARCHAR(200),
    NUMERO_OPERATEUR_SAISIE     VARCHAR(100),
    EST_ARCHIVE                 TINYINT(1)   DEFAULT 0,
    OBSERVATION                 TEXT,
    ETAT_TRTMT                  VARCHAR(100),
    NOM_CLASSEUR                VARCHAR(200),
    EST_CLASSE                  TINYINT(1)   DEFAULT 0,
    NUMERO_PERSONNE_MODIFICATION VARCHAR(100),
    DATE_DERNIERE_MODIFICATION  DATETIME,
    EST_REJETTE                 TINYINT(1)   DEFAULT 0,
    ENREGISTRE_EN_REGULATISATION TINYINT(1)  DEFAULT 0,
    DEPOSANT_NOM                VARCHAR(200),
    DEPOSANT_CONTACT            VARCHAR(200),
    NUMERO_DEUXIEME_SIGNATAIRE  VARCHAR(100),
    DATE_DEUXIEME_SIGNATURE     DATE,
    created_at                  DATETIME     DEFAULT CURRENT_TIMESTAMP
);