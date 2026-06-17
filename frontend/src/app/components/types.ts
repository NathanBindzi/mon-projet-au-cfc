// Types dérivés des schemas OpenAPI de l'API CFC Invoice Tracker

export type RoleEnum = "AGENT_COURRIER" | "INSTRUCTEUR" | "SUPERVISEUR" | "ADMINISTRATEUR";
export type StatutFactureEnum = "RECEPTIONNE" | "EN_INSTRUCTION" | "EB_SAISI" | "VALIDE" | "BLOQUE" | "PAYE";
export type StatutEtapeEnum = "EN_COURS" | "VALIDEE" | "REJETEE" | "BLOQUEE";
export type Page = "accueil" | "factures" | "habilitations" | "tableau_de_bord" | "logs";

export interface TokenSchema {
  access_token: string;
  token_type: string;
  utilisateur: Record<string, unknown>;
}

export interface ProfilSchema {
  idUtilisateur: number;
  nom: string;
  prenom: string;
  email: string;
  role: RoleEnum;
  actif: boolean;
}

export interface UtilisateurResponse {
  idUtilisateur: number;
  nom: string;
  prenom: string;
  email: string;
  role: RoleEnum;
  actif: boolean;
}

export interface FactureResponse {
  idFacture: number;
  codeUnique: string;
  referenceEB: string | null;
  statut: StatutFactureEnum;
  dateReception: string | null;
  dateEcheance: string | null;
  idCourrier?: number;
  courriers?: CourrierResponse[];
  idUtilisateur: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SaisirReferenceEBResponse {
  message: string;
  referenceEB: string;
  statut: StatutFactureEnum;
}

export interface CourrierResponse {
  idCourrier: number;
  numero_courrier: string;
  objet_courrier: string | null;
  expediteur: string | null;
  destinataire: string | null;
  date_signature: string | null;
  position: string | null;
  parcours: string | null;
}

export interface ValidationResponse {
  idValidation: number;
  nomEtape: string | null;
  statutEtape: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  delaiJours: number | null;
  commentaire: string | null;
  CODE_: string | null;
  DESCRIPTION_: string | null;
  idFacture: number;
}

export interface LogResponse {
  idLog:           number;
  action:          string;
  ancienStatut:    string | null;
  nouveauStatut:   string | null;
  commentaire:     string | null;
  topicKafka:      string | null;
  dateAction:      string | null;
  idFacture:       number | null;
  codeFacture:     string | null;   // code lisible de la facture
  idUtilisateur:   number | null;
  nomUtilisateur:  string | null;   // prénom + nom de l'agent
}

export interface AlerteResponse {
  idAlerte: number;
  typeAlerte: string;
  message: string;
  lue: boolean;
  dateEmission: string | null;
  idFacture: number;
}

// ─── Sous-types pour DashboardStats ──────────────────────────────────────────

export interface ParStatutItem {
  statut: string;
  total:  number;
}

export interface ServiceStat {
  service:             string;
  duree_moyenne_jours: number;
  nombre_factures:     number;
}

export interface DashboardStats {
  // Comptages par statut
  total?:            number;
  alertes_non_lues?: number;
  par_statut?:       ParStatutItem[];
  receptionne?:      number;
  en_instruction?:   number;
  eb_saisi?:         number;
  valide?:           number;
  bloque?:           number;
  paye?:             number;

  // KPIs de performance
  delai_moyen_jours?: number;         // Délai moyen de traitement en jours
  taux_retard?:       number;         // % de factures en retard
  en_retard?:         number;         // Nombre absolu de factures en retard
  nombre_blocages?:   number;         // Nombre total d'événements DOSSIER_BLOQUE
  taux_tracabilite?:  number;         // % de factures entièrement tracées
  factures_tracees?:  number;         // Nombre absolu de factures tracées
  duree_par_service?: ServiceStat[];  // Durée moy. par service, triée décroissante
}

// Facture enrichie : FactureResponse + données courrier
export interface FactureEnrichie extends FactureResponse {
  courrier?: CourrierResponse;
}