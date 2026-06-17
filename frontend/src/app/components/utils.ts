import { RoleEnum, StatutFactureEnum } from "./types";

export function getRoleLabel(role: RoleEnum | string): string {
  const labels: Record<string, string> = {
    AGENT_COURRIER: "Agent Courrier",
    INSTRUCTEUR: "Instructeur",
    SUPERVISEUR: "Superviseur",
    ADMINISTRATEUR: "Administrateur",
  };
  return labels[role] ?? role;
}

export function getRoleColor(role: RoleEnum | string): string {
  const colors: Record<string, string> = {
    AGENT_COURRIER: "bg-slate-100 text-slate-700",
    INSTRUCTEUR: "bg-indigo-100 text-indigo-700",
    SUPERVISEUR: "bg-purple-100 text-purple-700",
    ADMINISTRATEUR: "bg-rose-100 text-rose-700",
  };
  return colors[role] ?? "bg-gray-100 text-gray-700";
}

export function getStatutConfig(statut: StatutFactureEnum | string) {
  const configs: Record<string, { label: string; color: string }> = {
    RECEPTIONNE: { label: "Réceptionné", color: "bg-amber-100 text-amber-800 border-amber-200" },
    EN_INSTRUCTION: { label: "En instruction", color: "bg-blue-100 text-blue-800 border-blue-200" },
    EB_SAISI: { label: "EB saisi", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
    VALIDE: { label: "Validé", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    BLOQUE: { label: "Bloqué", color: "bg-red-100 text-red-800 border-red-200" },
    PAYE: { label: "Payé", color: "bg-gray-100 text-gray-600 border-gray-200" },
  };
  return configs[statut] ?? { label: statut, color: "bg-gray-100 text-gray-600 border-gray-200" };
}

export function getStatutEtapeConfig(statut: string | null) {
  const configs: Record<string, { label: string; color: string; dotColor: string }> = {
    EN_COURS: { label: "En cours", color: "bg-blue-50 border-blue-200 text-blue-800", dotColor: "bg-blue-500" },
    VALIDEE: { label: "Validée", color: "bg-emerald-50 border-emerald-200 text-emerald-800", dotColor: "bg-emerald-500" },
    REJETEE: { label: "Rejetée", color: "bg-red-50 border-red-200 text-red-800", dotColor: "bg-red-500" },
    BLOQUEE: { label: "Bloquée", color: "bg-orange-50 border-orange-200 text-orange-800", dotColor: "bg-orange-500" },
  };
  return configs[statut ?? ""] ?? { label: statut ?? "—", color: "bg-gray-50 border-gray-200 text-gray-600", dotColor: "bg-gray-400" };
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function getInitials(nom: string, prenom: string): string {
  return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
}

export function groupByMonth(items: { date: string | null }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  items.forEach(({ date }) => {
    if (!date) return;
    const d = new Date(date);
    const key = d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
    counts[key] = (counts[key] ?? 0) + 1;
  });
  return counts;
}
