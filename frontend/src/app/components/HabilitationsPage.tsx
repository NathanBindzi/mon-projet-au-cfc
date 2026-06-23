import { useState, useEffect, useCallback } from "react";
import { Plus, Search, X, UserCheck, UserX, Shield, Loader2, XCircle, RefreshCw } from "lucide-react";
import {
  apiGetUtilisateurs, apiActiverUtilisateur, apiDesactiverUtilisateur,
  apiModifierRole, apiRegister,
} from "./api";
import { UtilisateurResponse, RoleEnum } from "./types";
import { getRoleLabel, getRoleColor, getInitials } from "./utils";

function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    prenom: "", nom: "", email: "", motDePasse: "", role: "AGENT_COURRIER" as RoleEnum,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.prenom.trim()) e.prenom = "Requis";
    if (!form.nom.trim()) e.nom = "Requis";
    if (!form.email.includes("@")) e.email = "Email invalide";
    if (form.motDePasse.length < 6) e.motDePasse = "6 caractères minimum";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setApiError("");
    try {
      await apiRegister(form);
      onSaved();
      onClose();
    } catch (err: any) {
      setApiError(err.message ?? "Erreur lors de la création du compte.");
      setSaving(false);
    }
  };

  const roles: RoleEnum[] = ["AGENT_COURRIER", "INSTRUCTEUR", "SUPERVISEUR", "ADMINISTRATEUR"];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
        style={{ fontFamily: "'Figtree', sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-5 border-b border-black/6">
          <div>
            <h2 className="text-[#0f1e36] font-bold" style={{ fontSize: "1.1rem" }}>Nouvel utilisateur</h2>
            <p className="text-[#5f7291] text-xs mt-0.5">Créer un compte et attribuer un rôle</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#eef1f7] rounded-xl transition-colors">
            <X className="w-4 h-4 text-[#5f7291]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[{ key: "prenom", label: "Prénom", placeholder: "Nathan" }, { key: "nom", label: "Nom", placeholder: "Onana" }].map((f) => (
              <div key={f.key}>
                <label className="block text-sm font-semibold text-[#0f1e36] mb-1.5">{f.label}</label>
                <input
                  type="text"
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={(ev) => setForm({ ...form, [f.key]: ev.target.value })}
                  className="w-full bg-[#f2f5fb] border border-black/8 rounded-xl px-3.5 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30"
                  style={{ fontFamily: "'Figtree', sans-serif" }}
                />
                {errors[f.key] && <p className="text-xs text-red-600 mt-1">{errors[f.key]}</p>}
              </div>
            ))}
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#0f1e36] mb-1.5">Email</label>
            <input
              type="email"
              placeholder="j.dupont@cfc.ci"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-[#f2f5fb] border border-black/8 rounded-xl px-3.5 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30"
              style={{ fontFamily: "'Figtree', sans-serif" }}
            />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#0f1e36] mb-1.5">Mot de passe temporaire</label>
            <input
              type="password"
              placeholder="Minimum 6 caractères"
              value={form.motDePasse}
              onChange={(e) => setForm({ ...form, motDePasse: e.target.value })}
              className="w-full bg-[#f2f5fb] border border-black/8 rounded-xl px-3.5 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30"
              style={{ fontFamily: "'Figtree', sans-serif" }}
            />
            {errors.motDePasse && <p className="text-xs text-red-600 mt-1">{errors.motDePasse}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#0f1e36] mb-1.5">Rôle</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as RoleEnum })}
              className="w-full bg-[#f2f5fb] border border-black/8 rounded-xl px-3.5 py-2.5 text-sm text-[#0f1e36] focus:outline-none appearance-none"
              style={{ fontFamily: "'Figtree', sans-serif" }}
            >
              {roles.map((r) => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
            </select>
          </div>
          {apiError && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              <span>{apiError}</span>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-black/10 text-[#5f7291] text-sm font-semibold hover:bg-[#eef1f7] transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #6B2D0E, #E8820C)" }}
            >
              {saving ? "Création…" : "Créer le compte"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function HabilitationsPage() {
  const [users, setUsers] = useState<UtilisateurResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<RoleEnum | "">("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setUsers(await apiGetUtilisateurs());
    } catch (err: any) {
      setError(err.message ?? "Impossible de charger les utilisateurs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleStatut = async (user: UtilisateurResponse) => {
    setPendingId(user.idUtilisateur);
    try {
      if (user.actif) {
        await apiDesactiverUtilisateur(user.idUtilisateur);
      } else {
        await apiActiverUtilisateur(user.idUtilisateur);
      }
      await load();
    } catch (err: any) {
      alert(err.message ?? "Erreur lors de la modification.");
    } finally {
      setPendingId(null);
    }
  };

  const changeRole = async (user: UtilisateurResponse, role: RoleEnum) => {
    try {
      await apiModifierRole(user.idUtilisateur, role);
      await load();
    } catch (err: any) {
      alert(err.message ?? "Erreur lors du changement de rôle.");
    }
  };

  const filtered = users.filter((u) => {
    const text = `${u.prenom} ${u.nom} ${u.email}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (!filterRole || u.role === filterRole);
  });

  const roleList: RoleEnum[] = ["AGENT_COURRIER", "INSTRUCTEUR", "SUPERVISEUR", "ADMINISTRATEUR"];
  const actifs = users.filter((u) => u.actif).length;

  return (
    <div className="p-8" style={{ fontFamily: "'Figtree', sans-serif" }}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[#0f1e36] mb-1" style={{ fontSize: "1.5rem", fontWeight: 700 }}>Gestion des habilitations</h1>
          <p className="text-[#5f7291] text-sm">{actifs} actif{actifs > 1 ? "s" : ""} sur {users.length} comptes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-black/8 rounded-xl text-sm text-[#5f7291] hover:bg-[#eef1f7] transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
            style={{ background: "linear-gradient(180deg, #4A1E08 0%, #6B2D0E 100%)" }}
          >
            <Plus className="w-4 h-4" />
            Ajouter un utilisateur
          </button>
        </div>
      </div>

      {/* Role stats */}
      {!loading && !error && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {roleList.map((r) => (
            <div key={r} className="bg-white rounded-xl border border-black/6 p-4 flex items-center gap-3">
              <Shield className={`w-4 h-4 ${getRoleColor(r).split(" ")[1]}`} />
              <div>
                <p className="text-[#0f1e36] font-bold text-lg leading-none">{users.filter((u) => u.role === r).length}</p>
                <p className="text-[#5f7291] text-xs mt-1">{getRoleLabel(r)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5f7291]" />
          <input
            type="text"
            placeholder="Rechercher un utilisateur…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-black/8 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30"
            style={{ fontFamily: "'Figtree', sans-serif" }}
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as RoleEnum | "")}
          className="bg-white border border-black/8 rounded-xl px-4 py-2.5 text-sm text-[#0f1e36] focus:outline-none appearance-none"
          style={{ fontFamily: "'Figtree', sans-serif" }}
        >
          <option value="">Tous les rôles</option>
          {roleList.map((r) => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
        </select>
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
        <div className="bg-white rounded-2xl border border-black/6 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-black/5">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Utilisateur</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Rôle</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-[#5f7291] uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/4">
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-[#5f7291] text-sm">Aucun utilisateur trouvé.</td></tr>
                ) : filtered.map((user) => (
                  <tr key={user.idUtilisateur} className="hover:bg-[#f8fafc] transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">{getInitials(user.nom, user.prenom)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#0f1e36]">{user.prenom} {user.nom}</p>
                          <p className="text-xs text-[#5f7291]">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <select
                        value={user.role}
                        onChange={(e) => changeRole(user, e.target.value as RoleEnum)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium border-0 cursor-pointer focus:outline-none ${getRoleColor(user.role)}`}
                        style={{ fontFamily: "'Figtree', sans-serif" }}
                      >
                        {roleList.map((r) => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border ${
                        user.actif
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-500 border-gray-200"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.actif ? "bg-emerald-500" : "bg-gray-400"}`} />
                        {user.actif ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => toggleStatut(user)}
                        disabled={pendingId === user.idUtilisateur}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                          user.actif
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        }`}
                      >
                        {pendingId === user.idUtilisateur ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : user.actif ? (
                          <><UserX className="w-3.5 h-3.5" /> Désactiver</>
                        ) : (
                          <><UserCheck className="w-3.5 h-3.5" /> Activer</>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && <AddUserModal onClose={() => setShowAddModal(false)} onSaved={load} />}
    </div>
  );
}
