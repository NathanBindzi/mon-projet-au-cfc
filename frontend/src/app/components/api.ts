import {
  TokenSchema, ProfilSchema, UtilisateurResponse, FactureResponse,
  CourrierResponse, ValidationResponse, LogResponse, AlerteResponse,
  DashboardStats, RoleEnum, StatutFactureEnum,
} from "./types";

// ─── URL de base ─────────────────────────────────────────────────────────────
const BASE_URL  = (import.meta as any).env?.VITE_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "suifact_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ─── Réponse saisie EB ───────────────────────────────────────────────────────
// Le backend génère automatiquement le ticket EB lors de la saisie de la
// référence EB et retourne son code dans cette réponse.
// Le frontend n'a donc plus besoin d'appeler apiGenererTicketEB séparément.
export interface SaisirReferenceEBResponse {
  message:     string;
  referenceEB: string;
  statut:      string;
  codeTicket:  string;  // ← ticket généré automatiquement côté backend
}

// ─── Fetch générique avec JWT ─────────────────────────────────────────────────
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token   = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!headers["Content-Type"] && options.method && options.method !== "GET") {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    throw new Error("Session expirée. Veuillez vous reconnecter.");
  }
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail)) msg = body.detail.map((d: any) => d.msg).join(", ");
    } catch {/* ignore */}
    throw new Error(msg);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export async function apiLogin(email: string, password: string): Promise<TokenSchema> {
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    form.toString(),
  });

  if (!res.ok) {
    let msg = "Identifiants incorrects";
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
    } catch {/* ignore */}
    throw new Error(msg);
  }

  const data: TokenSchema = await res.json();
  setToken(data.access_token);
  return data;
}

export function apiGetProfil(): Promise<ProfilSchema> {
  return apiFetch<ProfilSchema>("/api/auth/me");
}

export function apiRegister(payload: {
  nom: string; prenom: string; email: string; motDePasse: string; role: RoleEnum;
}): Promise<unknown> {
  return apiFetch("/api/auth/register", {
    method: "POST",
    body:   JSON.stringify(payload),
  });
}

// ─── Utilisateurs ─────────────────────────────────────────────────────────────
export function apiGetUtilisateurs(): Promise<UtilisateurResponse[]> {
  return apiFetch<UtilisateurResponse[]>("/api/utilisateurs/");
}

export function apiActiverUtilisateur(id: number): Promise<unknown> {
  return apiFetch(`/api/utilisateurs/${id}/activer`, { method: "PUT" });
}

export function apiDesactiverUtilisateur(id: number): Promise<unknown> {
  return apiFetch(`/api/utilisateurs/${id}/desactiver`, { method: "PUT" });
}

export function apiModifierRole(id: number, role: RoleEnum): Promise<unknown> {
  return apiFetch(`/api/utilisateurs/${id}/role`, {
    method: "PUT",
    body:   JSON.stringify({ role }),
  });
}

// ─── Factures ─────────────────────────────────────────────────────────────────
export function apiGetFactures(params?: {
  statut?: string;
  skip?:   number;
  limit?:  number;
}): Promise<FactureResponse[]> {
  const q = new URLSearchParams();
  if (params?.statut)             q.set("statut", params.statut);
  if (params?.skip  !== undefined) q.set("skip",   String(params.skip));
  if (params?.limit !== undefined) q.set("limit",  String(params.limit));
  const qs = q.toString();
  return apiFetch<FactureResponse[]>(`/api/factures/${qs ? `?${qs}` : ""}`);
}

export function apiRechercherFactures(q: string): Promise<FactureResponse[]> {
  return apiFetch<FactureResponse[]>(
    `/api/factures/recherche?q=${encodeURIComponent(q)}`
  );
}

export function apiGetFacture(id: number): Promise<unknown> {
  return apiFetch(`/api/factures/${id}`);
}

export function apiGetDashboardStats(): Promise<DashboardStats> {
  return apiFetch<DashboardStats>("/api/factures/dashboard/stats");
}

export function apiSynchroniserCourriersFactures(): Promise<unknown> {
  return apiFetch("/api/factures/synchroniser-courriers", { method: "POST" });
}

