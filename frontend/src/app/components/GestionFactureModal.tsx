import { useState, useEffect } from "react";
import {
  X, CheckCircle, XCircle, AlertTriangle, Clock,
  Plus, Loader2, ArrowRight, Lock, Unlock, ChevronDown
} from "lucide-react";

// ── Imports API ───────────────────────────────────────────────────────────────
// Ces fonctions sont à ajouter dans api.ts (voir section api.ts ci-dessous)
import {
  apiChangerStatut,
  apiBloquerFacture,
  apiDebloquerFacture,
  apiGetValidationsFacture,
  apiGetHistoriqueFacture,
  apiMettreAJourValidation,   // À ajouter dans api.ts
  apiCreerValidation,          // À ajouter dans api.ts
} from "./api";

import { FactureResponse, ValidationResponse, LogResponse, ProfilSchema, StatutFactureEnum } from "./types";
import { getStatutConfig, getStatutEtapeConfig, formatDate, formatDateTime } from "./utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types internes
// ─────────────────────────────────────────────────────────────────────────────

// Onglets disponibles dans le modal
type Onglet = "statut" | "etapes" | "historique";

interface GestionFactureModalProps {
  facture:     FactureResponse;
  currentUser: ProfilSchema;
  onClose:     () => void;
  onSaved:     () => void;  // appelé après toute modification pour recharger la liste
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export function GestionFactureModal({
  facture,
  currentUser,
  onClose,
  onSaved,
}: GestionFactureModalProps) {

  // Onglet actif
  const [onglet, setOnglet] = useState<Onglet>("statut");

  // Données chargées depuis l'API
  const [validations, setValidations] = useState<ValidationResponse[]>([]);
  const [historique,  setHistorique]  = useState<LogResponse[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Statut courant de la facture (mis à jour localement après modification)
  const [statutCourant, setStatutCourant] = useState<StatutFactureEnum>(facture.statut);

  const role = currentUser.role;

  // ── Droits selon le rôle ────────────────────────────────────────────────────
  // Ces variables contrôlent quels boutons/formulaires sont affichés
  const peutChangerStatut  = ["INSTRUCTEUR", "VALIDATEUR", "SUPERVISEUR", "ADMINISTRATEUR"].includes(role);
  const peutBloquer        = ["VALIDATEUR", "SUPERVISEUR", "ADMINISTRATEUR"].includes(role);
  const peutValiderEtape   = ["VALIDATEUR", "SUPERVISEUR", "ADMINISTRATEUR"].includes(role);
  const peutCreerEtape     = ["INSTRUCTEUR", "VALIDATEUR", "ADMINISTRATEUR"].includes(role);

  // ── Chargement des données au montage ──────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiGetValidationsFacture(facture.idFacture).catch(() => []),
      apiGetHistoriqueFacture(facture.idFacture).catch(() => []),
    ]).then(([v, h]) => {
      setValidations(v as ValidationResponse[]);
      setHistorique(h as LogResponse[]);
      setLoadingData(false);
    });
  }, [facture.idFacture]);

  // ── Callback partagé après toute action réussie ────────────────────────────
  // Recharge les étapes et l'historique, puis notifie le parent (liste)
  const afterSave = async () => {
    const [v, h] = await Promise.all([
      apiGetValidationsFacture(facture.idFacture).catch(() => []),
      apiGetHistoriqueFacture(facture.idFacture).catch(() => []),
    ]);
    setValidations(v as ValidationResponse[]);
    setHistorique(h as LogResponse[]);
    onSaved(); // recharge le tableau des factures dans FacturesPage
  };

  const cfg = getStatutConfig(statutCourant);

  return (
    // Overlay sombre — clic en dehors ferme le modal
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{ fontFamily: "'Figtree', sans-serif" }}
        onClick={(e) => e.stopPropagation()} // empêche la fermeture au clic intérieur
      >

        {/* ── En-tête ──────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-black/6">
          <div>
            <h2 className="text-[#0f1e36] font-bold text-lg">Gestion de la facture</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="font-mono text-xs text-[#5f7291]">{facture.codeUnique}</span>
              {/* Badge statut courant */}
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
                {cfg.label}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#eef1f7] rounded-xl transition-colors"
          >
            <X className="w-4 h-4 text-[#5f7291]" />
          </button>
        </div>

        {/* ── Onglets ───────────────────────────────────────────────────────── */}
        <div className="flex border-b border-black/6 px-6">
          {(["statut", "etapes", "historique"] as Onglet[]).map((tab) => {
            const labels: Record<Onglet, string> = {
              statut:     "Statut & Blocage",
              etapes:     `Étapes (${validations.length})`,
              historique: "Historique",
            };
            return (
              <button
                key={tab}
                onClick={() => setOnglet(tab)}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  onglet === tab
                    ? "border-[#1e63d0] text-[#1e63d0]"
                    : "border-transparent text-[#5f7291] hover:text-[#0f1e36]"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* ── Contenu scrollable ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {loadingData ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-5 h-5 text-[#1e63d0] animate-spin" />
            </div>
          ) : (
            <>
              {/* ── Onglet 1 : Statut & Blocage ─────────────────────────── */}
              {onglet === "statut" && (
                <OngletStatut
                  facture={facture}
                  statutCourant={statutCourant}
                  setStatutCourant={setStatutCourant}
                  peutChangerStatut={peutChangerStatut}
                  peutBloquer={peutBloquer}
                  afterSave={afterSave}
                />
              )}

              {/* ── Onglet 2 : Étapes de traitement ─────────────────────── */}
              {onglet === "etapes" && (
                <OngletEtapes
                  facture={facture}
                  validations={validations}
                  peutValiderEtape={peutValiderEtape}
                  peutCreerEtape={peutCreerEtape}
                  afterSave={afterSave}
                />
              )}

              {/* ── Onglet 3 : Historique ────────────────────────────────── */}
              {onglet === "historique" && (
                <OngletHistorique historique={historique} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 1 — Statut & Blocage
// ─────────────────────────────────────────────────────────────────────────────

function OngletStatut({
  facture,
  statutCourant,
  setStatutCourant,
  peutChangerStatut,
  peutBloquer,
  afterSave,
}: {
  facture:          FactureResponse;
  statutCourant:    StatutFactureEnum;
  setStatutCourant: (s: StatutFactureEnum) => void;
  peutChangerStatut: boolean;
  peutBloquer:       boolean;
  afterSave:         () => Promise<void>;
}) {
  // Formulaire changement de statut
  const [nouveauStatut,  setNouveauStatut]  = useState<StatutFactureEnum>(statutCourant);
  const [commentStatut,  setCommentStatut]  = useState("");
  const [savingStatut,   setSavingStatut]   = useState(false);
  const [erreurStatut,   setErreurStatut]   = useState("");

  // Formulaire blocage
  const [commentBlocage, setCommentBlocage] = useState("");
  const [savingBlocage,  setSavingBlocage]  = useState(false);
  const [erreurBlocage,  setErreurBlocage]  = useState("");

  // Liste des statuts disponibles (selon le flux logique)
  // On ne peut pas "revenir en arrière" librement — sauf ADMINISTRATEUR
  // Pour simplifier ici, on propose tous les statuts
  const tousStatuts: { value: StatutFactureEnum; label: string }[] = [
    { value: "RECEPTIONNE",    label: "Réceptionné" },
    { value: "EN_INSTRUCTION", label: "En instruction" },
    { value: "EB_SAISI",       label: "EB saisi" },
    { value: "VALIDE",         label: "Validé" },
    { value: "PAYE",           label: "Payé" },
  ];

  const handleChangerStatut = async () => {
    if (!commentStatut.trim()) {
      setErreurStatut("Un commentaire est requis pour tracer le changement.");
      return;
    }
    setSavingStatut(true);
    setErreurStatut("");
    try {
      await apiChangerStatut(facture.idFacture, nouveauStatut, commentStatut);
      setStatutCourant(nouveauStatut); // mise à jour locale immédiate
      setCommentStatut("");
      await afterSave();
    } catch (err: any) {
      setErreurStatut(err.message ?? "Erreur lors du changement de statut.");
    } finally {
      setSavingStatut(false);
    }
  };

  const handleBloquer = async () => {
    if (!commentBlocage.trim()) {
      setErreurBlocage("Précisez le motif du blocage.");
      return;
    }
    setSavingBlocage(true);
    setErreurBlocage("");
    try {
      await apiBloquerFacture(facture.idFacture, commentBlocage);
      setStatutCourant("BLOQUE");
      setCommentBlocage("");
      await afterSave();
    } catch (err: any) {
      setErreurBlocage(err.message ?? "Erreur lors du blocage.");
    } finally {
      setSavingBlocage(false);
    }
  };

  const handleDebloquer = async () => {
    if (!commentBlocage.trim()) {
      setErreurBlocage("Précisez le motif du déblocage.");
      return;
    }
    setSavingBlocage(true);
    setErreurBlocage("");
    try {
      await apiDebloquerFacture(facture.idFacture, commentBlocage);
      setStatutCourant("EN_INSTRUCTION"); // le backend remet EN_INSTRUCTION
      setCommentBlocage("");
      await afterSave();
    } catch (err: any) {
      setErreurBlocage(err.message ?? "Erreur lors du déblocage.");
    } finally {
      setSavingBlocage(false);
    }
  };

  const estBloquee = statutCourant === "BLOQUE";

   if (statutCourant === "PAYE") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        {/* Icône de validation verte */}
        <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4 border border-gray-200">
          <CheckCircle className="w-7 h-7 text-gray-400" />
        </div>
        <p className="text-[#0f1e36] font-bold text-sm mb-1">
          Facture clôturée
        </p>
        <p className="text-[#5f7291] text-xs max-w-[260px] leading-relaxed">
          Cette facture a été payée. Son statut est définitif et ne peut plus être modifié.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Section : changer le statut ──────────────────────────────────── */}
      {peutChangerStatut && !estBloquee && (
        <div className="bg-[#f8fafc] rounded-xl border border-black/6 p-5">
          <h3 className="text-[#0f1e36] font-bold text-sm mb-4 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-[#1e63d0]" />
            Changer le statut
          </h3>

          {/* Sélecteur de statut */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-[#5f7291] uppercase tracking-wider mb-2">
              Nouveau statut
            </label>
            <div className="relative">
              <select
                value={nouveauStatut}
                onChange={(e) => setNouveauStatut(e.target.value as StatutFactureEnum)}
                className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30 appearance-none"
                style={{ fontFamily: "'Figtree', sans-serif" }}
              >
                {tousStatuts.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {/* Icône flèche */}
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5f7291] pointer-events-none" />
            </div>
          </div>

          {/* Commentaire obligatoire (trace dans les logs) */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#5f7291] uppercase tracking-wider mb-2">
              Commentaire <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              placeholder="Ex : Dossier complet, passage en instruction…"
              value={commentStatut}
              onChange={(e) => { setCommentStatut(e.target.value); setErreurStatut(""); }}
              className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30 resize-none"
              style={{ fontFamily: "'Figtree', sans-serif" }}
            />
            {erreurStatut && (
              <p className="text-xs text-red-600 mt-1">{erreurStatut}</p>
            )}
          </div>

          <button
            onClick={handleChangerStatut}
            disabled={savingStatut || nouveauStatut === statutCourant}
            className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            style={{ background: "linear-gradient(135deg, #1a3560, #1e63d0)" }}
          >
            {savingStatut ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…
              </span>
            ) : "Valider le changement de statut"}
          </button>
        </div>
      )}

      {/* ── Section : blocage / déblocage ────────────────────────────────── */}
      {peutBloquer && (
        <div className={`rounded-xl border p-5 ${
          estBloquee
            ? "bg-red-50 border-red-200"
            : "bg-[#f8fafc] border-black/6"
        }`}>
          <h3 className={`font-bold text-sm mb-4 flex items-center gap-2 ${
            estBloquee ? "text-red-800" : "text-[#0f1e36]"
          }`}>
            {estBloquee
              ? <><Lock className="w-4 h-4 text-red-600" /> Facture bloquée — débloquer</>
              : <><AlertTriangle className="w-4 h-4 text-amber-600" /> Bloquer cette facture</>
            }
          </h3>

          {/* Textarea pour le motif */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-[#5f7291] uppercase tracking-wider mb-2">
              {estBloquee ? "Motif du déblocage" : "Motif du blocage"} <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={2}
              placeholder={estBloquee
                ? "Ex : Pièces reçues, problème résolu…"
                : "Ex : Pièces manquantes, litige fournisseur…"
              }
              value={commentBlocage}
              onChange={(e) => { setCommentBlocage(e.target.value); setErreurBlocage(""); }}
              className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-red-300/40 resize-none"
              style={{ fontFamily: "'Figtree', sans-serif" }}
            />
            {erreurBlocage && (
              <p className="text-xs text-red-600 mt-1">{erreurBlocage}</p>
            )}
          </div>

          {/* Bouton bloquer OU débloquer selon le statut */}
          <button
            onClick={estBloquee ? handleDebloquer : handleBloquer}
            disabled={savingBlocage}
            className={`w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors ${
              estBloquee
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {savingBlocage ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Traitement…</>
            ) : estBloquee ? (
              <><Unlock className="w-4 h-4" /> Débloquer la facture</>
            ) : (
              <><Lock className="w-4 h-4" /> Bloquer la facture</>
            )}
          </button>
        </div>
      )}

      {/* Message si aucune action n'est disponible */}
      {!peutChangerStatut && !peutBloquer && (
        <div className="text-center py-10 text-[#5f7291] text-sm">
          Vous n'avez pas les droits pour modifier le statut de cette facture.
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 2 — Étapes de traitement
// ─────────────────────────────────────────────────────────────────────────────

function OngletEtapes({
  facture,
  validations,
  peutValiderEtape,
  peutCreerEtape,
  afterSave,
}: {
  facture:          FactureResponse;
  validations:      ValidationResponse[];
  peutValiderEtape: boolean;
  peutCreerEtape:   boolean;
  afterSave:        () => Promise<void>;
}) {
  // ID de l'étape en cours de modification (pour ouvrir son formulaire inline)
  const [etapeEnCours, setEtapeEnCours] = useState<number | null>(null);

  // Formulaire de création d'une nouvelle étape
  const [afficherFormCreation, setAfficherFormCreation] = useState(false);
  const factureVerrouillee = facture.statut === "PAYE" || facture.statut === "BLOQUE";


  return (
    <div className="space-y-4">
       {/* ── Message d'avertissement si verrouillée ─────────────────────────── */}
      {factureVerrouillee && (
        <div className={`rounded-xl border p-4 text-xs ${
          facture.statut === "PAYE"
            ? "bg-gray-50 border-gray-200 text-gray-600"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {facture.statut === "PAYE"
            ? "Cette facture est payée et définitivement clôturée : aucune étape ne peut être ajoutée ou modifiée."
            : "Cette facture est bloquée : aucune étape ne peut être ajoutée ou modifiée tant qu'elle n'est pas débloquée."
          }
        </div>
      )}

      {/* ── Bouton : créer une étape — masqué si verrouillée ───────────────── */}
      {peutCreerEtape && !factureVerrouillee && (
        <div className="flex justify-end">
          <button
            onClick={() => setAfficherFormCreation(!afficherFormCreation)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #1a3560, #1e63d0)" }}
          >
            <Plus className="w-4 h-4" />
            Nouvelle étape
          </button>
        </div>
      )}

      {/* ── Formulaire de création (collapsible) ──────────────────────── */}
      {afficherFormCreation && (
        <FormCreationEtape
          idFacture={facture.idFacture}
          onCancel={() => setAfficherFormCreation(false)}
          onSaved={async () => {
            setAfficherFormCreation(false);
            await afterSave();
          }}
        />
      )}

      {/* ── Liste des étapes existantes ────────────────────────────────── */}
      {validations.length === 0 ? (
        <div className="text-center py-10 bg-[#f8fafc] rounded-xl border border-black/6 text-[#5f7291] text-sm">
          Aucune étape enregistrée pour cette facture.
          {peutCreerEtape && (
            <p className="mt-1 text-xs">Cliquez sur "Nouvelle étape" pour en créer une.</p>
          )}
        </div>
      ) : (
        validations.map((v) => (
          <CarteEtape
            key={v.idValidation}
            validation={v}
            peutValider={peutValiderEtape}
            ouvert={etapeEnCours === v.idValidation}
            onToggle={() => setEtapeEnCours(
              etapeEnCours === v.idValidation ? null : v.idValidation
            )}
            afterSave={afterSave}
          />
        ))
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Carte d'une étape individuelle avec formulaire de validation inline
// ─────────────────────────────────────────────────────────────────────────────

function CarteEtape({
  validation,
  peutValider,
  ouvert,
  onToggle,
  afterSave,
}: {
  validation: ValidationResponse;
  peutValider: boolean;
  ouvert:      boolean;
  onToggle:    () => void;
  afterSave:   () => Promise<void>;
}) {
  // Données du formulaire de validation
  const [nouveauStatut, setNouveauStatut] = useState(validation.statutEtape ?? "EN_COURS");
  const [commentaire,   setCommentaire]   = useState("");
  const [dateFin,       setDateFin]       = useState(
    // Pré-remplir avec la date de fin existante ou aujourd'hui
    validation.dateFin
      ? new Date(validation.dateFin).toISOString().slice(0, 16) // format "YYYY-MM-DDTHH:MM"
      : new Date().toISOString().slice(0, 16)
  );
  const [saving,  setSaving]  = useState(false);
  const [erreur,  setErreur]  = useState("");

  const etapeCfg = getStatutEtapeConfig(validation.statutEtape);
  const estTerminee = ["VALIDEE", "REJETEE"].includes(validation.statutEtape ?? "");

  const handleValider = async () => {
    setSaving(true);
    setErreur("");
    try {
      await apiMettreAJourValidation(validation.idValidation, {
        statutEtape: nouveauStatut,
        commentaire: commentaire || undefined,
        // On envoie la dateFin seulement si l'étape est clôturée
        // Le backend calculera delaiJours automatiquement
        dateFin: ["VALIDEE", "REJETEE", "BLOQUEE"].includes(nouveauStatut) ? dateFin : undefined,
      });
      onToggle(); // referme le formulaire
      await afterSave();
    } catch (err: any) {
      setErreur(err.message ?? "Erreur lors de la mise à jour.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${etapeCfg.color}`}>

      {/* ── En-tête de la carte (toujours visible) ─────────────────────── */}
      <div
        className="flex items-center justify-between p-4 cursor-pointer"
        onClick={peutValider ? onToggle : undefined}
      >
        <div className="flex items-start gap-3">
          {/* Icône statut */}
          <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
            validation.statutEtape === "VALIDEE"  ? "bg-emerald-500" :
            validation.statutEtape === "REJETEE"  ? "bg-red-500"     :
            validation.statutEtape === "BLOQUEE"  ? "bg-orange-500"  :
            "bg-blue-500"
          }`}>
            {validation.statutEtape === "VALIDEE"  ? <CheckCircle className="w-4 h-4 text-white" /> :
             validation.statutEtape === "REJETEE"  ? <XCircle className="w-4 h-4 text-white" />     :
             validation.statutEtape === "BLOQUEE"  ? <AlertTriangle className="w-4 h-4 text-white" />:
             <Clock className="w-4 h-4 text-white" />}
          </div>

          <div>
            <p className="font-bold text-sm">{validation.nomEtape ?? "Étape sans nom"}</p>

            {/* Données Carthago si disponibles */}
            {validation.DESCRIPTION_ && (
              <p className="text-xs opacity-70 mt-0.5">{validation.DESCRIPTION_}</p>
            )}

            {/* Dates et délai */}
            <div className="flex items-center gap-3 mt-1 text-xs opacity-70">
              <span>Début : {formatDate(validation.dateDebut)}</span>
              {validation.dateFin && (
                <>
                  <ArrowRight className="w-3 h-3" />
                  <span>Fin : {formatDate(validation.dateFin)}</span>
                </>
              )}
              {/* Délai calculé — affiché en rouge si > 7 jours */}
              {validation.delaiJours !== null && validation.delaiJours > 0 && (
                <span className={`font-semibold px-1.5 py-0.5 rounded-full text-[10px] ${
                  validation.delaiJours > 7 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                }`}>
                  {validation.delaiJours}j
                </span>
              )}
            </div>

            {/* Commentaire existant */}
            {validation.commentaire && (
              <p className="text-xs italic opacity-60 mt-1">« {validation.commentaire} »</p>
            )}
          </div>
        </div>

        {/* Bouton ouvrir/fermer (seulement si le validateur peut agir) */}
        {peutValider && !estTerminee && (
          <span className="text-xs font-semibold opacity-70 ml-2 flex-shrink-0">
            {ouvert ? "Annuler" : "Traiter →"}
          </span>
        )}
      </div>

      {/* ── Formulaire de validation (affiché quand ouvert) ─────────────── */}
      {ouvert && peutValider && !estTerminee && (
        <div className="px-4 pb-4 pt-0 border-t border-black/10 mt-1 space-y-3">

          {/* Nouveau statut */}
          <div>
            <label className="block text-xs font-semibold opacity-70 uppercase tracking-wider mb-1.5">
              Décision
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "VALIDEE",  label: "Valider",  cls: "border-emerald-400 text-emerald-700 bg-emerald-50" },
                { value: "REJETEE",  label: "Rejeter",  cls: "border-red-400 text-red-700 bg-red-50" },
                { value: "BLOQUEE",  label: "Bloquer",  cls: "border-orange-400 text-orange-700 bg-orange-50" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setNouveauStatut(opt.value)}
                  className={`py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                    nouveauStatut === opt.value
                      ? opt.cls + " scale-105 shadow-sm"
                      : "border-black/10 text-[#5f7291] bg-white hover:bg-[#f8fafc]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date de fin — obligatoire pour clôturer */}
          <div>
            <label className="block text-xs font-semibold opacity-70 uppercase tracking-wider mb-1.5">
              Date de fin <span className="text-red-500">*</span>
              <span className="ml-1 font-normal opacity-60">(utilisée pour calculer le délai)</span>
            </label>
            <input
              type="datetime-local"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30"
              style={{ fontFamily: "'Figtree', sans-serif" }}
            />
          </div>

          {/* Commentaire */}
          <div>
            <label className="block text-xs font-semibold opacity-70 uppercase tracking-wider mb-1.5">
              Commentaire
            </label>
            <textarea
              rows={2}
              placeholder="Observations, motif de rejet…"
              value={commentaire}
              onChange={(e) => { setCommentaire(e.target.value); setErreur(""); }}
              className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30 resize-none"
              style={{ fontFamily: "'Figtree', sans-serif" }}
            />
          </div>

          {erreur && <p className="text-xs text-red-600">{erreur}</p>}

          <button
            onClick={handleValider}
            disabled={saving}
            className="w-full py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #1a3560, #1e63d0)" }}
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement…</>
              : "Confirmer la décision"
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulaire de création d'une nouvelle étape
// ─────────────────────────────────────────────────────────────────────────────

function FormCreationEtape({
  idFacture,
  onCancel,
  onSaved,
}: {
  idFacture: number;
  onCancel:  () => void;
  onSaved:   () => Promise<void>;
}) {
  const [nomEtape,   setNomEtape]   = useState("");
  const [dateDebut,  setDateDebut]  = useState(new Date().toISOString().slice(0, 16));
  const [commentaire, setCommentaire] = useState("");
  const [saving,     setSaving]     = useState(false);
  const [erreur,     setErreur]     = useState("");

  const handleCreer = async () => {
    if (!nomEtape.trim()) {
      setErreur("Le nom de l'étape est obligatoire.");
      return;
    }
    setSaving(true);
    setErreur("");
    try {
      await apiCreerValidation(idFacture, {
        nomEtape:   nomEtape.trim(),
        dateDebut:  dateDebut,
        commentaire: commentaire || undefined,
      });
      await onSaved();
    } catch (err: any) {
      setErreur(err.message ?? "Erreur lors de la création.");
      setSaving(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-bold text-[#0f1e36] flex items-center gap-2">
        <Plus className="w-4 h-4 text-[#1e63d0]" />
        Créer une nouvelle étape
      </p>

      {/* Nom de l'étape */}
      <div>
        <label className="block text-xs font-semibold text-[#5f7291] uppercase tracking-wider mb-1.5">
          Nom de l'étape <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          placeholder="Ex : Vérification pièces justificatives, Approbation DG…"
          value={nomEtape}
          onChange={(e) => { setNomEtape(e.target.value); setErreur(""); }}
          className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30"
          style={{ fontFamily: "'Figtree', sans-serif" }}
          autoFocus
        />
      </div>

      {/* Date de début */}
      <div>
        <label className="block text-xs font-semibold text-[#5f7291] uppercase tracking-wider mb-1.5">
          Date de début
        </label>
        <input
          type="datetime-local"
          value={dateDebut}
          onChange={(e) => setDateDebut(e.target.value)}
          className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30"
          style={{ fontFamily: "'Figtree', sans-serif" }}
        />
      </div>

      {/* Commentaire */}
      <div>
        <label className="block text-xs font-semibold text-[#5f7291] uppercase tracking-wider mb-1.5">
          Commentaire
        </label>
        <textarea
          rows={2}
          placeholder="Instructions, contexte de cette étape…"
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          className="w-full bg-white border border-black/10 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30 resize-none"
          style={{ fontFamily: "'Figtree', sans-serif" }}
        />
      </div>

      {erreur && <p className="text-xs text-red-600">{erreur}</p>}

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-black/10 text-[#5f7291] text-sm font-semibold hover:bg-white transition-colors"
        >
          Annuler
        </button>
        <button
          onClick={handleCreer}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, #1a3560, #1e63d0)" }}
        >
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Création…</>
            : "Créer l'étape"
          }
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onglet 3 — Historique (lecture seule)
// ─────────────────────────────────────────────────────────────────────────────

function OngletHistorique({ historique }: { historique: LogResponse[] }) {
  if (historique.length === 0) {
    return (
      <div className="text-center py-10 text-[#5f7291] text-sm">
        Aucune action enregistrée pour cette facture.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {historique.map((log) => (
        <div
          key={log.idLog}
          className="bg-[#f8fafc] border border-black/6 rounded-xl p-3"
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            {/* Badge action */}
            <span className="font-mono text-xs bg-[#eef1f7] text-[#1a3560] px-2 py-0.5 rounded font-semibold">
              {log.action}
            </span>
            {/* Horodatage */}
            <span className="text-xs text-[#5f7291] flex-shrink-0">
              {formatDateTime(log.dateAction)}
            </span>
          </div>

          {/* Transition de statut */}
          {(log.ancienStatut || log.nouveauStatut) && (
            <div className="flex items-center gap-2 mt-1 text-xs text-[#5f7291]">
              {log.ancienStatut && (
                <span className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">{log.ancienStatut}</span>
              )}
              {log.ancienStatut && log.nouveauStatut && <ArrowRight className="w-3 h-3" />}
              {log.nouveauStatut && (
                <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-medium">{log.nouveauStatut}</span>
              )}
            </div>
          )}

          {/* Commentaire */}
          {log.commentaire && (
            <p className="text-xs text-[#5f7291] italic mt-1">« {log.commentaire} »</p>
          )}

          {/* Utilisateur */}
          {log.nomUtilisateur && (
            <p className="text-xs text-[#5f7291] mt-1 font-medium">{log.nomUtilisateur}</p>
          )}
        </div>
      ))}
    </div>
  );
}
