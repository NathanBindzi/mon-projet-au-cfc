import { useEffect, useState } from "react";
import { FileText, Clock, CheckCircle, XCircle, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { apiGetFactures, apiGetDashboardStats } from "./api";
import { FactureResponse, DashboardStats, ProfilSchema } from "./types";
import { getStatutConfig, formatDate, getRoleLabel } from "./utils";

interface AccueilPageProps {
  currentUser: ProfilSchema;
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 text-[#1e63d0] animate-spin" />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-4">
        <XCircle className="w-6 h-6 text-red-500" />
      </div>
      <p className="text-[#0f1e36] font-semibold mb-1">Erreur de chargement</p>
      <p className="text-[#5f7291] text-sm mb-4">{message}</p>
      <button onClick={onRetry} className="text-sm text-[#1e63d0] font-medium hover:underline">
        Réessayer
      </button>
    </div>
  );
}

export function AccueilPage({ currentUser }: AccueilPageProps) {
  const [factures, setFactures] = useState<FactureResponse[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [f, s] = await Promise.all([
        apiGetFactures({ limit: 10 }),
        apiGetDashboardStats().catch(() => null),
      ]);
      setFactures(f);
      setStats(s);
    } catch (err: any) {
      setError(err.message ?? "Impossible de charger les données.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const total = stats?.total ?? factures.length;
  const receptionne = stats?.receptionne ?? factures.filter((f) => f.statut === "RECEPTIONNE").length;
  const enInstruction = stats?.en_instruction ?? factures.filter((f) => f.statut === "EN_INSTRUCTION").length;
  const bloque = stats?.bloque ?? factures.filter((f) => f.statut === "BLOQUE").length;

  const kpis = [
    { label: "Total factures", value: String(total), icon: FileText, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100", sub: "Toutes factures confondues" },
    { label: "Réceptionnées", value: String(receptionne), icon: Clock, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100", sub: "En attente de traitement" },
    { label: "En instruction", value: String(enInstruction), icon: CheckCircle, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-100", sub: "Traitement en cours" },
    { label: "Bloquées", value: String(bloque), icon: XCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-100", sub: "Nécessitent une action" },
  ];

  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="p-8" style={{ fontFamily: "'Figtree', sans-serif" }}>
      <div className="mb-8">
        <p className="text-[#5f7291] text-sm mb-1 capitalize">{today}</p>
        <h1 className="text-[#0f1e36] mb-1" style={{ fontSize: "1.75rem", fontWeight: 700 }}>
          Bonjour, {currentUser.prenom} 👋
        </h1>
        <p className="text-[#5f7291] text-sm">
          {getRoleLabel(currentUser.role)} · {currentUser.email}
        </p>
      </div>

      {bloque > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-800 font-semibold text-sm">{bloque} facture{bloque > 1 ? "s" : ""} bloquée{bloque > 1 ? "s" : ""}</p>
            <p className="text-red-700 text-xs mt-0.5">Des factures nécessitent une action immédiate.</p>
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={load} /> : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            {kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className={`bg-white rounded-2xl p-5 border ${kpi.border} shadow-sm`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`${kpi.bg} ${kpi.border} border rounded-xl p-2.5`}>
                      <Icon className={`w-5 h-5 ${kpi.color}`} />
                    </div>
                  </div>
                  <p className="text-[#0f1e36] mb-1" style={{ fontSize: "2rem", fontWeight: 700, lineHeight: 1 }}>
                    {kpi.value}
                  </p>
                  <p className="text-[#0f1e36] font-semibold text-sm">{kpi.label}</p>
                  <p className="text-[#5f7291] text-xs mt-1">{kpi.sub}</p>
                </div>
              );
            })}
          </div>

          {/* Recent factures table */}
          <div className="bg-white rounded-2xl border border-black/6 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
              <div>
                <h2 className="text-[#0f1e36] font-semibold" style={{ fontSize: "1rem" }}>Dernières factures</h2>
                <p className="text-[#5f7291] text-xs mt-0.5">10 factures les plus récentes</p>
              </div>
              <span className="text-xs text-[#5f7291] bg-[#eef1f7] rounded-full px-3 py-1">{total} au total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-black/5">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Code unique</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Date réception</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Échéance</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Réf. EB</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/4">
                  {factures.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-[#5f7291] text-sm">Aucune facture trouvée.</td></tr>
                  ) : factures.map((inv) => {
                    const cfg = getStatutConfig(inv.statut);
                    return (
                      <tr key={inv.idFacture} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="px-6 py-3.5">
                          <span className="font-mono text-xs font-semibold text-[#1a3560]">{inv.codeUnique}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-[#5f7291]">{formatDate(inv.dateReception)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="text-sm text-[#5f7291]">{formatDate(inv.dateEcheance)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          {inv.referenceEB ? (
                            <span className="font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                              {inv.referenceEB}
                            </span>
                          ) : <span className="text-xs text-[#5f7291]">—</span>}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-[#5f7291]">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Données chargées depuis l'API CFC Invoice Tracker</span>
          </div>
        </>
      )}
    </div>
  );
}
