import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search, Eye, Edit3, Printer, X, CheckCircle, Clock,
  MapPin, ArrowRight, Hash, Loader2, XCircle, RefreshCw, Settings,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from "lucide-react";

// ── Constante : nombre de lignes affichées par page ───────────────────────────
// Changer cette valeur suffit pour ajuster la taille de toutes les pages.
const PAGE_SIZE = 15;
import {
  apiGetFactures,
  apiSaisirReferenceEB,
  apiGetTicketEB,
  apiTelechargerTicketPDF,
  apiGetValidationsFacture,
  apiGetHistoriqueFacture,
  apiSynchroniserCourriersFactures,
} from "./api";
// Import du modal de gestion complète (statut, étapes, historique)
import { GestionFactureModal } from "./GestionFactureModal";
import {
  FactureResponse, CourrierResponse,
  ValidationResponse, LogResponse, ProfilSchema
} from "./types";
import { getStatutConfig, getStatutEtapeConfig, formatDate, formatDateTime } from "./utils";
import { useFacturesWebSocket } from "./hooks/useFacturesWebSocket";

interface FacturesPageProps {
  currentUser: ProfilSchema;
}

// ─── TraceModal ──────────────────────────────────────────────────────────────
// Modal en lecture seule : affiche le parcours Mailsoft + les étapes de
// traitement (validations) ou l'historique des actions (logs).
// Accessible via le bouton œil (SUPERVISEUR / ADMINISTRATEUR uniquement).

