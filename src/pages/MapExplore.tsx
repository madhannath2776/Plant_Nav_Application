import { Crosshair, Leaf, LocateFixed, MapPin, Navigation, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import MapView from "../components/MapView";
import useGeolocation from "../hooks/useGeolocation";
import { distanceInMeters, externalDirectionsUrl, formatDistance } from "../lib/geo";
import { supabase } from "../lib/supabase";
import type { Plant, PlantWithDistance } from "../types";

export default function MapExplore() {
  const { location, status, locate } = useGeolocation();
  const [plants, setPlants] = useState<Plant[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PlantWithDistance | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => { locate(); }, [locate]);

  // Only the public, verified `plants` table is ever read here.
  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); setFailed(true); return; }
    setFailed(false);
    const result = await supabase.from("plants").select("id,name,image_url,landmark,latitude,longitude,created_at").order("name").limit(2000);
    if (result.error) setFailed(true);
    else setPlants((result.data as Plant[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel("plants-public").on("postgres_changes", { event: "INSERT", schema: "public", table: "plants" }, () => void load()).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [load]);

  const withDistance = useMemo<PlantWithDistance[]>(() => plants.map((plant) => ({
    ...plant,
    distance: location ? distanceInMeters(location, plant) : undefined,
  })).sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)), [plants, location]);

  const term = query.trim().toLowerCase();
  const matches = useMemo(() => term ? withDistance.filter((plant) => plant.name.toLowerCase().includes(term)) : [], [withDistance, term]);
  // Typing narrows the markers to matches; once a plant is chosen every marker returns.
  const markers = term && !selected ? matches : withDistance;
  const fitKey = term && !selected ? `q:${term}:${matches.length}` : undefined;
  const nearest = withDistance.slice(0, 8);

  function choose(plant: PlantWithDistance) {
    setSelected(plant);
    setQuery(plant.name);
  }

  function clear() {
    setQuery("");
    setSelected(null);
  }

  return (
    <div className="map-screen">
      <MapView plants={markers} userLocation={location} selectedId={selected?.id} onSelect={choose} fitKey={fitKey} className="full-map" />
      <div className="map-search-wrap">
        <div className="map-search">
          <Search size={20} />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Search plants..." aria-label="Search verified plants" enterKeyHint="search" />
          {query && <button onClick={clear} aria-label="Clear search"><X size={18} /></button>}
        </div>
        {term && !selected && (
          <div className="map-results">
            {matches.length ? matches.slice(0, 6).map((plant) => (
              <button key={plant.id} onClick={() => choose(plant)}>
                <span>{plant.image_url ? <img src={plant.image_url} alt="" /> : <Leaf size={17} />}</span>
                <strong>{plant.name}</strong><small className="num">{formatDistance(plant.distance)}</small>
              </button>
            )) : <p className="map-no-results">No verified plants found</p>}
          </div>
        )}
      </div>
      <button className={`locate-control ${status === "locating" ? "locating" : ""}`} onClick={locate} aria-label="Use current location">
        {status === "locating" ? <Crosshair size={21} /> : <LocateFixed size={21} />}
      </button>
      <div className="map-status">
        {loading ? "Finding plants…" : failed ? <>Something went wrong <button onClick={() => { setLoading(true); void load(); }}>Try again</button></> : <><span className="num">{markers.length}</span> plants</>}
      </div>
      {!selected && !term && nearest.length > 0 && (
        <div className="map-nearby" aria-label="Nearby plants">
          {nearest.map((plant) => (
            <button key={plant.id} onClick={() => choose(plant)}>
              <span>{plant.image_url ? <img src={plant.image_url} alt="" loading="lazy" /> : <Leaf size={18} />}</span>
              <strong>{plant.name}</strong><small className="num">{formatDistance(plant.distance)}</small>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <aside className="plant-sheet">
          <button className="sheet-handle" onClick={clear} aria-label="Close plant card" />
          <div className="sheet-content">
            <div className="sheet-image">{selected.image_url ? <img src={selected.image_url} alt="" /> : <Leaf size={29} />}</div>
            <div className="sheet-info"><span className="verified-label">Verified</span><h2>{selected.name}</h2>
              <p><MapPin size={15} /> <span className="num">{formatDistance(selected.distance)}</span>{selected.landmark ? ` · ${selected.landmark}` : ""}</p></div>
          </div>
          <div className="sheet-actions">
            <a className="button button-primary" href={externalDirectionsUrl(location, selected)} target="_blank" rel="noreferrer"><Navigation size={18} /> Navigate</a>
            <Link className="button button-secondary" to={`/plant/${selected.id}`}>Details</Link>
          </div>
        </aside>
      )}
    </div>
  );
}
