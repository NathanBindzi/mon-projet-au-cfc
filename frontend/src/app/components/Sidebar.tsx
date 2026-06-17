import { useState, useEffect, useCallback } from "react";
import {
  FileText, LayoutDashboard, Users, BarChart3,
  ScrollText, LogOut, ChevronRight, Bell
} from "lucide-react";
import { Page, RoleEnum, ProfilSchema } from "./types";
import { getRoleLabel, getRoleColor, getInitials } from "./utils";
import { apiCountAlertesNonLues } from "./api";
import { NotificationPanel } from "./NotificationPanel";

interface NavItem {
  id: Page;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: RoleEnum[];
}

const NAV_ITEMS: NavItem[] = [
  { id: "accueil",        label: "Accueil",          icon: LayoutDashboard, roles: ["AGENT_COURRIER", "INSTRUCTEUR", "SUPERVISEUR", "ADMINISTRATEUR"] },
  { id: "tableau_de_bord",label: "Tableau de bord",  icon: BarChart3,       roles: ["INSTRUCTEUR", "SUPERVISEUR", "ADMINISTRATEUR"] },
  { id: "factures",       label: "Factures",         icon: FileText,        roles: ["AGENT_COURRIER", "INSTRUCTEUR", "SUPERVISEUR", "ADMINISTRATEUR"] },
  { id: "habilitations",  label: "Habilitations",    icon: Users,           roles: ["SUPERVISEUR", "ADMINISTRATEUR"] },
  { id: "logs",           label: "Journaux système", icon: ScrollText,      roles: ["SUPERVISEUR", "ADMINISTRATEUR"] },
];

interface SidebarProps {
  currentPage: Page;
  currentUser: ProfilSchema;
  onNavigate:  (page: Page) => void;
  onLogout:    () => void;
}

export function Sidebar({ currentPage, currentUser, onNavigate, onLogout }: SidebarProps) {
  const allowedItems = NAV_ITEMS.filter((item) => item.roles.includes(currentUser.role));
  const initials = getInitials(currentUser.nom, currentUser.prenom);

  // ── État du panneau de notifications ────────────────────────────────────────
  const [panelOuvert,   setPanelOuvert]   = useState(false);
  const [nbNonLues,     setNbNonLues]     = useState(0);

  // ── Chargement du compteur d'alertes ────────────────────────────────────────
  // On recharge le compteur toutes les 30 secondes pour rester à jour
  // même sans WebSocket dédié aux alertes.
  const chargerCompteur = useCallback(async () => {
    try {
      const { non_lues } = await apiCountAlertesNonLues();
      setNbNonLues(non_lues);
    } catch {
      // Silencieux si l'API est indisponible
    }
  }, []);

  useEffect(() => {
    // Chargement initial
    chargerCompteur();

    // Polling toutes les 30 secondes
    const interval = setInterval(chargerCompteur, 30_000);

    // Nettoyage à la destruction du composant
    return () => clearInterval(interval);
  }, [chargerCompteur]);

  return (
    <>
      <aside
        className="w-64 flex-shrink-0 flex flex-col h-screen sticky top-0"
        style={{ background: "linear-gradient(180deg, #0f1e36 0%, #1a3560 100%)", fontFamily: "'Figtree', sans-serif" }}
      >
        {/* ── Logo ──────────────────────────────────────────────────────────── */}
        <div className="px-6 py-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-semibold leading-none"
                style={{ fontFamily: "'DM Serif Display', serif", fontSize: "1.05rem" }}>
                SuiFact CFC
              </p>
              <p className="text-white/40 text-xs mt-0.5">Suivi des factures</p>
            </div>
          </div>
        </div>

        {/* ── Navigation ────────────────────────────────────────────────────── */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="text-white/30 text-xs uppercase tracking-widest px-3 mb-3">Navigation</p>
          {allowedItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 group ${
                  isActive ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/8 hover:text-white/90"
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? "text-blue-300" : "text-white/50 group-hover:text-white/70"}`} />
                <span className="flex-1 text-left font-medium">{item.label}</span>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/40" />}
              </button>
            );
          })}
        </nav>

        {/* ── Zone basse : notifications + profil + déconnexion ─────────────── */}
        <div className="p-3 border-t border-white/10">

          {/*
            Bouton Notifications avec badge rouge.
            Le badge s'affiche uniquement si nbNonLues > 0.
            position: relative sur le bouton + absolute sur le badge
            permet de positionner le badge en haut à droite de l'icône.
          */}
          <button
            onClick={() => setPanelOuvert(!panelOuvert)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all mb-1 relative ${
              panelOuvert
                ? "bg-white/15 text-white"
                : "text-white/60 hover:bg-white/8 hover:text-white/90"
            }`}
          >
            {/* Icône cloche */}
            <div className="relative">
              <Bell className="w-4 h-4 flex-shrink-0" />
              {/* Badge rouge — visible uniquement si des alertes non lues existent */}
              {nbNonLues > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-black flex items-center justify-center rounded-full px-0.5 leading-none">
                  {nbNonLues > 99 ? "99+" : nbNonLues}
                </span>
              )}
            </div>
            <span className="flex-1 text-left font-medium">Notifications</span>
            {/* Animation pulse si alertes en attente */}
            {nbNonLues > 0 && (
              <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
            )}
          </button>

          {/* Profil utilisateur */}
          <div className="bg-white/8 rounded-xl p-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {currentUser.prenom} {currentUser.nom}
                </p>
                <p className="text-white/50 text-xs truncate">{currentUser.email}</p>
              </div>
            </div>
            <div className="mt-2.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoleColor(currentUser.role)}`}>
                {getRoleLabel(currentUser.role)}
              </span>
            </div>
          </div>

          {/* Bouton déconnexion */}
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/50 hover:text-white/80 hover:bg-white/8 transition-all text-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/*
        Le panneau de notifications est rendu EN DEHORS de la sidebar
        pour pouvoir se superposer au contenu principal.
        Il est contrôlé par l'état panelOuvert.
      */}
      <NotificationPanel
        isOpen={panelOuvert}
        onClose={() => setPanelOuvert(false)}
        role={currentUser.role}
        onCountChange={setNbNonLues}
      />
    </>
  );
}