function TraceModal({
  facture,
  courrier,
  onClose,
}: {
  facture: FactureResponse;
  courrier?: CourrierResponse;
  onClose: () => void;
}) {
  const [validations, setValidations] = useState<ValidationResponse[]>([]);
  const [historique, setHistorique]   = useState<LogResponse[]>([]);
  const [loading, setLoading]         = useState(true);

  // Chargement parallèle des validations et de l'historique au montage
  useEffect(() => {
    Promise.all([
      apiGetValidationsFacture(facture.idFacture).catch(() => []),
      apiGetHistoriqueFacture(facture.idFacture).catch(() => []),
    ]).then(([v, h]) => {
      setValidations(v);
      setHistorique(h);
      setLoading(false);
    });
  }, [facture.idFacture]);

  const cfg = getStatutConfig(facture.statut);
  // Découpe le parcours "DSI,DG,DCF" en tableau ["DSI", "DG", "DCF"]
  const parcoursEtapes = (courrier?.parcours ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose} // clic sur l'overlay ferme le modal
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col"
        style={{ fontFamily: "'Figtree', sans-serif" }}
        onClick={(e) => e.stopPropagation()} // empêche la fermeture au clic intérieur
      >
        {/* ── En-tête ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-black/6">
          <div>
            <h2 className="text-[#0f1e36] font-bold" style={{ fontSize: "1.1rem" }}>
              Parcours de la facture
            </h2>
            <p className="font-mono text-xs text-[#5f7291] mt-0.5">{facture.codeUnique}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#eef1f7] rounded-xl transition-colors"
          >
            <X className="w-4 h-4 text-[#5f7291]" />
          </button>
        </div>

        {/* ── Bandeau infos courrier ────────────────────────────────────────── */}
        <div className="px-6 py-3 bg-[#f8fafc] border-b border-black/5 flex flex-wrap gap-4">
          <div>
            <p className="text-xs text-[#5f7291]">Expéditeur</p>
            <p className="text-sm font-semibold text-[#0f1e36]">{courrier?.expediteur ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[#5f7291]">Objet</p>
            <p className="text-sm font-semibold text-[#0f1e36] max-w-[220px] truncate">
              {courrier?.objet_courrier ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5f7291]">Position actuelle</p>
            <p className="text-sm font-semibold text-[#0f1e36]">{courrier?.position ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[#5f7291]">Statut</p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
        </div>

        {/* ── Corps scrollable ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Section parcours Mailsoft */}
          {!loading && (
            <div className="mb-6">
              <p className="text-xs font-semibold text-[#5f7291] uppercase tracking-wider mb-4">
                Parcours Mailsoft
              </p>
              {parcoursEtapes.length > 0 ? (
                <div className="space-y-3">
                  {parcoursEtapes.map((etape, index) => (
                    <div
                      key={`${etape}-${index}`}
                      className="flex items-start gap-3 bg-[#f8fafc] border border-black/6 rounded-xl p-3"
                    >
                      {/* Numéro d'étape */}
                      <div className="w-7 h-7 rounded-full bg-[#1e63d0] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#0f1e36]">{etape}</p>
                        {/* Indique la position actuelle sur la dernière étape */}
                        {index === parcoursEtapes.length - 1 && (
                          <p className="text-xs text-[#5f7291] mt-0.5">
                            Position actuelle : {courrier?.position ?? "non renseignée"}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 bg-[#f8fafc] border border-black/6 rounded-xl text-[#5f7291] text-sm">
                  Aucun parcours Mailsoft enregistré pour ce courrier.
                </div>
              )}
            </div>
          )}

          {/* Section étapes de traitement ou historique */}
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 text-[#1e63d0] animate-spin" />
            </div>
          ) : validations.length > 0 ? (
            // Priorité : afficher les étapes (validations) si elles existent
            <>
              <p className="text-xs font-semibold text-[#5f7291] uppercase tracking-wider mb-4">
                Étapes de traitement
              </p>
              <div className="relative">
                {validations.map((step, index) => {
                  const isCurrent = step.statutEtape === "EN_COURS";
                  const isLast    = index === validations.length - 1;
                  const etapeCfg  = getStatutEtapeConfig(step.statutEtape);
                  return (
                    <div key={step.idValidation} className="flex gap-4 mb-5">
                      {/* Timeline verticale */}
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 ${
                            isCurrent
                              ? "bg-blue-600 border-blue-600"
                              : step.statutEtape === "VALIDEE"
                              ? "bg-emerald-500 border-emerald-500"
                              : "bg-gray-200 border-gray-300"
                          }`}
                        >
                          {isCurrent ? (
                            <Clock className="w-4 h-4 text-white" />
                          ) : step.statutEtape === "VALIDEE" ? (
                            <CheckCircle className="w-4 h-4 text-white" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-gray-400" />
                          )}
                        </div>
                        {/* Trait de connexion entre les étapes */}
                        {!isLast && (
                          <div className="w-0.5 bg-[#dce4f0] flex-1 mt-2 min-h-[1.5rem]" />
                        )}
                      </div>
                      {/* Carte de l'étape */}
                      <div className={`flex-1 rounded-xl p-4 border ${etapeCfg.color}`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <MapPin className="w-3.5 h-3.5" />
                              <p className="font-bold text-sm">{step.nomEtape ?? "Étape sans nom"}</p>
                              {isCurrent && (
                                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">
                                  En cours
                                </span>
                              )}
                            </div>
                            {step.commentaire && (
                              <p className="text-xs opacity-75 italic mt-1">
                                « {step.commentaire} »
                              </p>
                            )}
                            {/* Données Carthago si synchronisées */}
                            {step.DESCRIPTION_ && (
                              <p className="text-xs opacity-70 mt-1">{step.DESCRIPTION_}</p>
                            )}
                          </div>
                          {/* Badge délai — rouge si > 7 jours */}
                          {step.delaiJours !== null && (
                            <span
                              className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${
                                step.delaiJours > 7
                                  ? "bg-red-100 text-red-700"
                                  : "bg-emerald-100 text-emerald-700"
                              }`}
                            >
                              {step.delaiJours}j
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs opacity-70">
                          <span>
                            Début : <strong>{formatDate(step.dateDebut)}</strong>
                          </span>
                          {step.dateFin && (
                            <>
                              <ArrowRight className="w-3 h-3" />
                              <span>
                                Fin : <strong>{formatDate(step.dateFin)}</strong>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : historique.length > 0 ? (
            // Fallback : afficher l'historique brut des logs si pas d'étapes
            <>
              <p className="text-xs font-semibold text-[#5f7291] uppercase tracking-wider mb-4">
                Historique des actions
              </p>
              <div className="space-y-3">
                {historique.map((log) => (
                  <div
                    key={log.idLog}
                    className="bg-[#f8fafc] border border-black/6 rounded-xl p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs bg-[#eef1f7] text-[#1a3560] px-2 py-0.5 rounded font-semibold">
                        {log.action}
                      </span>
                      <span className="text-xs text-[#5f7291]">
                        {formatDateTime(log.dateAction)}
                      </span>
                    </div>
                    {(log.ancienStatut || log.nouveauStatut) && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-[#5f7291]">
                        {log.ancienStatut && (
                          <span className="bg-gray-100 px-1.5 py-0.5 rounded">
                            {log.ancienStatut}
                          </span>
                        )}
                        {log.ancienStatut && log.nouveauStatut && (
                          <ArrowRight className="w-3 h-3" />
                        )}
                        {log.nouveauStatut && (
                          <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                            {log.nouveauStatut}
                          </span>
                        )}
                      </div>
                    )}
                    {log.commentaire && (
                      <p className="text-xs text-[#5f7291] italic mt-1.5">
                        « {log.commentaire} »
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-10 text-[#5f7291] text-sm">
              <p>Aucune étape de traitement enregistrée pour cette facture.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── EBModal ─────────────────────────────────────────────────────────────────
// Modal de saisie de la référence EB.
// Le backend génère automatiquement le ticket EB lors de cette saisie —
// pas besoin d'appeler apiGenererTicketEB séparément après.

function EBModal({
  facture,
  courrier,
  onClose,
  onSaved,
}: {
  facture: FactureResponse;
  courrier?: CourrierResponse;
  onClose: () => void;
  onSaved: () => void; // recharge la liste après sauvegarde
}) {
  const [ref, setRef]       = useState("");
  const [error, setError]   = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!ref.trim()) {
      setError("Veuillez saisir une référence EB.");
      return;
    }
    setSaving(true);
    try {
      await apiSaisirReferenceEB(facture.idFacture, ref.trim());
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Erreur lors de la saisie.");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        style={{ fontFamily: "'Figtree', sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-black/6">
          <div>
            <h2 className="text-[#0f1e36] font-bold" style={{ fontSize: "1.1rem" }}>
              Saisie référence EB
            </h2>
            <p className="font-mono text-xs text-[#5f7291] mt-0.5">{facture.codeUnique}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#eef1f7] rounded-xl transition-colors"
          >
            <X className="w-4 h-4 text-[#5f7291]" />
          </button>
        </div>
        <div className="px-6 py-5">
          {/* Récapitulatif du courrier associé */}
          <div className="bg-[#f8fafc] rounded-xl p-4 border border-black/5 mb-5">
            <p className="text-xs text-[#5f7291] mb-0.5">Expéditeur</p>
            <p className="text-sm font-semibold text-[#0f1e36]">
              {courrier?.expediteur ?? "—"}
            </p>
            {courrier?.objet_courrier && (
              <p className="text-xs text-[#5f7291] mt-1">{courrier.objet_courrier}</p>
            )}
          </div>
          {/* Champ référence EB */}
          <div className="mb-5">
            <label className="block text-sm font-semibold text-[#0f1e36] mb-2 flex items-center gap-1.5">
              <Hash className="w-4 h-4" /> Référence Engagement Budgétaire
            </label>
            <input
              type="text"
              placeholder="Ex: EB-2024-0123"
              value={ref}
              onChange={(e) => {
                setRef(e.target.value);
                setError("");
              }}
              className="w-full bg-[#f2f5fb] border border-black/8 rounded-xl px-4 py-3 text-[#0f1e36] text-sm focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30 focus:border-[#1e63d0] font-mono"
              autoFocus
            />
            {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-black/10 text-[#5f7291] text-sm font-semibold hover:bg-[#eef1f7] transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              style={{ background: "linear-gradient(180deg, #4A1E08 0%, #6B2D0E 100%)"  }}
            >
              {saving ? "Enregistrement…" : "Valider la référence"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TicketModal ──────────────────────────────────────────────────────────────
// Modal d'aperçu et de téléchargement du ticket EB.
// Le PDF est maintenant généré côté serveur (ReportLab) et récupéré
// via apiTelechargerTicketPDF — plus de génération HTML côté client.

function TicketModal({
  facture,
  courrier,
  onClose,
}: {
  facture: FactureResponse;
  courrier?: CourrierResponse;
  onClose: () => void;
}) {
  // État du bouton de téléchargement : idle | loading | error
  const [dlState, setDlState] = useState<"idle" | "loading" | "error">("idle");
  const [dlError, setDlError] = useState("");

  // Appelle l'endpoint GET /api/ticketEB/facture/{id}/pdf
  // Le navigateur reçoit le PDF et l'ouvre dans un nouvel onglet.
  const handleTelecharger = async () => {
    setDlState("loading");
    setDlError("");
    try {
      await apiTelechargerTicketPDF(facture.idFacture);
      setDlState("idle");
    } catch (err: any) {
      setDlError(err.message ?? "Erreur lors du téléchargement.");
      setDlState("error");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        style={{ fontFamily: "'Figtree', sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-black/6">
          <div>
            <h2 className="text-[#0f1e36] font-bold" style={{ fontSize: "1.1rem" }}>
              Ticket EB
            </h2>
            
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#eef1f7] rounded-xl transition-colors"
          >
            <X className="w-4 h-4 text-[#5f7291]" />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* Récapitulatif compact de la facture */}
          <div className="bg-[#f8fafc] rounded-xl border border-black/6 p-4 mb-5 space-y-2">

            {/* Référence EB — élément central du ticket */}
            <div className="bg-[#6B2D0E] rounded-lg px-4 py-3 text-center mb-3">
              <p className="text-white/60 text-xs uppercase tracking-wider mb-1">Référence EB</p>
              <p className="text-white font-bold font-mono tracking-widest text-lg">
                {facture.referenceEB ?? "—"}
              </p>
            </div>

            {/* Grille de métadonnées 2 colonnes */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {[
                { label: "Code facture",  value: facture.codeUnique },
                { label: "Réception",     value: formatDate(facture.dateReception) },
                { label: "Expéditeur",    value: courrier?.expediteur },
                { label: "N° Courrier",   value: courrier?.numero_courrier },
                { label: "Échéance",      value: formatDate(facture.dateEcheance) },
                { label: "Statut",        value: getStatutConfig(facture.statut).label },
              ].map((field) => (
                <div key={field.label}>
                  <p className="text-[#5f7291] uppercase tracking-wider" style={{ fontSize: "9px" }}>
                    {field.label}
                  </p>
                  <p className="text-[#0f1e36] font-semibold mt-0.5 truncate">
                    {field.value ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Message d'erreur si le téléchargement échoue */}
          {dlState === "error" && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>{dlError}</span>
            </div>
          )}

          {/* Bouton principal — appelle l'endpoint PDF côté serveur */}
          <button
            onClick={handleTelecharger}
            disabled={dlState === "loading"}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity"
            style={{ background: "linear-gradient(135deg, #6B2D0E, #E8820C)" }}
          >
            {dlState === "loading" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Génération du PDF…
              </>
            ) : (
              <>
                <Printer className="w-4 h-4" />
                Ouvrir le PDF
              </>
            )}
          </button>

          <p className="text-center text-xs text-[#5f7291] mt-3">
            Le PDF s'ouvre dans un nouvel onglet · Utilisez Ctrl+P pour imprimer
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── FacturesPage ─────────────────────────────────────────────────────────────
// Composant principal de la page Factures.
//
// Modals disponibles selon le rôle :
//   TraceModal        → œil        → SUPERVISEUR, ADMINISTRATEUR
//   EBModal           → crayon     → INSTRUCTEUR, ADMINISTRATEUR (si pas encore de réf EB)
//   TicketModal       → imprimante → INSTRUCTEUR, ADMINISTRATEUR (si réf EB présente)
//   GestionFactureModal → "Gérer"  → INSTRUCTEUR, VALIDATEUR, SUPERVISEUR, ADMINISTRATEUR

export function FacturesPage({ currentUser }: FacturesPageProps) {
  const [factures, setFactures]         = useState<FactureResponse[]>([]);
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [error, setError]               = useState("");
  const [search, setSearch]             = useState("");
  const [filterStatut, setFilterStatut] = useState("");

  // ── État de pagination ──────────────────────────────────────────────────────
  // currentPage est indexé à 0 (page 0 = première page affichée).
  const [currentPage, setCurrentPage] = useState(0);

  // États pour les modals — un seul peut être ouvert à la fois
  const [traceFacture, setTraceFacture]     = useState<FactureResponse | null>(null);
  const [ebFacture, setEbFacture]           = useState<FactureResponse | null>(null);
  const [ticketFacture, setTicketFacture]   = useState<FactureResponse | null>(null);
  const [gestionFacture, setGestionFacture] = useState<FactureResponse | null>(null);

  // ── Chargement des factures ─────────────────────────────────────────────────
  // On charge toutes les factures en une fois (limit: 500).
  // Le découpage en pages se fait côté client, ce qui permet au filtrage
  // et à la recherche de travailler sur l'ensemble des données.
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const f = await apiGetFactures({ limit: 500 });
      setFactures(f);
    } catch (err: any) {
      setError(err.message ?? "Impossible de charger les factures.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── WebSocket — mises à jour en temps réel ──────────────────────────────────
  useFacturesWebSocket({
    onFactureUpdate: (updatedFacture) => {
      setFactures((prev) =>
        prev.map((f) =>
          f.idFacture === updatedFacture.idFacture
            ? {
                ...f,
                statut:      updatedFacture.statut,
                referenceEB: updatedFacture.referenceEB,
                updated_at:  updatedFacture.updated_at,
              }
            : f
        )
      );
    },
    onFactureCreated: () => {
      // Rechargement complet nécessaire pour récupérer les courriers associés
      load();
    },
    onError: (errMsg) => {
      console.error("Erreur WebSocket :", errMsg);
    },
  });

  useEffect(() => {
    load();
  }, [load]);


  // ── Filtrage côté client ────────────────────────────────────────────────────
  // useMemo évite de recalculer le tableau à chaque render si rien n'a changé.
  const filtered = useMemo(() => {
    return factures.filter((inv) => {
      const co   = inv.courriers && inv.courriers.length > 0 ? inv.courriers[0] : null;
      const text = `${inv.codeUnique} ${inv.referenceEB ?? ""} ${co?.expediteur ?? ""} ${co?.objet_courrier ?? ""}`.toLowerCase();
      return (
        (!search       || text.includes(search.toLowerCase())) &&
        (!filterStatut || inv.statut === filterStatut)
      );
    });
  }, [factures, search, filterStatut]);

  // ── Logique de pagination ───────────────────────────────────────────────────
  // Quand le filtre ou la recherche changent, on revient toujours à la page 1
  // pour éviter de se retrouver sur une page vide.
  useEffect(() => {
    setCurrentPage(0);
  }, [search, filterStatut]);

  // Nombre total de pages calculé d'après les résultats filtrés
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // On s'assure que currentPage ne dépasse jamais le nombre de pages réel
  // (peut arriver si on supprime des éléments ou qu'on filtre fortement)
  const safePage = Math.min(currentPage, totalPages - 1);

  // Tranche de factures visible sur la page courante
  const paginated = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const role = currentUser.role;

  // Variables de droits — contrôlent l'affichage des colonnes et boutons
  const canSaisirEB     = role === "INSTRUCTEUR" || role === "ADMINISTRATEUR";
  const canVoirParcours = role === "SUPERVISEUR"  || role === "ADMINISTRATEUR" || role === "AGENT_COURRIER";
  // Tous sauf AGENT_COURRIER peuvent accéder au modal de gestion
  const canGerer        = role !== "AGENT_COURRIER";

  const statutOptions = [
    { value: "",               label: "Tous les statuts" },
    { value: "RECEPTIONNE",    label: "Réceptionné" },
    { value: "EN_INSTRUCTION", label: "En instruction" },
    { value: "EB_SAISI",       label: "EB saisi" },
    { value: "VALIDE",         label: "Validé" },
    { value: "BLOQUE",         label: "Bloqué" },
    { value: "PAYE",           label: "Payé" },
  ];

  return (
    <div className="p-8" style={{ fontFamily: "'Figtree', sans-serif" }}>

      {/* ── Titre et sous-titre contextuel selon le rôle ─────────────────── */}
      <div className="mb-6">
        <h1 className="text-[#0f1e36] mb-1" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          Factures
        </h1>
        <p className="text-[#5f7291] text-sm">
          {role === "AGENT_COURRIER"  && "Consultation des factures — accès lecture seule"}
          {role === "INSTRUCTEUR"     && "Gestion des factures — saisie des références EB"}
          {role === "SUPERVISEUR"     && "Supervision — consultation des parcours complets"}
          {role === "ADMINISTRATEUR"  && "Administration complète des factures"}
        </p>
      </div>

      {/* ── Barre d'outils ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Champ de recherche */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5f7291]" />
          <input
            type="text"
            placeholder="Rechercher par code, expéditeur, réf. EB…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-black/8 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30"
            style={{ fontFamily: "'Figtree', sans-serif" }}
          />
        </div>

        {/* Filtre par statut */}
        <select
          value={filterStatut}
          onChange={(e) => setFilterStatut(e.target.value)}
          className="bg-white border border-black/8 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none appearance-none"
          style={{ fontFamily: "'Figtree', sans-serif" }}
        >
          {statutOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        
        {/* Bouton rechargement simple */}
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-black/8 rounded-xl text-sm text-[#5f7291] hover:bg-[#eef1f7] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Compteur de résultats filtrés — affiche le total, pas juste la page */}
        {!loading && (
          <div className="bg-[#6B2D0E] text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-1.5">
            <span>{filtered.length}</span>
            <span className="text-white/60">résultat{filtered.length > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* ── Tableau des factures ──────────────────────────────────────────── */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-black/6 p-20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#1e63d0] animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-black/6 p-16 text-center">
          <XCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-[#0f1e36] font-semibold mb-1">Erreur de chargement</p>
          <p className="text-[#5f7291] text-sm mb-4">{error}</p>
          <button onClick={load} className="text-sm text-[#1e63d0] font-medium hover:underline">
            Réessayer
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/6 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-black/5">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">
                    Code unique
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">
                    Expéditeur
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">
                    Date Réception
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">
                    Objet
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">
                    Service actuel
                  </th>
                  {/* Colonne Réf. EB — uniquement pour INSTRUCTEUR et ADMINISTRATEUR */}
                  {canSaisirEB && (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">
                      Réf. EB
                    </th>
                  )}
                  {/* Colonne Gestion — masquée pour AGENT_COURRIER */}
                  {canGerer && (
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">
                      Gestion
                    </th>
                  )}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/4">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-[#5f7291] text-sm">
                      Aucune facture ne correspond à ces critères.
                    </td>
                  </tr>
                ) : (
                  // On itère sur `paginated` (tranche de la page courante)
                  // et non plus sur `filtered` (tous les résultats d'un coup)
                  paginated.map((inv) => {
                    // Premier courrier associé = référence d'affichage
                    const co  = inv.courriers && inv.courriers.length > 0 ? inv.courriers[0] : null;
                    const cfg = getStatutConfig(inv.statut);

                    // Droits par ligne selon l'état de la facture
                    const peutSaisirEB      = canSaisirEB && !inv.referenceEB;
                    const peutImprimerTicket = canSaisirEB && !!inv.referenceEB;

                    return (
                      <tr key={inv.idFacture} className="hover:bg-[#f8fafc] transition-colors">

                        {/* Code unique */}
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-xs font-semibold text-[#1a3560]">
                            {inv.codeUnique}
                          </span>
                        </td>

                        {/* Expéditeur */}
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-medium text-[#0f1e36]">
                            {co?.expediteur ?? <span className="text-[#5f7291]">—</span>}
                          </p>
                        </td>

                        {/* Date de réception */}
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-[#5f7291]">
                            {formatDate(inv.dateReception)}
                          </span>
                        </td>

                        {/* Objet du courrier (tronqué) */}
                        <td className="px-4 py-3.5">
                          {co?.objet_courrier && (
                            <p className="text-xs text-[#5f7291] max-w-[180px] truncate">
                              {co.objet_courrier}
                            </p>
                          )}
                        </td>

                        {/* Badge statut */}
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}
                          >
                            {cfg.label}
                          </span>
                        </td>

                        {/* Service actuel (position du courrier dans Mailsoft) */}
                        <td className="px-4 py-3.5">
                          <span className="text-xs text-[#5f7291]">{co?.position ?? "—"}</span>
                        </td>

                        {/* Référence EB — colonne conditionnelle */}
                        {canSaisirEB && (
                          <td className="px-4 py-3.5">
                            {inv.referenceEB ? (
                              <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                                {inv.referenceEB}
                              </span>
                            ) : (
                              <span className="text-xs text-[#5f7291]">—</span>
                            )}
                          </td>
                        )}

                        {/* Bouton Gérer — ouvre GestionFactureModal */}
                        {canGerer && (
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => setGestionFacture(inv)}
                              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#eef1f7] text-[#1a3560] hover:bg-[#1e63d0] hover:text-white transition-colors"
                              title="Gérer cette facture (statut, étapes, historique)"
                            >
                              <Settings className="w-3.5 h-3.5" />
                              Gérer
                            </button>
                          </td>
                        )}

                        {/* Colonne Actions — icônes contextuelles */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {/* Œil : voir le parcours Mailsoft + étapes */}
                            {canVoirParcours && (
                              <button
                                onClick={() => setTraceFacture(inv)}
                                className="p-1.5 rounded-lg hover:bg-purple-50 hover:text-purple-700 text-[#5f7291] transition-colors"
                                title="Voir le parcours"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            {/* Crayon : saisir la référence EB (si absente) */}
                            {peutSaisirEB && (
                              <button
                                onClick={() => setEbFacture(inv)}
                                className="p-1.5 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 text-[#5f7291] transition-colors"
                                title="Saisir référence EB"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}
                            {/* Imprimante : ticket EB (si référence EB présente) */}
                            {peutImprimerTicket && (
                              <button
                                onClick={() => setTicketFacture(inv)}
                                className="p-1.5 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 text-[#5f7291] transition-colors"
                                title="Imprimer le ticket EB"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                            )}
                            
                            
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Barre de pagination ───────────────────────────────────────────── */}
      {/* Affichée uniquement quand il y a des données et plus d'une page     */}
      {!loading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">

          {/* Texte informatif : "Factures 1–15 sur 87" */}
          <p className="text-xs text-[#5f7291]">
            Factures{" "}
            <span className="font-semibold text-[#0f1e36]">
              {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)}
            </span>{" "}
            sur{" "}
            <span className="font-semibold text-[#0f1e36]">{filtered.length}</span>
          </p>

          {/* Contrôles de navigation */}
          <div className="flex items-center gap-1.5">

            {/* Aller à la première page */}
            <button
              onClick={() => setCurrentPage(0)}
              disabled={safePage === 0}
              className="p-2 rounded-xl bg-white border border-black/8 text-[#5f7291] hover:bg-[#eef1f7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Première page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>

            {/* Page précédente */}
            <button
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="p-2 rounded-xl bg-white border border-black/8 text-[#5f7291] hover:bg-[#eef1f7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Page précédente"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Numéros de pages — on affiche au maximum 5 boutons centrés
                autour de la page courante pour ne pas encombrer l'interface */}
            {Array.from({ length: totalPages }, (_, i) => i)
              .filter((i) => {
                // Toujours afficher : première page, dernière page,
                // page courante, et les 2 voisines immédiates
                return (
                  i === 0 ||
                  i === totalPages - 1 ||
                  Math.abs(i - safePage) <= 1
                );
              })
              .reduce<(number | "…")[]>((acc, i, idx, arr) => {
                // Insérer "…" quand il y a un saut entre deux numéros
                if (idx > 0 && i - (arr[idx - 1] as number) > 1) {
                  acc.push("…");
                }
                acc.push(i);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "…" ? (
                  // Séparateur ellipsis non cliquable
                  <span key={`ellipsis-${idx}`} className="px-1 text-xs text-[#5f7291]">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item as number)}
                    className={`min-w-[34px] h-[34px] rounded-xl text-xs font-semibold transition-colors ${
                      item === safePage
                        ? "bg-[#1a3560] text-white"           // page active
                        : "bg-white border border-black/8 text-[#5f7291] hover:bg-[#eef1f7]"
                    }`}
                  >
                    {(item as number) + 1}
                  </button>
                )
              )}

            {/* Page suivante */}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage === totalPages - 1}
              className="p-2 rounded-xl bg-white border border-black/8 text-[#5f7291] hover:bg-[#eef1f7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Page suivante"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Aller à la dernière page */}
            <button
              onClick={() => setCurrentPage(totalPages - 1)}
              disabled={safePage === totalPages - 1}
              className="p-2 rounded-xl bg-white border border-black/8 text-[#5f7291] hover:bg-[#eef1f7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Dernière page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}

      {/* TraceModal : parcours Mailsoft + étapes (lecture seule) */}
      {traceFacture && (
        <TraceModal
          facture={traceFacture}
          courrier={
            traceFacture.courriers && traceFacture.courriers.length > 0
              ? traceFacture.courriers[0]
              : undefined
          }
          onClose={() => setTraceFacture(null)}
        />
      )}

      {/* EBModal : saisie de la référence Engagement Budgétaire */}
      {ebFacture && (
        <EBModal
          facture={ebFacture}
          courrier={
            ebFacture.courriers && ebFacture.courriers.length > 0
              ? ebFacture.courriers[0]
              : undefined
          }
          onClose={() => setEbFacture(null)}
          onSaved={load}
        />
      )}

      {/* TicketModal : aperçu et impression du ticket EB */}
      {ticketFacture && (
        <TicketModal
          facture={ticketFacture}
          courrier={
            ticketFacture.courriers && ticketFacture.courriers.length > 0
              ? ticketFacture.courriers[0]
              : undefined
          }
          onClose={() => setTicketFacture(null)}
        />
      )}

      {/* GestionFactureModal : statut, étapes de traitement, historique complet */}
      {/* Visible pour INSTRUCTEUR, VALIDATEUR, SUPERVISEUR, ADMINISTRATEUR     */}
      {gestionFacture && (
        <GestionFactureModal
          facture={gestionFacture}
          currentUser={currentUser}
          onClose={() => setGestionFacture(null)}
          onSaved={load} // recharge la liste des factures après toute modification
        />
      )}
    </div>
  );
}