import { useState, useEffect, useCallback } from "react";
import { Search, Download, RefreshCw, Loader2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { apiGetLogs } from "./api";
import { LogResponse } from "./types";
import { formatDateTime } from "./utils";

const PAGE_SIZE = 10;

export function LogsPage() {
  const [logs, setLogs] = useState<LogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiGetLogs({
        action: filterAction || undefined,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setLogs(data);
      if (data.length === PAGE_SIZE) setTotal((page + 2) * PAGE_SIZE);
      else setTotal(page * PAGE_SIZE + data.length);
    } catch (err: any) {
      setError(err.message ?? "Impossible de charger les journaux.");
    } finally {
      setLoading(false);
    }
  }, [filterAction, page]);

  useEffect(() => { setPage(0); }, [filterAction]);
  useEffect(() => { load(); }, [load]);

  const filtered = logs.filter((l) => {
    if (!search) return true;
    const text = `${l.action} ${l.commentaire ?? ""} ${l.ancienStatut ?? ""} ${l.nouveauStatut ?? ""}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const actionCounts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.action] = (acc[l.action] ?? 0) + 1;
    return acc;
  }, {});

  const commonActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const handleExport = () => {
    const rows = [
      ["Date", "Action", "Ancien statut", "Nouveau statut", "Commentaire", "Facture", "Utilisateur"],
      ...logs.map((l) => [
        l.dateAction ?? "",
        l.action,
        l.ancienStatut ?? "",
        l.nouveauStatut ?? "",
        l.commentaire ?? "",
        l.codeFacture ?? "",
        l.nomUtilisateur ?? "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `logs-${new Date().toLocaleDateString("fr-FR").replace(/\//g, "-")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8" style={{ fontFamily: "'Figtree', sans-serif" }}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[#0f1e36] mb-1" style={{ fontSize: "1.5rem", fontWeight: 700 }}>Journaux système</h1>
          <p className="text-[#5f7291] text-sm">Historique complet de toutes les actions  <code className="bg-[#eef1f7] px-1 rounded text-xs"></code></p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-black/8 rounded-xl text-sm text-[#5f7291] hover:bg-[#eef1f7] transition-colors font-medium">
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
          <button onClick={handleExport} disabled={logs.length === 0} className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-black/8 rounded-xl text-sm text-[#5f7291] hover:bg-[#eef1f7] transition-colors font-medium disabled:opacity-50">
            <Download className="w-4 h-4" />
            Exporter CSV
          </button>
        </div>
      </div>

      {/* Actions fréquentes */}
      {!loading && !error && commonActions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {commonActions.map(([action, count]) => (
            <button
              key={action}
              onClick={() => setFilterAction(filterAction === action ? "" : action)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-colors ${
                filterAction === action
                  ? "bg-[#1a3560] text-white"
                  : "bg-white border border-black/8 text-[#5f7291] hover:bg-[#eef1f7]"
              }`}
            >
              {action} <span className="opacity-60 ml-1">{count}</span>
            </button>
          ))}
          {filterAction && (
            <button
              onClick={() => setFilterAction("")}
              className="text-xs px-3 py-1.5 rounded-full font-semibold bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
            >
              ✕ Effacer le filtre
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5f7291]" />
          <input
            type="text"
            placeholder="Rechercher dans les journaux…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-black/8 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30"
            style={{ fontFamily: "'Figtree', sans-serif" }}
          />
        </div>
        <input
          type="text"
          placeholder="Filtrer par action (ex: SAISIE_EB)"
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="bg-white border border-black/8 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30 w-52"
          style={{ fontFamily: "'Figtree', sans-serif" }}
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-black/6 p-20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-[#1e63d0] animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-black/6 p-16 text-center">
          <XCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-[#0f1e36] font-semibold mb-1">Erreur de chargement</p>
          <p className="text-[#5f7291] text-sm mb-4">{error}</p>
          <button onClick={load} className="text-sm text-[#1e63d0] font-medium hover:underline">Réessayer</button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-black/6 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-black/5">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Horodatage</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Action</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Transition statut</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Commentaire</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Facture</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Utilisateur</th>
                  
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/4">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-12 text-center text-[#5f7291] text-sm">Aucune entrée trouvée.</td></tr>
                  ) : filtered.map((log) => (
                    <tr key={log.idLog} className="hover:bg-[#f8fafc] transition-colors">
                      
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs text-[#5f7291] whitespace-nowrap">{formatDateTime(log.dateAction)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs bg-[#f2f5fb] text-[#1a3560] px-2 py-1 rounded-lg font-semibold whitespace-nowrap">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {(log.ancienStatut || log.nouveauStatut) ? (
                          <div className="flex items-center gap-1.5 text-xs">
                            {log.ancienStatut && <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{log.ancienStatut}</span>}
                            {log.ancienStatut && log.nouveauStatut && <span className="text-[#5f7291]">→</span>}
                            {log.nouveauStatut && <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-medium">{log.nouveauStatut}</span>}
                          </div>
                        ) : <span className="text-xs text-[#5f7291]">—</span>}
                      </td>
                      <td className="px-4 py-3.5 max-w-[200px]">
                        {log.commentaire ? (
                          <p className="text-xs text-[#5f7291] truncate italic">« {log.commentaire} »</p>
                        ) : <span className="text-xs text-[#5f7291]">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {log.codeFacture ? (
                          <span className="font-mono text-xs font-semibold text-[#1a3560] bg-[#eef1f7] px-2 py-1 rounded-lg">
                            {log.codeFacture}
                          </span>
                        ) : <span className="text-xs text-[#5f7291]">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {log.nomUtilisateur ? (
                          <span className="text-xs font-medium text-[#0f1e36]">{log.nomUtilisateur}</span>
                        ) : <span className="text-xs text-[#5f7291]">—</span>}
                      </td>
                      
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-[#5f7291]">
              Page {page + 1} · {filtered.length} entrée{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded-xl bg-white border border-black/8 text-[#5f7291] hover:bg-[#eef1f7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={logs.length < PAGE_SIZE}
                className="p-2 rounded-xl bg-white border border-black/8 text-[#5f7291] hover:bg-[#eef1f7] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
         
        </>
      )}
    </div>
  );
}