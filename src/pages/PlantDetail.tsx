import { ArrowLeft, Calendar, Leaf, Map, MapPin, Navigation, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import useGeolocation from "../hooks/useGeolocation";
import { distanceInMeters, externalDirectionsUrl, formatDistance } from "../lib/geo";
import { supabase } from "../lib/supabase";
import type { PlantWithDistance } from "../types";

export default function PlantDetail() {
  const { id } = useParams();
  const { location, locate } = useGeolocation();
  const [plant, setPlant] = useState<PlantWithDistance | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { locate(); }, [locate]);
  useEffect(() => {
    if (!supabase || !id) { setLoading(false); return; }
    supabase.from("plants").select("id,name,image_url,landmark,latitude,longitude,created_at").eq("id", id).maybeSingle().then(({ data }) => {
      setPlant(data as PlantWithDistance | null); setLoading(false);
    });
  }, [id]);
  useEffect(() => {
    if (plant && location && plant.distance == null) setPlant({ ...plant, distance: distanceInMeters(location, plant) });
  }, [location, plant]);

  if (loading) return <div className="screen detail-screen"><div className="skeleton detail-image" /><div className="skeleton metric-skeleton" /></div>;
  if (!plant) return <div className="screen centered-state"><Leaf size={32} /><h1>Plant not found</h1><Link to="/map" className="button button-primary">Back to map</Link></div>;
  return (
    <div className="detail-screen">
      <div className="detail-image">
        {plant.image_url ? <img src={plant.image_url} alt={plant.name} /> : <Leaf size={55} />}
        <Link to="/map" className="floating-back" aria-label="Back to map"><ArrowLeft size={21} /></Link>
        <span className="detail-verified"><ShieldCheck size={15} /> Verified</span>
      </div>
      <div className="detail-sheet">
        <h1>{plant.name}</h1>
        <div className="detail-chips">
          <span><Navigation size={16} /> {formatDistance(plant.distance)}</span>
          {plant.landmark && <span><MapPin size={16} /> {plant.landmark}</span>}
          {plant.created_at && <span><Calendar size={16} /> {new Date(plant.created_at).toLocaleDateString()}</span>}
        </div>
        <div className="detail-coordinates"><MapPin size={17} /><span>{plant.latitude.toFixed(5)}, {plant.longitude.toFixed(5)}</span></div>
        <div className="detail-actions">
          <a href={externalDirectionsUrl(location, plant)} target="_blank" rel="noreferrer" className="button button-primary"><Navigation size={19} /> Navigate</a>
          <Link to="/map" className="button button-secondary"><Map size={19} /> Map</Link>
        </div>
      </div>
    </div>
  );
}
