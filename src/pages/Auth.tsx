import { Check, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import treeNavigatorLogo from "../assets/tree-navigator-logo.png";
import { Button } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { userMessage } from "../lib/api";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function Auth() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");

  // Signed in: the database-verified role decides where to go.
  if (user && !authLoading) return <Navigate to={isAdmin ? "/admin" : "/"} replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) { setMessage("Something went wrong"); return; }
    setLoading(true); setMessage("");
    const result = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() } } });
    setLoading(false);
    if (result.error) { setMessage(userMessage(result.error)); return; }
    if (mode === "signup" && !result.data.session) { setMessage("Check your email to confirm"); return; }
    setSuccess(true);
  }

  async function forgot() {
    if (!supabase || !email.trim()) { setMessage("Enter your email first"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setMessage(error ? "Something went wrong" : "Check your email");
  }

  return (
    <main className="login-screen">
      <img className="login-logo" src={treeNavigatorLogo} alt="Tree Navigator" />
      <section className="login-card">
        <form onSubmit={submit}>
          {mode === "signup" && (
            <label className="login-field"><div><UserRound size={18} /><input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Name" aria-label="Name" /></div></label>
          )}
          <label className="login-field"><div><Mail size={18} /><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" aria-label="Email" /></div></label>
          <label className="login-field"><div><LockKeyhole size={18} /><input type={show ? "text" : "password"} minLength={6} required autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" aria-label="Password" /><button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          {message && <p className="login-message" role="alert">{message}</p>}
          <Button type="submit" loading={loading} disabled={!isSupabaseConfigured || success}>
            {success ? <><Check size={18} /></> : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <div className="login-links">
          <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "Create account" : "Sign in"}</button>
          {mode === "signin" && <button onClick={forgot}>Forgot password</button>}
        </div>
      </section>
      <button className="browse-button" onClick={() => navigate("/")}>Browse as guest</button>
      {success && <div className="login-success-transition" aria-hidden="true"><img src={treeNavigatorLogo} alt="" /></div>}
    </main>
  );
}