/**
 * Saisit la référence EB.
 *
 * Le backend :
 *   1. Met le statut à EB_SAISI
 *   2. Génère automatiquement le ticket EB
 *   3. Retourne le codeTicket dans la réponse
 *
 * → Ne plus appeler apiGenererTicketEB après cet appel, c'est redondant.
 */
export function apiSaisirReferenceEB(
  id:          number,
  referenceEB: string
): Promise<SaisirReferenceEBResponse> {
  return apiFetch<SaisirReferenceEBResponse>(
    `/api/factures/${id}/reference-eb`,
    {
      method: "PUT",
      body:   JSON.stringify({ referenceEB }),
    }
  );
}

export function apiChangerStatut(
  id:          number,
  statut:      StatutFactureEnum,
  commentaire: string
): Promise<unknown> {
  return apiFetch(`/api/factures/${id}/statut`, {
    method: "PUT",
    body:   JSON.stringify({ statut, commentaire }),
  });
}

export function apiBloquerFacture(id: number, commentaire: string): Promise<unknown> {
  return apiFetch(
    `/api/factures/${id}/bloquer?commentaire=${encodeURIComponent(commentaire)}`,
    { method: "PUT" }
  );
}

export function apiDebloquerFacture(id: number, commentaire: string): Promise<unknown> {
  return apiFetch(
    `/api/factures/${id}/debloquer?commentaire=${encodeURIComponent(commentaire)}`,
    { method: "PUT" }
  );
}

export function apiGetHistoriqueFacture(id: number): Promise<LogResponse[]> {
  return apiFetch<LogResponse[]>(`/api/factures/${id}/historique`);
}

// ─── Courriers ────────────────────────────────────────────────────────────────
// Note : dans FacturesPage, les courriers sont déjà inclus dans facture.courriers[].
// apiGetCourriers est conservé ici pour les autres pages qui en auraient besoin
// (ex. : page dédiée à la liste des courriers).
export function apiGetCourriers(): Promise<CourrierResponse[]> {
  return apiFetch<CourrierResponse[]>("/api/courriers/");
}

export function apiGetParcoursCourrier(idCourrier: number): Promise<unknown> {
  return apiFetch(`/api/courriers/${idCourrier}/parcours`);
}

// ─── Validations ──────────────────────────────────────────────────────────────
export function apiGetValidationsFacture(id: number): Promise<ValidationResponse[]> {
  return apiFetch<ValidationResponse[]>(`/api/validations/facture/${id}`);
}

export function apiMettreAJourValidation(
  idValidation: number,
  data: {
    statutEtape: string;
    commentaire?: string;
    dateFin?:     string;  // format ISO : "2024-03-15T14:30"
  }
): Promise<unknown> {
  return apiFetch(`/api/validations/${idValidation}`, {
    method: "PUT",
    body:   JSON.stringify(data),
  });
}


