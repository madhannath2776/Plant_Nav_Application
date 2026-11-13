import { Crown, Leaf, Medal, Trophy, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { levelFromXp } from "../lib/levels";
import { supabase } from "../lib/supabase";
import type { LeaderboardRow } from "../types";

function Avatar({ url, size, className }: { url?: string | null; size: number; className: string }) {
  return <div className={className}>{url ? <img src={url} alt="" /> : <UserRound size={size} />}</div>;
}

export default function Leaderboard() {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [me, setMe] = useState<LeaderboardRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); setFailed(true); return; }
    setFailed(false);
    const top = await supabase.from("leaderboard").select("*").order("rank", { ascending: true }).limit(50);
    if (top.error) { setFailed(true); setLoading(false); return; }
    const list = (top.data as LeaderboardRow[]) ?? [];
    setRows(list);
    if (user && !list.some((row) => row.id === user.id)) {
      const mine = await supabase.from("leaderboard").select("*").eq("id", user.id).maybeSingle();
      setMe((mine.data as LeaderboardRow | null) ?? null);
    } else setMe(null);
    setLoading(false);
  }, [user]);

  // Reload when my own XP changes (admin approval) so the board is never stale.
  useEffect(() => { void load(); }, [load, profile?.xp]);

  const top = rows.slice(0, 3);
  const mine = rows.find((row) => row.id === user?.id) ?? me;
  return (
    <div className="screen score-screen">
      <header className="screen-heading"><span><Trophy size={20} /></span><h1>Score</h1></header>
      {loading ? <><div className="skeleton podium-skeleton" /><div className="skeleton list-skeleton" /></>
        : failed ? <div className="centered-state compact"><Leaf size={30} /><h2>Something went wrong</h2><button className="button button-primary" onClick={() => { setLoading(true); void load(); }}>Try again</button></div>
        : rows.length ? <>
          <section className="podium">{top.map((row, index) => (
            <article className={`podium-card rank-${index + 1}`} key={row.id}>
              <span className="rank-crown">{index === 0 ? <Crown size={18} /> : <Medal size={18} />}</span>
              <Avatar url={row.avatar_url} size={24} className="score-avatar" />
              <strong>{row.full_name || "Explorer"}</strong><span className="num">{row.xp ?? 0} XP</span><small className="num">Level {row.level ?? levelFromXp(row.xp ?? 0)}</small>
            </article>
          ))}</section>
          {mine && <section className="your-rank"><span>You</span><strong className="num">#{mine.rank}</strong><small className="num">{mine.xp ?? 0} XP · {mine.verified_count} verified</small></section>}
          <section className="rank-list">{rows.slice(3).map((row) => (
            <article className={row.id === user?.id ? "current" : ""} key={row.id}>
              <span className="rank-number num">{row.rank}</span><Avatar url={row.avatar_url} size={18} className="list-avatar" />
              <strong>{row.full_name || "Explorer"}</strong><span className="num">{row.xp ?? 0} XP</span>
            </article>
          ))}</section>
        </> : <div className="centered-state compact"><Leaf size={30} /><h2>No scores yet</h2></div>}
    </div>
  );
}
