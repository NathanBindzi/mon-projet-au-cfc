import { useState, useEffect } from "react";
import { LoginPage } from "./components/LoginPage";
import { Sidebar } from "./components/Sidebar";
import { AccueilPage } from "./components/AccueilPage";
import { FacturesPage } from "./components/FacturesPage";
import { HabilitationsPage } from "./components/HabilitationsPage";
import { TableauDeBordPage } from "./components/TableauDeBordPage";
import { LogsPage } from "./components/LogsPage";
import { AlerteToast } from "./components/AlerteToast";
import { ProfilSchema, Page } from "./components/types";
import { getToken, clearToken, apiGetProfil } from "./components/api";

export default function App() {
  const [currentUser, setCurrentUser] = useState<ProfilSchema | null>(null);
  const [currentPage, setCurrentPage] = useState<Page>("accueil");
  const [restoring, setRestoring] = useState(true);

  // Restore session from localStorage token
  useEffect(() => {
    const token = getToken();
    if (!token) { setRestoring(false); return; }
    apiGetProfil()
      .then((profil) => setCurrentUser(profil))
      .catch(() => clearToken())
      .finally(() => setRestoring(false));
  }, []);

  const handleLogin = (user: ProfilSchema) => {
    setCurrentUser(user);
    setCurrentPage("accueil");
  };

  const handleLogout = () => {
    clearToken();
    setCurrentUser(null);
    setCurrentPage("accueil");
  };

  if (restoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#eef1f7]" style={{ fontFamily: "'Figtree', sans-serif" }}>
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin w-6 h-6 text-[#1e63d0]" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-[#5f7291] text-sm">Restauration de la session…</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case "accueil": return <AccueilPage currentUser={currentUser} />;
      case "factures": return <FacturesPage currentUser={currentUser} />;
      case "habilitations": return <HabilitationsPage />;
      case "tableau_de_bord": return <TableauDeBordPage />;
      case "logs": return <LogsPage />;
      default: return <AccueilPage currentUser={currentUser} />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ fontFamily: "'Figtree', sans-serif" }}>
      <Sidebar
        currentPage={currentPage}
        currentUser={currentUser}
        onNavigate={setCurrentPage}
        onLogout={handleLogout}
      />
      <main className="flex-1 overflow-y-auto bg-[#eef1f7]">
        {renderPage()}
      </main>
      <AlerteToast />
    </div>
  );
}
