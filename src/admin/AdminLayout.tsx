import { LogOut } from "lucide-react";
import { Outlet } from "react-router";
import treeNavigatorLogo from "../assets/tree-navigator-logo.png";
import { useAuth } from "../contexts/AuthContext";

/** ADMIN shell. Intentionally separate from the user app: no map, search, add, score or profile. */
export default function AdminLayout() {
  const { signOut } = useAuth();
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <img className="brand-logo" src={treeNavigatorLogo} alt="Tree Navigator" />
        <button className="admin-logout" onClick={() => void signOut()}><LogOut size={17} /> Logout</button>
      </header>
      <main className="admin-main"><Outlet /></main>
    </div>
  );
}
