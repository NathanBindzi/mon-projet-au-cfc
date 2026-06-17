import { useEffect, useState } from "react";
import {
  Timer, TrendingDown, ShieldAlert, GitBranch, ClipboardCheck,
  RefreshCw, Loader2, XCircle, AlertTriangle, CheckCircle2,
  BarChart2, Clock
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { apiGetDashboardStats } from "./api";
import { DashboardStats, ServiceStat } from "./types";

// ─── Gauge circulaire SVG ─────────────────────────────────────────────────────

function CircleGauge({
  value,
  max = 100,
  color,
  size = 88,
  strokeWidth = 8,
}: {
  value: number;
  max?: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(value / max, 1);
  const dash = circ * pct;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8edf5" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
    </svg>
  );
}

// ─── Composant KPI card principal ────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  gauge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  accent: string;        // Tailwind bg color class ex: "bg-blue-500"
  gauge?: { pct: number; color: string };
}) {
  return (
    <div
      className="relative bg-white rounded-2xl border border-black/6 shadow-sm p-5 overflow-hidden flex flex-col gap-3"
      style={{ fontFamily: "'Figtree', sans-serif" }}
    >
      {/* Barre d'accent gauche */}
      <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${accent}`} />

      <div className="flex items-start justify-between pl-3">
        <div className="flex-1">
          <p className="text-xs font-semibold text-[#5f7291] uppercase tracking-wider mb-1">{label}</p>
          <p className="text-[#0f1e36] font-black leading-none" style={{ fontSize: "2rem" }}>{value}</p>
          <p className="text-xs text-[#5f7291] mt-1.5">{sub}</p>
        </div>

        <div className="relative flex-shrink-0">
          {gauge ? (
            <div className="relative">
              <CircleGauge value={gauge.pct} color={gauge.color} />
              <div className="absolute inset-0 flex items-center justify-center">
                <Icon className={"w-4 h-4 ${ color: gauge.color }"} />
              </div>
            </div>
          ) : (
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accent} bg-opacity-10`}>
              <Icon className={`w-5 h-5${accent.replace("bg-", "") }` } />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Barre de progression horizontale ────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full bg-[#eef1f7] rounded-full h-2 overflow-hidden">
      <div
        className="h-2 rounded-full transition-all duration-700"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export function TableauDeBordPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const s = await apiGetDashboardStats();
      setStats(s);
    } catch (err: any) {
      setError(err.message ?? "Impossible de charger les statistiques.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Couleur du délai moyen (vert < 7j, orange < 14j, rouge sinon)
  const getDelaiColor = (jours: number) => {
    if (jours <= 7)  return { badge: "text-emerald-700 bg-emerald-50 border-emerald-200", bar: "#10b981" };
    if (jours <= 14) return { badge: "text-amber-700 bg-amber-50 border-amber-200",     bar: "#f59e0b" };
    return                 { badge: "text-red-700 bg-red-50 border-red-200",             bar: "#ef4444" };
  };

  if (loading) return (
    <div className="p-8 flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 text-[#1e63d0] animate-spin" />
    </div>
  );

  if (error) return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[400px]">
      <XCircle className="w-8 h-8 text-red-400 mb-3" />
      <p className="text-[#0f1e36] font-semibold mb-1">Erreur de chargement</p>
      <p className="text-[#5f7291] text-sm mb-4">{error}</p>
      <button onClick={load} className="text-sm text-[#1e63d0] font-medium hover:underline">Réessayer</button>
    </div>
  );

  const delaiJours    = stats?.delai_moyen_jours ?? 0;
  const tauxRetard    = stats?.taux_retard        ?? 0;
  const enRetard      = stats?.en_retard          ?? 0;
  const blocages      = stats?.nombre_blocages    ?? 0;
  const tauxTrace     = stats?.taux_tracabilite   ?? 0;
  const facTracees    = stats?.factures_tracees   ?? 0;
  const total         = stats?.total              ?? 0;
  const services      = stats?.duree_par_service  ?? [];

  const delaiCfg  = getDelaiColor(delaiJours);

  // Couleur du taux de retard : bas = vert, haut = rouge
  const retardColor = tauxRetard <= 10 ? "#10b981" : tauxRetard <= 25 ? "#f59e0b" : "#ef4444";
  // Couleur de la traçabilité : haut = vert
  const traceColor  = tauxTrace >= 80 ? "#10b981" : tauxTrace >= 50 ? "#f59e0b" : "#ef4444";

  // Données pour le bar chart des services (top 8)
  const serviceChartData = services.slice(0, 8).map((s) => ({
    name: s.service.length > 12 ? s.service.slice(0, 12) + "…" : s.service,
    fullName: s.service,
    jours: s.duree_moyenne_jours,
    factures: s.nombre_factures,
  }));

  // Palette de couleurs pour les barres de services
  const BAR_COLORS = ["#1e63d0","#6366f1","#8b5cf6","#a855f7","#ec4899","#f43f5e","#ef4444","#f59e0b"];

  return (
    <div className="p-8" style={{ fontFamily: "'Figtree', sans-serif" }}>

      {/* ── En-tête ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-[#0f1e36] mb-1" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            Tableau de bord
          </h1>
          <p className="text-[#5f7291] text-sm">
            Indicateurs de performance du traitement des factures
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-black/8 rounded-xl text-sm text-[#5f7291] hover:bg-[#eef1f7] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Actualiser
        </button>
      </div>

      {/* ── Ligne 1 : 5 KPIs principaux ───────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">

        {/* Délai moyen */}
        <div className="bg-white rounded-2xl border border-black/6 shadow-sm p-5 relative overflow-hidden">
          <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-blue-500" />
          <div className="pl-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100">
                <Timer className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Délai moyen</p>
            </div>
            <p className="text-[#0f1e36] font-black leading-none mb-1" style={{ fontSize: "2rem" }}>
              {delaiJours}<span className="text-base font-semibold text-[#5f7291] ml-1">j</span>
            </p>
            <p className="text-xs text-[#5f7291] mb-3">de traitement (réception → validation)</p>
            <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${delaiCfg.badge}`}>
              {delaiJours <= 7 ? "✓ Objectif atteint" : delaiJours <= 14 ? "⚠ Attention" : "✗ Dépassé"}
            </span>
          </div>
        </div>

        {/* Taux de retard */}
        <div className="bg-white rounded-2xl border border-black/6 shadow-sm p-5 relative overflow-hidden">
          <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full"
            style={{ background: retardColor }} />
          <div className="pl-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center border"
                style={{ background: `${retardColor}15`, borderColor: `${retardColor}40` }}>
                <TrendingDown className="w-4 h-4" style={{ color: retardColor }} />
              </div>
              <p className="text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Taux retard</p>
            </div>
            <div className="flex items-end gap-3 mb-1">
              <p className="text-[#0f1e36] font-black leading-none" style={{ fontSize: "2rem" }}>
                {tauxRetard}<span className="text-base font-semibold text-[#5f7291] ml-0.5">%</span>
              </p>
              <p className="text-xs text-[#5f7291] mb-1.5">{enRetard} facture{enRetard > 1 ? "s" : ""}</p>
            </div>
            <ProgressBar value={tauxRetard} max={100} color={retardColor} />
            <p className="text-xs text-[#5f7291] mt-2">échéance dépassée & non soldées</p>
          </div>
        </div>

        {/* Nombre de blocages */}
        <div className="bg-white rounded-2xl border border-black/6 shadow-sm p-5 relative overflow-hidden">
          <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-red-500" />
          <div className="pl-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center border border-red-100">
                <ShieldAlert className="w-4 h-4 text-red-600" />
              </div>
              <p className="text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Blocages</p>
            </div>
            <p className="text-[#0f1e36] font-black leading-none mb-1" style={{ fontSize: "2rem" }}>
              {blocages}
            </p>
            <p className="text-xs text-[#5f7291] mb-3">événements DOSSIER_BLOQUÉ enregistrés</p>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
              blocages === 0
                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                : blocages <= 3
                ? "text-amber-700 bg-amber-50 border-amber-200"
                : "text-red-700 bg-red-50 border-red-200"
            }`}>
              {blocages === 0 ? <><CheckCircle2 className="w-3 h-3" /> Aucun blocage</> : <><AlertTriangle className="w-3 h-3" /> Nécessite attention</>}
            </span>
          </div>
        </div>

        {/* Taux de traçabilité */}
        <div className="bg-white rounded-2xl border border-black/6 shadow-sm p-5 relative overflow-hidden">
          <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full"
            style={{ background: traceColor }} />
          <div className="pl-3">
            <div className="flex items-start justify-between mb-1">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center border"
                    style={{ background: `${traceColor}15`, borderColor: `${traceColor}40` }}>
                    <ClipboardCheck className="w-4 h-4" style={{ color: traceColor }} />
                  </div>
                  <p className="text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Traçabilité</p>
                </div>
                <p className="text-[#0f1e36] font-black leading-none mb-1" style={{ fontSize: "2rem" }}>
                  {tauxTrace}<span className="text-base font-semibold text-[#5f7291] ml-0.5">%</span>
                </p>
              </div>
              <div className="relative flex-shrink-0">
                <CircleGauge value={tauxTrace} color={traceColor} size={72} strokeWidth={7} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold" style={{ color: traceColor }}>{tauxTrace}%</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-[#5f7291]">
              {facTracees} / {total} facture{total > 1 ? "s" : ""} entièrement tracées
            </p>
          </div>
        </div>

        {/* Services actifs */}
        <div className="bg-white rounded-2xl border border-black/6 shadow-sm p-5 relative overflow-hidden">
          <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-purple-500" />
          <div className="pl-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-purple-50 rounded-xl flex items-center justify-center border border-purple-100">
                <GitBranch className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Services</p>
            </div>
            <p className="text-[#0f1e36] font-black leading-none mb-1" style={{ fontSize: "2rem" }}>
              {services.length}
            </p>
            <p className="text-xs text-[#5f7291] mb-3">services avec données de traitement</p>
            {services.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-[#5f7291]" />
                <span className="text-xs text-[#5f7291]">
                  Le + lent : <strong className="text-[#0f1e36]">{services[0]?.service?.slice(0, 10)}{(services[0]?.service?.length ?? 0) > 10 ? "…" : ""}</strong>
                  {" "}({services[0]?.duree_moyenne_jours}j)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Ligne 2 : graphique durée par service + récap statuts ─────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">

        {/* Bar chart — durée par service */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-black/6 shadow-sm p-6">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-[#0f1e36] font-bold" style={{ fontSize: "1rem" }}>
                Durée moyenne de traitement par service
              </h2>
              <p className="text-[#5f7291] text-xs mt-0.5">
                Calculé à partir de la position du courrier associé · en jours
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-[#f8fafc] border border-black/5 rounded-lg px-2.5 py-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-[#5f7291]" />
              <span className="text-xs text-[#5f7291] font-medium">{services.length} services</span>
            </div>
          </div>

          {serviceChartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-[#5f7291]">
              <BarChart2 className="w-8 h-8 opacity-30 mb-2" />
              <p className="text-sm">Données insuffisantes</p>
              <p className="text-xs mt-1 opacity-70">Les données apparaîtront au fur et à mesure du traitement des factures</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={serviceChartData} barCategoryGap="35%" margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f4f8" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#5f7291", fontSize: 11 }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#5f7291", fontSize: 11 }}
                  axisLine={false} tickLine={false}
                  unit="j"
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff", border: "1px solid #dce4f0",
                    borderRadius: "12px", fontSize: "12px"
                  }}
                  formatter={(value: number, _: string, props: any) => [
                    `${value} jour${value > 1 ? "s" : ""} — ${props.payload.factures} facture${props.payload.factures > 1 ? "s" : ""}`,
                    props.payload.fullName
                  ]}
                />
                <Bar dataKey="jours" name="Durée moy." radius={[6, 6, 0, 0]}>
                  {serviceChartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Répartition par statut */}
        <div className="bg-white rounded-2xl border border-black/6 shadow-sm p-6">
          <h2 className="text-[#0f1e36] font-bold mb-1" style={{ fontSize: "1rem" }}>
            Répartition par statut
          </h2>
          <p className="text-[#5f7291] text-xs mb-5">{total} facture{total > 1 ? "s" : ""} au total</p>

          {(!stats?.par_statut || stats.par_statut.length === 0) ? (
            <div className="flex items-center justify-center h-40 text-[#5f7291] text-sm">Aucune donnée</div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const CFG: Record<string, { label: string; color: string; bar: string }> = {
                  RECEPTIONNE:    { label: "Réceptionné",    color: "text-amber-700",   bar: "#f59e0b" },
                  EN_INSTRUCTION: { label: "En instruction", color: "text-blue-700",    bar: "#3b82f6" },
                  EB_SAISI:       { label: "EB saisi",       color: "text-indigo-700",  bar: "#6366f1" },
                  VALIDE:         { label: "Validé",         color: "text-emerald-700", bar: "#10b981" },
                  BLOQUE:         { label: "Bloqué",         color: "text-red-700",     bar: "#ef4444" },
                  PAYE:           { label: "Payé",           color: "text-gray-600",    bar: "#9ca3af" },
                };
                const maxVal = Math.max(...(stats?.par_statut ?? []).map((s: any) => s.total));
                return (stats?.par_statut ?? []).map((s: any) => {
                  const cfg = CFG[s.statut] ?? { label: s.statut, color: "text-gray-600", bar: "#9ca3af" };
                  return (
                    <div key={s.statut}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-xs font-bold text-[#0f1e36]">{s.total}</span>
                      </div>
                      <ProgressBar value={s.total} max={maxVal} color={cfg.bar} />
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      </div>

      {/* ── Ligne 3 : tableau détail services ────────────────────────────── */}
      {services.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/6 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
            <div>
              <h2 className="text-[#0f1e36] font-bold" style={{ fontSize: "1rem" }}>
                Détail par service
              </h2>
              <p className="text-[#5f7291] text-xs mt-0.5">Classé par durée décroissante</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-black/5">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">#</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Service</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Durée moy.</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Factures</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider w-40">Charge relative</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/4">
                {services.map((s, i) => {
                  const maxDuree = services[0].duree_moyenne_jours;
                  const color = i === 0 ? "#ef4444" : i === 1 ? "#f59e0b" : i === 2 ? "#f97316" : "#3b82f6";
                  return (
                    <tr key={s.service} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs text-[#5f7291]">{i + 1}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-semibold text-[#0f1e36]">{s.service}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${
                          s.duree_moyenne_jours <= 7
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : s.duree_moyenne_jours <= 14
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}>
                          <Clock className="w-3 h-3" />
                          {s.duree_moyenne_jours}j
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-[#5f7291]">{s.nombre_factures} facture{s.nombre_factures > 1 ? "s" : ""}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <ProgressBar value={s.duree_moyenne_jours} max={maxDuree} color={color} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}