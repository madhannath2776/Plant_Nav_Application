import { CheckCircle2, Clock3, FileText, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState, StatCard } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabase";
import type { Submission } from "../types";

type Row = Submission & { rejection_reason?: string | null };
const labels = { pending: "Pending", approved: "Verified", rejected: "Rejected" } as const;

export default function MyContributions() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    if (!supabase || !user) { setLoading(false); return; }
    supabase.from("plant_submissions").select("id,plant_name,status,created_at,image_url,landmark,rejection_reason").eq("user_id", user.id).order("created_at", { ascending: false }).then(({ data, error }) => {
      setFailed(Boolean(error));
      setItems((data as Row[]) || []); setLoading(false);
    });
    // Re-run when verified_count changes so an approval moves the row from Pending to Verified.
  }, [user, profile?.verified_count]);

  const shown = filter === "all" ? items : items.filter((item) => item.status === filter);
  return (
    <div className="page-shell">
      <h1 className="page-title">My plants</h1>
      <div className="stats-grid contributions-stats">
        <StatCard icon={FileText} label="Total" value={items.length} />
        <StatCard icon={Clock3} label="Pending" value={items.filter((i) => i.status === "pending").length} />
        <StatCard icon={CheckCircle2} label="Verified" value={items.filter((i) => i.status === "approved").length} />
        <StatCard icon={XCircle} label="Rejected" value={items.filter((i) => i.status === "rejected").length} />
      </div>
      <div className="filter-tabs">{(["all", "pending", "approved", "rejected"] as const).map((item) => <button className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item === "all" ? "All" : labels[item]}</button>)}</div>
      {loading ? <div className="skeleton h-80" />
        : failed ? <div className="empty-state"><h3>Something went wrong</h3><button className="button button-secondary" onClick={() => window.location.reload()}>Try again</button></div>
        : shown.length ? <div className="contribution-list">{shown.map((item) => (
          <article className="card contribution-item" key={item.id}>
            {item.image_url && <img src={item.image_url} alt="" loading="lazy" />}
            <div><h3>{item.plant_name}</h3><p>{item.landmark || "—"} · {new Date(item.created_at).toLocaleDateString()}{item.status === "rejected" && item.rejection_reason ? ` · ${item.rejection_reason}` : ""}</p></div>
            <span className={`badge badge-${item.status === "approved" ? "green" : item.status === "pending" ? "amber" : "red"}`}>{labels[item.status]}</span>
          </article>
        ))}</div> : <EmptyState title="No plants yet" action="Add plant" to="/add" />}
    </div>
  );
}
