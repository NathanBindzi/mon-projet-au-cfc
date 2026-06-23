/**
 * NotificationPanel.tsx
 *
 * Panneau de notifications qui s'ouvre depuis l'icône cloche dans la Sidebar.
 * Affiche les alertes non lues groupées par type.
 * Permet de marquer une alerte comme lue ou toutes d'un coup.
 *
 * Props :
 *   isOpen    — contrôle l'affichage (true = visible)
 *   onClose   — callback pour fermer le panneau
 *   role      — rôle de l'utilisateur (pour afficher le bouton "Tout marquer lu")
 */

import { useEffect, useState, useCallback } from "react";
import {
  X, Bell, Clock, AlertTriangle, FileWarning,
  CheckCheck, Loader2, ChevronRight
} from "lucide-react";
import { apiGetAlertes, apiMarquerAlerteLue } from "./api";
import { AlerteResponse } from "./types";
import { formatDateTime } from "./utils";

// Appel à l'endpoint "marquer toutes comme lues" (SUPERVISEUR/ADMIN)
async function apiMarquerToutesLues(): Promise<void> {
  const token = localStorage.getItem("suifact_token");
  await fetch("http://localhost:8000/api/alertes/toutes/lues", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ── Configuration visuelle par type d'alerte ──────────────────────────────────
// Chaque type a une couleur, une icône et un libellé différent
const ALERTE_CONFIG: Record<string, {
  label:   string;
  icon:    React.ComponentType<{ className?: string }>;
  color:   string;   // classes Tailwind pour le badge
  bg:      string;   // fond de la carte
  border:  string;   // bordure de la carte
}> = {
  DEPASSEMENT_DELAI: {
    label:  "Délai dépassé",
    icon:   Clock,
    color:  "text-red-700 bg-red-100",
    bg:     "bg-red-50",
    border: "border-red-200",
  },
  BLOCAGE_DOSSIER: {
    label:  "Dossier bloqué",
    icon:   AlertTriangle,
    color:  "text-orange-700 bg-orange-100",
    bg:     "bg-orange-50",
    border: "border-orange-200",
  },
  PIECE_MANQUANTE: {
    label:  "Pièce manquante",
    icon:   FileWarning,
    color:  "text-amber-700 bg-amber-100",
    bg:     "bg-amber-50",
    border: "border-amber-200",
  },
};

interface NotificationPanelProps {
  isOpen:   boolean;
  onClose:  () => void;
  role:     string;
  // Callback pour mettre à jour le badge dans la Sidebar après action
  onCountChange: (count: number) => void;
}

export function NotificationPanel({
  isOpen,
  onClose,
  role,
  onCountChange,
}: NotificationPanelProps) {
  const [alertes,  setAlertes]  = useState<AlerteResponse[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [markingId, setMarkingId] = useState<number | null>(null);

  const peutToutMarquer = role === "SUPERVISEUR" || role === "ADMINISTRATEUR";

  // ── Chargement des alertes non lues ─────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      // On charge toutes les alertes non lues
      const data = await apiGetAlertes(false);
      setAlertes(data);
      onCountChange(data.length); // met à jour le badge
    } catch {
      setAlertes([]);
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  // Recharge chaque fois que le panneau s'ouvre
  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  // ── Marquer une alerte comme lue ─────────────────────────────────────────────
  const handleMarquerLue = async (id: number) => {
    setMarkingId(id);
    try {
      await apiMarquerAlerteLue(id);
      // Retire l'alerte de la liste localement sans recharger
      const nouvelles = alertes.filter((a) => a.idAlerte !== id);
      setAlertes(nouvelles);
      onCountChange(nouvelles.length);
    } catch {
      // Silencieux — l'alerte reste visible
    } finally {
      setMarkingId(null);
    }
  };

  // ── Marquer toutes comme lues ─────────────────────────────────────────────────
  const handleToutesLues = async () => {
    try {
      await apiMarquerToutesLues();
      setAlertes([]);
      onCountChange(0);
    } catch {
      // Silencieux
    }
  };

  // Ne rien rendre si le panneau est fermé (économise le DOM)
  if (!isOpen) return null;

  return (
    <>
      {/*
        Overlay transparent derrière le panneau.
        Un clic dessus ferme le panneau (UX standard).
      */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/*
        Panneau lui-même — positionné en absolute par rapport à la Sidebar.
        On le place à droite de la sidebar (left: 256px = largeur de la sidebar).
      */}
      <div
        className="fixed top-0 left-64 h-full w-80 bg-white shadow-2xl z-50 flex flex-col border-r border-black/8"
        style={{ fontFamily: "'Figtree', sans-serif" }}
        onClick={(e) => e.stopPropagation()} // empêche la fermeture au clic intérieur
      >

        {/* ── En-tête ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/8"
          style={{ background: "linear-gradient(180deg, #4A1E08 0%, #6B2D0E 100%)" }}>
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-white" />
            <h2 className="text-white font-bold text-sm">Notifications</h2>
            {/* Badge compteur dans l'en-tête */}
            {alertes.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {alertes.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-white/70" />
          </button>
        </div>

        {/* ── Barre d'actions (si alertes présentes) ───────────────────────── */}
        {alertes.length > 0 && peutToutMarquer && (
          <div className="px-5 py-2.5 border-b border-black/6 bg-[#f8fafc] flex items-center justify-between">
            <span className="text-xs text-[#5f7291]">
              {alertes.length} non lue{alertes.length > 1 ? "s" : ""}
            </span>
            <button
              onClick={handleToutesLues}
              className="flex items-center gap-1.5 text-xs text-[#1e63d0] font-semibold hover:underline"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tout marquer lu
            </button>
          </div>
        )}

        {/* ── Liste des alertes ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            // État de chargement
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-[#1e63d0] animate-spin" />
            </div>
          ) : alertes.length === 0 ? (
            // Aucune alerte — état vide
            <div className="flex flex-col items-center justify-center py-16 px-5 text-center">
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center mb-3 border border-emerald-100">
                <Bell className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-[#0f1e36] font-semibold text-sm">Tout est à jour</p>
              <p className="text-[#5f7291] text-xs mt-1">Aucune alerte en attente.</p>
            </div>
          ) : (
            // Liste des alertes non lues
            <div className="p-3 space-y-2">
              {alertes.map((alerte) => {
                const cfg = ALERTE_CONFIG[alerte.typeAlerte] ?? ALERTE_CONFIG["BLOCAGE_DOSSIER"];
                const Icon = cfg.icon;
                const enCours = markingId === alerte.idAlerte;

                return (
                  <div
                    key={alerte.idAlerte}
                    className={`rounded-xl border p-3.5 ${cfg.bg} ${cfg.border}`}
                  >
                    {/* Type + date */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      <span className="text-xs text-[#5f7291] flex-shrink-0">
                        {formatDateTime(alerte.dateEmission)}
                      </span>
                    </div>

                    {/* Message de l'alerte */}
                    <p className="text-xs text-[#0f1e36] leading-relaxed mb-3">
                      {alerte.message}
                    </p>

                    {/* Bouton marquer comme lue */}
                    <button
                      onClick={() => handleMarquerLue(alerte.idAlerte)}
                      disabled={enCours}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#1e63d0] hover:underline disabled:opacity-50"
                    >
                      {enCours ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                      Marquer comme traitée
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}