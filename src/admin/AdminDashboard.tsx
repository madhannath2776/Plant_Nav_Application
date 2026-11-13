import { Check, Clock3, ImageOff, Inbox, MapPin, Navigation, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "../components/ui";
import { moderationMessage } from "../lib/api";
import { supabase } from "../lib/supabase";
import type { AdminSubmission, SubmissionStatus } from "../types";

type Counts = Record<SubmissionStatus, number>;
type Busy = "approving" | "approved" | "rejecting" | "rejected";

const tabs: { key: SubmissionStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const when = (value: string) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function AdminDashboard() {
  const [params, setParams] = useSearchParams();
  const status = (tabs.find((tab) => tab.key === params.get("status"))?.key ?? "pending") as SubmissionStatus;
  const [items, setItems] = useState<AdminSubmission[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState<Record<string, Busy>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<AdminSubmission | null>(null);
  const [reason, setReason] = useState("");
  const statusRef = useRef(status);
  statusRef.current = status;

  const load = useCallback(async (showSkeleton = false) => {
    if (!supabase) { setLoading(false); setFailed("Something went wrong"); return; }
    if (showSkeleton) setLoading(true);
    const [list, summary] = await Promise.all([
      supabase.rpc("admin_list_submissions", { p_status: statusRef.current }),
      supabase.rpc("admin_submission_counts"),
    ]);
    if (list.error) { setFailed(moderationMessage(list.error)); setLoading(false); return; }
    setFailed("");
    setItems((list.data as AdminSubmission[]) ?? []);
    if (summary.data) setCounts(summary.data as Counts);
    setLoading(false);
  }, []);

  useEffect(() => { void load(true); }, [load, status]);

  // New submissions appear without a refresh.
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel("admin-submissions").on(
      "postgres_changes", { event: "INSERT", schema: "public", table: "plant_submissions" }, () => void load(),
    ).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [load]);

  const clearLater = (id: string) => window.setTimeout(() => {
    setItems((list) => list.filter((item) => item.id !== id));
    setBusy((current) => { const copy = { ...current }; delete copy[id]; return copy; });
    void load();
  }, 1100);

  async function approve(item: AdminSubmission) {
    if (!supabase || busy[item.id]) return;
    setBusy((current) => ({ ...current, [item.id]: "approving" }));
    setErrors((current) => ({ ...current, [item.id]: "" }));
    const { error } = await supabase.rpc("approve_submission", { p_submission_id: item.id });
    if (error) {
      setBusy((current) => { const copy = { ...current }; delete copy[item.id]; return copy; });
      setErrors((current) => ({ ...current, [item.id]: moderationMessage(error) }));
      return;
    }
    // Only now, after the backend confirmed it, do we show "Approved".
    setBusy((current) => ({ ...current, [item.id]: "approved" }));
    clearLater(item.id);
  }

  async function confirmReject() {
    const item = rejecting;
    if (!supabase || !item) return;
    setBusy((current) => ({ ...current, [item.id]: "rejecting" }));
    const { error } = await supabase.rpc("reject_submission", { p_submission_id: item.id, p_reason: reason.trim() || null });
    if (error) {
      setBusy((current) => { const copy = { ...current }; delete copy[item.id]; return copy; });
      setErrors((current) => ({ ...current, [item.id]: moderationMessage(error) }));
      setRejecting(null);
      return;
    }
    setBusy((current) => ({ ...current, [item.id]: "rejected" }));
    setRejecting(null); setReason("");
    clearLater(item.id);
  }

  return (
    <>
      <nav className="admin-tabs" aria-label="Request status">
        {tabs.map((tab) => (
          <button key={tab.key} className={status === tab.key ? "active" : ""} onClick={() => setParams(tab.key === "pending" ? {} : { status: tab.key })}>
            {tab.label}<b className="num">{counts[tab.key]}</b>
          </button>
        ))}
      </nav>

      {loading ? <div className="admin-grid">{[1, 2, 3].map((n) => <div className="skeleton admin-skeleton" key={n} />)}</div>
        : failed ? <div className="admin-empty"><h2>{failed}</h2><Button variant="secondary" onClick={() => void load(true)}>Try again</Button></div>
        : items.length === 0 ? <div className="admin-empty"><span><Inbox size={30} /></span><h2>{status === "pending" ? "No pending requests" : `No ${status} requests`}</h2></div>
        : <div className="admin-grid">{items.map((item) => {
          const state = busy[item.id];
          return (
            <article className={`admin-card${state === "approved" ? " is-approved" : state === "rejected" ? " is-rejected" : ""}`} key={item.id}>
              <a className="admin-photo" href={item.image_url ?? undefined} target="_blank" rel="noreferrer" aria-label="Open photo">
                {item.image_url ? <img src={item.image_url} alt={item.plant_name} loading="lazy" /> : <ImageOff size={30} />}
              </a>
              <div className="admin-body">
                <div className="admin-title"><h2>{item.plant_name}</h2>
                  <span className={`status-chip ${item.status}`}>{item.status === "pending" ? <><Clock3 size={13} /> Pending</> : item.status === "approved" ? <><ShieldCheck size={13} /> Approved</> : <><X size={13} /> Rejected</>}</span>
                </div>
                <dl>
                  <div><dt>Submitted by</dt><dd>{item.submitted_by}</dd></div>
                  <div><dt>Date</dt><dd className="num">{when(item.created_at)}</dd></div>
                  <div><dt>Location</dt><dd><MapPin size={14} /> {item.landmark || "No landmark"}
                    <a className="coords num" href={`https://www.openstreetmap.org/?mlat=${item.latitude}&mlon=${item.longitude}#map=19/${item.latitude}/${item.longitude}`} target="_blank" rel="noreferrer">{item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}</a></dd></div>
                  <div><dt>Accuracy</dt><dd className="num"><Navigation size={14} /> {item.gps_accuracy != null ? `${Math.round(item.gps_accuracy)} m` : "Pinned on map"}</dd></div>
                  {item.status === "rejected" && item.rejection_reason && <div><dt>Reason</dt><dd>{item.rejection_reason}</dd></div>}
                  {item.reviewed_at && <div><dt>Reviewed</dt><dd className="num">{when(item.reviewed_at)}</dd></div>}
                </dl>
                {errors[item.id] && <p className="admin-error" role="alert">{errors[item.id]}</p>}
                {item.status === "pending" && (
                  <div className="admin-actions">
                    <button className="accept-btn" disabled={Boolean(state)} onClick={() => void approve(item)}>
                      {state === "approving" ? "Approving…" : state === "approved" ? <><Check size={18} strokeWidth={3} /> Approved</> : "Accept"}
                    </button>
                    <button className="reject-btn" disabled={Boolean(state)} onClick={() => { setReason(""); setRejecting(item); }}>
                      {state === "rejecting" ? "Rejecting…" : state === "rejected" ? "Rejected" : "Reject"}
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}</div>}

      {rejecting && (
        <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Reject request" onClick={(event) => { if (event.target === event.currentTarget && !busy[rejecting.id]) setRejecting(null); }}>
          <div className="admin-modal-card">
            <h2>Reject {rejecting.plant_name}?</h2>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={3} placeholder="Reason (optional)" aria-label="Rejection reason" />
            <div className="admin-modal-actions">
              <button className="modal-cancel" disabled={Boolean(busy[rejecting.id])} onClick={() => setRejecting(null)}>Cancel</button>
              <button className="modal-reject" disabled={Boolean(busy[rejecting.id])} onClick={() => void confirmReject()}>{busy[rejecting.id] === "rejecting" ? "Rejecting…" : "Reject"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
