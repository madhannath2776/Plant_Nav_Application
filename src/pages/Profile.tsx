import { Award, Camera, Check, CheckCircle2, Clock3, Leaf, LogOut, Medal, Pencil, Sparkles, Trophy, UserRound, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { compressImage } from "../lib/api";
import { levelProgress, levelTitle } from "../lib/levels";
import { supabase } from "../lib/supabase";
import type { Submission } from "../types";

type AchievementRow = { code: string; label: string; goal: number };

const achievementIcons = [Leaf, CheckCircle2, Award, Trophy];

export default function Profile() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const [rank, setRank] = useState<number | null>(null);
  const [history, setHistory] = useState<Submission[]>([]);
  const [achievements, setAchievements] = useState<AchievementRow[]>([]);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const xp = profile?.xp ?? 0;
  const verified = profile?.verified_count ?? 0;

  const load = useCallback(async () => {
    if (!supabase || !user) return;
    const [rankResult, historyResult, catalog, mine] = await Promise.all([
      supabase.from("leaderboard").select("rank").eq("id", user.id).maybeSingle(),
      supabase.from("plant_submissions").select("id,plant_name,image_url,landmark,status,created_at,rejection_reason").eq("user_id", user.id).order("created_at", { ascending: false }).limit(6),
      supabase.from("achievements").select("code,label,goal").order("sort"),
      supabase.from("user_achievements").select("code").eq("user_id", user.id),
    ]);
    setRank((rankResult.data as { rank: number } | null)?.rank ?? null);
    setHistory((historyResult.data as Submission[]) ?? []);
    setAchievements((catalog.data as AchievementRow[]) ?? []);
    setUnlocked(new Set(((mine.data as { code: string }[]) ?? []).map((row) => row.code)));
  }, [user]);

  // Refreshes whenever XP / verified count changes (approval) as well as on first load.
  useEffect(() => { void load(); }, [load, xp, verified]);

  async function uploadAvatar(file?: File) {
    if (!file || !supabase || !user) return;
    if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) { setMessage("Use an image under 10 MB"); return; }
    setUploading(true); setMessage("");
    const small = await compressImage(file, 600, 0.85);
    const extension = small.type === "image/png" ? "png" : small.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/avatar-${crypto.randomUUID()}.${extension}`;
    const upload = await supabase.storage.from("avatars").upload(path, small, { contentType: small.type, cacheControl: "31536000" });
    if (upload.error) { setMessage("Upload failed"); setUploading(false); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const update = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
    if (update.error) setMessage("Upload failed");
    else { await refreshProfile(); setMessage(""); }
    setUploading(false);
  }

  async function saveName() {
    const value = nameDraft.trim();
    if (!supabase || !user || !value) { setEditing(false); return; }
    const update = await supabase.from("profiles").update({ full_name: value }).eq("id", user.id);
    if (update.error) setMessage("Something went wrong");
    else { await refreshProfile(); setEditing(false); }
  }

  const { level, into, next, percent } = levelProgress(xp);
  const displayName = profile?.full_name || (user?.user_metadata?.full_name as string | undefined) || "Explorer";
  return (
    <div className="screen profile-screen">
      <section className="profile-top">
        <label className="profile-avatar">
          {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : <UserRound size={42} />}
          <span>{uploading ? <Sparkles className="spin" size={17} /> : <Camera size={17} />}</span>
          <input hidden type="file" accept="image/*" aria-label="Change profile photo" onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        {editing ? (
          <div className="name-edit">
            <input autoFocus value={nameDraft} maxLength={60} onChange={(event) => setNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void saveName(); }} aria-label="Name" />
            <button onClick={() => void saveName()} aria-label="Save name"><Check size={18} /></button>
            <button onClick={() => setEditing(false)} aria-label="Cancel"><X size={18} /></button>
          </div>
        ) : (
          <h1>{displayName} <button className="name-pencil" onClick={() => { setNameDraft(profile?.full_name ?? ""); setEditing(true); }} aria-label="Edit name"><Pencil size={15} /></button></h1>
        )}
        {message && <small className="profile-message" role="alert">{message}</small>}
      </section>

      <section className="profile-game-card">
        <div className="profile-level"><Medal size={23} /><strong className="num">{level}</strong></div>
        <div><span>Level <span className="num">{level}</span></span><h2>{levelTitle(level)}</h2><div className="xp-track"><i style={{ width: `${percent}%` }} /></div><small className="num">{into} / {next} XP</small></div>
      </section>

      <section className="profile-stats four">
        <div><CheckCircle2 size={19} /><strong className="num">{verified}</strong><span>Verified</span></div>
        <div><Sparkles size={19} /><strong className="num">{xp}</strong><span>XP</span></div>
        <div><Trophy size={19} /><strong className="num">{rank ? `#${rank}` : "—"}</strong><span>Rank</span></div>
        <div><Medal size={19} /><strong className="num">{level}</strong><span>Level</span></div>
      </section>

      {achievements.length > 0 && <section className="profile-section"><header><h2>Achievements</h2></header><div className="achievement-strip">{achievements.map(({ code, label, goal }, index) => {
        const Icon = achievementIcons[index % achievementIcons.length];
        const isUnlocked = unlocked.has(code);
        return <article className={isUnlocked ? "unlocked" : ""} key={code}><span><Icon size={21} /></span><strong>{label}</strong><small className="num">{isUnlocked ? "Unlocked" : `${Math.min(verified, goal)}/${goal}`}</small></article>;
      })}</div></section>}

      <section className="profile-section"><header><h2>History</h2><Link to="/contributions">All</Link></header>
        {history.length ? <div className="history-list">{history.map((item) => (
          <article key={item.id}>
            <div className="history-thumb">{item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : <Leaf size={20} />}</div>
            <div><strong>{item.plant_name}</strong><small>{new Date(item.created_at).toLocaleDateString()}</small></div>
            <span className={`status-chip ${item.status}`}>{item.status === "approved" ? <><CheckCircle2 size={13} /> Verified</> : item.status === "pending" ? <><Clock3 size={13} /> Pending</> : <><XCircle size={13} /> Rejected</>}</span>
          </article>
        ))}</div>
          : <div className="compact-empty"><Leaf size={20} /><span>No plants yet</span><Link to="/add">Add plant</Link></div>}
      </section>
      <div className="profile-actions"><Button variant="ghost" onClick={() => void signOut()}><LogOut size={18} /> Sign out</Button></div>
    </div>
  );
}
