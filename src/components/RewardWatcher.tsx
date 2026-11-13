import { Award, ChevronUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import treeNavigatorLogo from "../assets/tree-navigator-logo.png";
import { useAuth } from "../contexts/AuthContext";
import { achievementLabels, levelTitle } from "../lib/levels";
import { supabase } from "../lib/supabase";
import type { Submission } from "../types";

type Stage =
  | { kind: "xp" }
  | { kind: "level"; level: number }
  | { kind: "achievement"; code: string };

function CountUp({ to }: { to: number }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const start = performance.now() + 450;
    let id = 0;
    const frame = (time: number) => {
      const progress = Math.min(Math.max((time - start) / 800, 0), 1);
      setValue(Math.round(to * (1 - (1 - progress) ** 3)));
      if (progress < 1) id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [to]);
  return <>{value}</>;
}

/** PostgREST builders are lazy: the request is only sent once awaited, so always await/then them. */
async function acknowledge(submissionId: string) {
  if (!supabase) return;
  await supabase.rpc("ack_reward", { p_submission_id: submissionId });
}

/**
 * Watches for contributions an admin approved and plays the reward sequence once.
 * "Seen" is stored server-side (ack_reward), so the XP animation never repeats.
 */
export default function RewardWatcher() {
  const { user, refreshProfile } = useAuth();
  const [queue, setQueue] = useState<Submission[]>([]);
  const [stageIndex, setStageIndex] = useState(0);
  const dismissed = useRef(new Set<string>());

  const check = useCallback(async () => {
    if (!supabase || !user) return;
    const { data } = await supabase.from("plant_submissions")
      .select("id,plant_name,image_url,status,created_at,xp_awarded,level_before,level_after,achievements_unlocked,reward_seen")
      .eq("user_id", user.id).eq("status", "approved").eq("reward_seen", false)
      .order("reviewed_at", { ascending: true }).limit(10);
    const fresh = ((data ?? []) as Submission[]).filter((item) => !dismissed.current.has(item.id));
    // An approval that awarded nothing (already rewarded) needs no animation.
    for (const item of fresh.filter((entry) => !entry.xp_awarded)) {
      dismissed.current.add(item.id);
      void acknowledge(item.id);
    }
    setQueue(fresh.filter((item) => (item.xp_awarded ?? 0) > 0));
  }, [user]);

  useEffect(() => {
    if (!supabase || !user) { setQueue([]); return; }
    const client = supabase;
    void check();
    const channel = client.channel(`rewards-${user.id}`).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "plant_submissions", filter: `user_id=eq.${user.id}` },
      () => { void check(); void refreshProfile(); },
    ).subscribe();
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); void client.removeChannel(channel); };
  }, [user, check, refreshProfile]);

  const current = queue[0];
  const stages = useMemo<Stage[]>(() => {
    if (!current) return [];
    const list: Stage[] = [{ kind: "xp" }];
    if ((current.level_after ?? 1) > (current.level_before ?? 1)) list.push({ kind: "level", level: current.level_after ?? 1 });
    for (const code of current.achievements_unlocked ?? []) list.push({ kind: "achievement", code });
    return list;
  }, [current]);

  useEffect(() => { setStageIndex(0); }, [current?.id]);

  if (!current) return null;
  const stage = stages[Math.min(stageIndex, stages.length - 1)];
  const last = stageIndex >= stages.length - 1;

  function next() {
    if (!last) { setStageIndex(stageIndex + 1); return; }
    dismissed.current.add(current.id);
    setQueue((items) => items.filter((item) => item.id !== current.id));
    void acknowledge(current.id).then(() => refreshProfile());
  }

  return (
    <div className="reward-overlay" role="dialog" aria-modal="true" aria-label="Reward">
      <div className="reward-stage" key={`${current.id}-${stageIndex}`}>
        {stage.kind === "xp" && <>
          <div className="reward-mark verified">
            <span className="reward-halo" aria-hidden="true" />
            <img src={treeNavigatorLogo} alt="" />
          </div>
          <p className="reward-kicker">Verified</p>
          <h1 className="reward-title">{current.plant_name}</h1>
          <div className="reward-xp num">+<CountUp to={current.xp_awarded ?? 0} /> <small>XP</small></div>
        </>}
        {stage.kind === "level" && <>
          <div className="reward-badge level"><ChevronUp size={22} strokeWidth={3} /><strong className="num">{stage.level}</strong></div>
          <p className="reward-kicker">Level up</p>
          <h1 className="reward-title">{levelTitle(stage.level)}</h1>
        </>}
        {stage.kind === "achievement" && <>
          <div className="reward-badge"><Award size={40} strokeWidth={2.2} /></div>
          <p className="reward-kicker">Achievement unlocked</p>
          <h1 className="reward-title">{achievementLabels[stage.code] ?? "New achievement"}</h1>
        </>}
        <button className="button button-primary reward-button" onClick={next}>{last ? "Done" : "Continue"}</button>
      </div>
    </div>
  );
}