export function apiCreerValidation(
  idFacture: number,
  data: {
    nomEtape:    string;
    dateDebut?:  string;  // format ISO
    commentaire?: string;
  }
): Promise<unknown> {
  return apiFetch(`/api/validations/facture/${idFacture}`, {
    method: "POST",
    body:   JSON.stringify(data),
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// UTILISATION dans FacturesPage.tsx
// ═══════════════════════════════════════════════════════════════════════════════
//
// 1. Ajouter l'import :
//    import { GestionFactureModal } from "./GestionFactureModal";
//
// 2. Ajouter l'état dans FacturesPage :
//    const [gestionFacture, setGestionFacture] = useState<FactureResponse | null>(null);
//
// 3. Ajouter une variable de permission :
//    const canGerer = role !== "AGENT_COURRIER";
//
// 4. Dans le tableau, ajouter un bouton par ligne dans la colonne Actions :
//
//    import { Settings } from "lucide-react";
//
//    {canGerer && (
//      <button
//        onClick={() => setGestionFacture(inv)}
//        className="p-1.5 rounded-lg hover:bg-blue-50 hover:text-blue-700 text-[#5f7291] transition-colors"
//        title="Gérer la facture"
//      >
//        <Settings className="w-4 h-4" />
//      </button>
//    )}
//
// 5. Ajouter le modal en bas du composant (avant la fermeture de </div>) :
//
//    {gestionFacture && (
//      <GestionFactureModal
//        facture={gestionFacture}
//        currentUser={currentUser}
//        onClose={() => setGestionFacture(null)}
//        onSaved={load}
//      />
//    )}

// ─── Tickets EB ───────────────────────────────────────────────────────────────
/**
 * Génère manuellement un ticket EB.
 *
 * Note : après apiSaisirReferenceEB, le ticket est déjà généré automatiquement.
 * Cet endpoint sert uniquement en cas de re-génération manuelle exceptionnelle.
 */
export function apiGenererTicketEB(idFacture: number): Promise<unknown> {
  return apiFetch(`/api/ticketEB/generer/${idFacture}`, { method: "POST" });
}

export function apiGetTicketEB(idFacture: number): Promise<{
  idTicket:       number;
  codeTicket:     string;
  dateGeneration: string;
  idFacture:      number;
} | null> {
  return apiFetch(`/api/ticketEB/facture/${idFacture}`);
}

/**
 * Ouvre le PDF du ticket EB dans un nouvel onglet.
 *
 * Le PDF est généré côté serveur par ReportLab (endpoint GET /pdf).
 * On construit l'URL avec le token JWT en query param car on ne peut
 * pas mettre de header Authorization sur une balise <a> ou window.open.
 *
 * Le backend doit accepter le token en query param "token" :
 *   GET /api/ticketEB/facture/{id}/pdf?token=<jwt>
 *
 * Si le backend ne supporte pas encore ce mécanisme, on peut aussi
 * faire un fetch() vers l'endpoint, récupérer le blob et créer
 * une URL objet — c'est ce que fait apiTelechargerTicketPDFBlob ci-dessous.
 */
export function getTicketPDFUrl(idFacture: number): string {
  const token = getToken();
  return `${BASE_URL}/api/ticketEB/facture/${idFacture}/pdf?token=${token ?? ""}`;
}

/**
 * Télécharge le PDF du ticket via fetch() (avec le header Authorization)
 * puis crée une URL objet blob pour l'ouvrir dans un nouvel onglet.
 *
 * Utiliser cette fonction quand le backend n'accepte pas le token
 * en query param (cas par défaut de ce projet).
 */
export async function apiTelechargerTicketPDF(idFacture: number): Promise<void> {
  const token = getToken();

  const res = await fetch(`${BASE_URL}/api/ticketEB/facture/${idFacture}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401) {
    clearToken();
    throw new Error("Session expirée. Veuillez vous reconnecter.");
  }
  if (!res.ok) {
    let msg = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
    } catch {/* ignore */}
    throw new Error(msg);
  }

  // Convertit la réponse en Blob (données binaires du PDF)
  const blob = await res.blob();

  // Crée une URL temporaire pointant sur ce blob en mémoire
  const url = URL.createObjectURL(blob);

  // Ouvre le PDF dans un nouvel onglet — le navigateur affiche son lecteur PDF natif
  const a   = document.createElement("a");
  a.href    = url;
  a.target  = "_blank";
  // Pour forcer un téléchargement plutôt qu'un aperçu, décommenter :
  // a.download = `ticket-EB-facture-${idFacture}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Libère la mémoire après un court délai
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ─── Alertes ──────────────────────────────────────────────────────────────────
export function apiGetAlertes(lue?: boolean): Promise<AlerteResponse[]> {
  const qs = lue !== undefined ? `?lue=${lue}` : "";
  return apiFetch<AlerteResponse[]>(`/api/alertes/${qs}`);
}

export function apiCountAlertesNonLues(): Promise<{ non_lues: number }> {
  return apiFetch<{ non_lues: number }>("/api/alertes/stats/non-lues");
}

export function apiMarquerAlerteLue(id: number): Promise<unknown> {
  return apiFetch(`/api/alertes/${id}/lue`, { method: "PUT" });
}

// ─── Logs ─────────────────────────────────────────────────────────────────────
export function apiGetLogs(params?: {
  action?: string;
  skip?:   number;
  limit?:  number;
}): Promise<LogResponse[]> {
  const q = new URLSearchParams();
  if (params?.action)             q.set("action", params.action);
  if (params?.skip  !== undefined) q.set("skip",  String(params.skip));
  if (params?.limit !== undefined) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch<LogResponse[]>(`/api/logs/${qs ? `?${qs}` : ""}`);
}