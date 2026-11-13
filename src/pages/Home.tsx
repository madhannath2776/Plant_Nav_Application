import { ArrowRight, Camera, ChevronRight, Compass, Expand, Leaf, Map, MapPin, Sparkles, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import MapView from "../components/MapView";
import { useAuth } from "../contexts/AuthContext";
import useGeolocation from "../hooks/useGeolocation";
import { distanceInMeters, formatDistance } from "../lib/geo";
import { levelProgress, levelTitle } from "../lib/levels";
import { supabase } from "../lib/supabase";
import type { Plant, PlantWithDistance } from "../types";

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let id = 0;
    const frame = (time: number) => {
      const progress = Math.min((time - start) / 700, 1);
      setDisplay(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [value]);
  return <>{display.toLocaleString()}</>;
}

export default function Home() {
  const { user, profile } = useAuth();
  const { location, locate } = useGeolocation();
  const [count, setCount] = useState(0);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => { locate(); }, [locate]);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); setFailed(true); return; }
    setFailed(false);
    const [plantCount, plantList] = await Promise.all([
      supabase.from("plants").select("*", { count: "exact", head: true }),
      supabase.from("plants").select("id,name,image_url,landmark,latitude,longitude,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    if (plantCount.error || plantList.error) setFailed(true);
    setCount(plantCount.count ?? 0);
    setPlants((plantList.data as Plant[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load, profile?.verified_count]);

  const nearby = useMemo<PlantWithDistance[]>(() => plants.map((plant) => ({
    ...plant,
    distance: location ? distanceInMeters(location, plant) : undefined,
  })).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)), [plants, location]);

  const xp = profile?.xp ?? 0;
  const { level, into, next, percent } = levelProgress(xp);
  const nearbyCount = location ? nearby.filter((plant) => (plant.distance ?? Infinity) <= 1000).length : null;

  return (
    <div className="screen home-screen">
      <section className="plant-total">
        <div>
          <span className="metric-label"><Leaf size={15} /> Verified plants</span>
          <strong className="num">{loading ? "—" : <AnimatedNumber value={count} />}</strong>
        </div>
        <Link to="/map" className="round-action" aria-label="Open map"><Compass size={25} /></Link>
      </section>

      <section className="quick-stats" aria-label="Your statistics">
        <div><MapPin size={18} /><strong className="num">{nearbyCount ?? "—"}</strong><span>Nearby</span></div>
        <div><Camera size={18} /><strong className="num">{user ? profile?.verified_count ?? 0 : "—"}</strong><span>My plants</span></div>
        <div><Sparkles size={18} /><strong className="num">{user ? xp : "—"}</strong><span>XP</span></div>
      </section>

      <section className="primary-actions">
        <Link to="/map" className="explore-button"><Map size={21} /><span>Explore nearby</span><ArrowRight size={20} /></Link>
        <Link to="/add" className="add-button"><Camera size={20} /><span>Add plant</span></Link>
      </section>

      <div className="home-map-card">
        <MapView plants={nearby.slice(0, 40)} userLocation={location} className="home-map" />
        <Link to="/map" className="map-overlay-label" aria-label="Open full map"><Expand size={16} /></Link>
      </div>

      <section className="home-section">
        <header><h2>Nearby</h2><Link to="/map">Map <ChevronRight size={16} /></Link></header>
        {loading ? <div className="nearby-strip"><div className="skeleton nearby-skeleton" /><div className="skeleton nearby-skeleton" /><div className="skeleton nearby-skeleton" /></div>
          : failed ? <div className="compact-empty"><Leaf size={20} /><span>Something went wrong</span><button onClick={() => { setLoading(true); void load(); }}>Try again</button></div>
          : nearby.length ? <div className="nearby-strip">{nearby.slice(0, 10).map((plant) => (
            <Link to={`/plant/${plant.id}`} className="nearby-card" key={plant.id}>
              <div>{plant.image_url ? <img src={plant.image_url} alt="" loading="lazy" /> : <Leaf size={25} />}<span className="mini-verified">✓</span></div>
              <strong>{plant.name}</strong><span className="num">{formatDistance(plant.distance)}</span>
            </Link>
          ))}</div>
          : <div className="compact-empty"><Leaf size={20} /><span>No verified plants yet</span><Link to="/add">Add plant</Link></div>}
      </section>

      <section className="game-card">
        <div className="level-badge"><Trophy size={21} /><strong className="num">{user ? level : "—"}</strong></div>
        <div className="level-copy">
          <span>Level <span className="num">{user ? level : "—"}</span></span><strong>{user ? levelTitle(level) : "Earn XP"}</strong>
          <div className="xp-track"><i style={{ width: `${user ? percent : 0}%` }} /></div>
          <small className="num">{user ? `${into} / ${next} XP` : "Sign in to track progress"}</small>
        </div>
        <Link to={user ? "/profile" : "/auth"} className={user ? "level-link" : "login-cta"} aria-label={user ? "Open profile" : "Sign in"}>
          {user ? <ChevronRight size={20} /> : "Sign in"}
        </Link>
      </section>
    </div>
  );
}
