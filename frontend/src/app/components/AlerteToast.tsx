/**
 * AlerteToast.tsx
 * ================
 * Composant autonome qui écoute le WebSocket et affiche une notification
 * toast en bas à droite de l'écran dès qu'une alerte DEPASSEMENT_DELAI
 * est reçue du serveur.
 *
 * À monter une seule fois dans App.tsx (ou le composant racine) pour
 * qu'il soit actif sur toutes les pages.
 *
 * Comportement :
 *   - Connexion automatique au WS à l'apparition du composant
 *   - Reconnexion automatique si la connexion est perdue (toutes les 5s)
 *   - Chaque toast reste affiché 8 secondes puis disparaît
 *   - On empile jusqu'à 3 toasts simultanément (les plus anciens disparaissent)
 *   - Fermeture manuelle avec le bouton ×
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

// ── URL du WebSocket ──────────────────────────────────────────────────────────
// On réutilise la même base que l'API REST mais avec le protocole ws://
const WS_URL = (import.meta as any).env?.VITE_WS_URL
  ?? "ws://localhost:8000/ws/factures";

// Durée d'affichage d'un toast en millisecondes
const TOAST_DURATION_MS = 8_000;

// Nombre maximum de toasts affichés en même temps
const MAX_TOASTS = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToastData {
  id:          number;    // identifiant unique pour la clé React
  codeFacture: string;
  message:     string;
}

// ── Composant ─────────────────────────────────────────────────────────────────

export function AlerteToast() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  // Compteur auto-incrémenté pour les clés React
  const nextId = useRef(0);

  // Référence au WebSocket pour pouvoir le fermer proprement
  const wsRef = useRef<WebSocket | null>(null);

  // ── Connexion WebSocket avec reconnexion automatique ─────────────────────
  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      // Ferme la connexion précédente si elle existe encore
      wsRef.current?.close();

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // On ne réagit qu'aux alertes de dépassement de délai
          if (msg.type !== "nouvelle_alerte") return;

          const data = msg.data;

          // Crée un nouveau toast et l'ajoute à la pile
          setToasts((prev) => {
            const nouveau: ToastData = {
              id:          nextId.current++,
              codeFacture: data.codeFacture ?? "—",
              message:     data.message     ?? "Échéance dépassée",
            };
            // On garde au maximum MAX_TOASTS toasts (supprime les plus anciens)
            return [...prev.slice(-(MAX_TOASTS - 1)), nouveau];
          });
        } catch {
          // Message non-JSON ou malformé — on l'ignore silencieusement
        }
      };

      ws.onclose = () => {
        // Tentative de reconnexion après 5 secondes
        reconnectTimer = setTimeout(connect, 5_000);
      };

      ws.onerror = () => {
        // En cas d'erreur, on ferme proprement et on laisse onclose gérer
        ws.close();
      };
    }

    connect();

    // Nettoyage au démontage du composant
    return () => {
      clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, []);

  // ── Suppression automatique après TOAST_DURATION_MS ─────────────────────
  useEffect(() => {
    if (toasts.length === 0) return;

    // On programme la suppression du toast le plus ancien
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [toasts]);

  // ── Fermeture manuelle ───────────────────────────────────────────────────
  const fermer = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // ── Rendu ────────────────────────────────────────────────────────────────
  if (toasts.length === 0) return null;

  return (
    // Conteneur positionné en bas à droite, au-dessus de tout le reste
    <div
      className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3"
      style={{ fontFamily: "'Figtree', sans-serif" }}
      aria-live="assertive"   // annonce les toasts aux lecteurs d'écran
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="
            flex items-start gap-3
            bg-white border border-red-200
            rounded-2xl shadow-xl
            px-4 py-3.5
            w-80 max-w-[90vw]
            animate-in slide-in-from-right-4 duration-300
          "
          role="alert"
        >
          {/* Icône d'avertissement */}
          <div className="w-8 h-8 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>

          {/* Contenu */}
          <div className="flex-1 min-w-0">
            {/* Titre avec le code de la facture */}
            <p className="text-sm font-bold text-[#0f1e36] leading-tight">
              Échéance dépassée
            </p>
            <p className="text-xs font-mono text-red-700 font-semibold mt-0.5">
              {toast.codeFacture}
            </p>
            {/* Message détaillé tronqué à 2 lignes */}
            <p className="text-xs text-[#5f7291] mt-1 line-clamp-2 leading-relaxed">
              {toast.message}
            </p>
          </div>

          {/* Bouton de fermeture */}
          <button
            onClick={() => fermer(toast.id)}
            className="p-1 hover:bg-[#eef1f7] rounded-lg transition-colors flex-shrink-0"
            aria-label="Fermer la notification"
          >
            <X className="w-3.5 h-3.5 text-[#5f7291]" />
          </button>
        </div>
      ))}
    </div>
  );
}