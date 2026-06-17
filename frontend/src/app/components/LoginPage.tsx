import { useState } from "react";
import { Lock, Mail, Eye, EyeOff, FileText, AlertCircle } from "lucide-react";
import { apiLogin, apiGetProfil } from "./api";
import { ProfilSchema } from "./types";

interface LoginPageProps {
  onLogin: (user: ProfilSchema) => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Veuillez renseigner votre email et votre mot de passe.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await apiLogin(email.trim(), password);
      const profil = await apiGetProfil();
      onLogin(profil);
    } catch (err: any) {
      setError(err.message ?? "Échec de la connexion. Vérifiez vos identifiants.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Figtree', sans-serif" }}>
      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(145deg, #0f1e36 0%, #1a3560 60%, #1e4d8c 100%)" }}
      >
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-white/20"
              style={{
                width: `${180 + i * 120}px`,
                height: `${180 + i * 120}px`,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
            />
          ))}
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/15 rounded-xl flex items-center justify-center border border-white/20">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className="text-white/90 text-lg tracking-wide" style={{ fontFamily: "'DM Serif Display', serif" }}>
            CFC — SuiFact
          </span>
        </div>

        <div className="relative z-10">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-4">Plateforme officielle</p>
          <h1
            className="text-white mb-6 leading-tight"
            style={{ fontFamily: "'DM Serif Display', serif", fontSize: "2.6rem", lineHeight: "1.2" }}
          >
            Suivi et Gestion
            <br />
            <span className="text-blue-300">des Factures</span>
          </h1>
          <p className="text-white/60 leading-relaxed max-w-sm" style={{ fontSize: "0.92rem" }}>
            Plateforme Partagée de Suivi des Factures au CFC. 
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-4">
          {[
            { label: "Sécurité", desc: "JWT + HTTPS" },
            { label: "Multi-rôles", desc: "4 profils distincts" },
            { label: "Traçabilité", desc: "Audit complet" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white/10 rounded-xl p-4 border border-white/10">
              <p className="text-white font-semibold text-sm">{stat.label}</p>
              <p className="text-white/50 text-xs mt-1">{stat.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-[#eef1f7]">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-[#1a3560] rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <span className="text-[#1a3560] font-semibold" style={{ fontFamily: "'DM Serif Display', serif" }}>
              SuiFact CFC
            </span>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8">
            <div className="mb-8">
              <h2 className="text-[#0f1e36] mb-2" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                Connexion
              </h2>
              <p className="text-[#5f7291] text-sm">Accédez à votre espace sécurisé</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#0f1e36] mb-2">Adresse email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5f7291]" />
                  <input
                    type="email"
                    placeholder="votre.email@cfc.ci"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    className="w-full bg-[#f2f5fb] border border-black/8 rounded-xl pl-10 pr-4 py-3 text-[#0f1e36] text-sm focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30 focus:border-[#1e63d0]"
                    style={{ fontFamily: "'Figtree', sans-serif" }}
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#0f1e36] mb-2">Mot de passe</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5f7291]" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Votre mot de passe"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    className="w-full bg-[#f2f5fb] border border-black/8 rounded-xl pl-10 pr-12 py-3 text-[#0f1e36] text-sm focus:outline-none focus:ring-2 focus:ring-[#1e63d0]/30 focus:border-[#1e63d0]"
                    style={{ fontFamily: "'Figtree', sans-serif" }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#5f7291] hover:text-[#0f1e36] transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "linear-gradient(135deg, #1a3560, #1e63d0)", fontFamily: "'Figtree', sans-serif" }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Connexion en cours…
                  </span>
                ) : "Se connecter"}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-[#5f7291] mt-6">
            © {new Date().getFullYear()} CFC SuiFact — Accès réservé au personnel autorisé.
          </p>
        </div>
      </div>
    </div>
  );
}
