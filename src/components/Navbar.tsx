import { Home, LogIn, Map, Plus, UserRound } from "lucide-react";
import { NavLink } from "react-router";
import podiumIcon from "../assets/podium.png";
import treeNavigatorLogo from "../assets/tree-navigator-logo.png";
import { useAuth } from "../contexts/AuthContext";

const destinations = [
  { to: "/", label: "Home", icon: Home },
  { to: "/map", label: "Navigate", icon: Map },
  { to: "/add", label: "Add", icon: Plus, primary: true },
  { to: "/score", label: "Score", image: podiumIcon },
  { to: "/profile", label: "Profile", icon: UserRound },
];

export default function Navbar() {
  const { user, profile } = useAuth();
  return (
    <>
      <header className="app-header">
        <NavLink to="/" end className="brand" aria-label="Tree Navigator home">
          <img className="brand-logo" src={treeNavigatorLogo} alt="Tree Navigator" />
        </NavLink>
        {user ? (
          <NavLink to="/profile" className="header-avatar" aria-label="Profile">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <UserRound size={19} />}
          </NavLink>
        ) : (
          <NavLink to="/auth" className="header-avatar" aria-label="Sign in"><LogIn size={18} /></NavLink>
        )}
      </header>
      <nav className="bottom-nav" aria-label="Primary navigation">
        {destinations.map(({ to, label, icon: Icon, image, primary }) => (
          <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `bottom-link ${isActive ? "active" : ""} ${primary ? "add-link" : ""}`}>
            <span>{image ? <img src={image} alt="" className="podium-icon" /> : Icon ? <Icon size={primary ? 25 : 21} strokeWidth={primary ? 2.5 : 2} /> : null}</span>
            <small>{label}</small>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
