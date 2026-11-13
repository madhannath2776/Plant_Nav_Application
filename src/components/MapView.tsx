import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import type { Coordinates, PlantWithDistance } from "../types";

const defaultCenter: [number, number] = [20.5937, 78.9629];

function plantIcon(selected: boolean) {
  return L.divIcon({
    className: "",
    html: `<span class="plant-marker${selected ? " selected" : ""}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1 7 7 0 0 1 22 3c0 5.5-3.1 10-8 10.9V20h-3Zm0-3.4v-4.1c-1.5-.8-2.5-2.2-2.8-3.8A4 4 0 0 0 11 16.6Zm3-5.9c2.5-.8 4.2-2.6 4.8-5.5-2.9.3-4.7 2-4.8 5.5Z"/></svg></span>`,
    iconSize: [42, 48],
    iconAnchor: [21, 46],
  });
}

const userIcon = L.divIcon({
  className: "",
  html: '<span class="user-marker"><i></i></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function MapController({ plants, userLocation, selectedId, fitKey }: {
  plants: PlantWithDistance[];
  userLocation: Coordinates | null;
  selectedId?: string | null;
  fitKey?: string;
}) {
  const map = useMap();
  const initialFit = useRef(false);
  const plantsRef = useRef(plants);
  plantsRef.current = plants;

  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 50);
    return () => window.clearTimeout(id);
  }, [map]);

  // Selected plant: move to it.
  useEffect(() => {
    const selected = plantsRef.current.find((plant) => plant.id === selectedId);
    if (selected) map.flyTo([selected.latitude, selected.longitude], 18, { duration: 0.6 });
  }, [map, selectedId]);

  // New GPS fix (first fix or the locate button): move to the user.
  useEffect(() => {
    if (userLocation && !selectedId) {
      initialFit.current = true;
      map.flyTo([userLocation.latitude, userLocation.longitude], 16, { duration: 0.6 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, userLocation]);

  // Search narrowed the markers: frame the matches. Also frame everything once if there is no GPS.
  useEffect(() => {
    const list = plantsRef.current;
    if (selectedId || !list.length) return;
    if (fitKey || !initialFit.current) {
      initialFit.current = true;
      map.fitBounds(L.latLngBounds(list.map((plant) => [plant.latitude, plant.longitude])), { padding: [60, 60], maxZoom: 18 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey, plants.length]);
  return null;
}

export default function MapView({
  plants,
  userLocation = null,
  selectedId,
  onSelect,
  fitKey,
  className = "",
}: {
  plants: PlantWithDistance[];
  userLocation?: Coordinates | null;
  selectedId?: string | null;
  onSelect?: (plant: PlantWithDistance) => void;
  /** Change this (e.g. the search text) to re-frame the visible markers. */
  fitKey?: string;
  className?: string;
}) {
  const first = plants[0];
  const center: [number, number] = userLocation
    ? [userLocation.latitude, userLocation.longitude]
    : first ? [first.latitude, first.longitude] : defaultCenter;
  return (
    <MapContainer className={`map-view ${className}`} center={center} zoom={first || userLocation ? 16 : 4} zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        eventHandlers={{ tileerror: (event) => {
          (event.tile as HTMLImageElement).style.visibility = "hidden";
        } }}
      />
      <MapController plants={plants} userLocation={userLocation} selectedId={selectedId} fitKey={fitKey} />
      {plants.map((plant) => (
        <Marker
          key={plant.id}
          position={[plant.latitude, plant.longitude]}
          icon={plantIcon(plant.id === selectedId)}
          eventHandlers={{ click: () => onSelect?.(plant) }}
        />
      ))}
      {userLocation && <Marker position={[userLocation.latitude, userLocation.longitude]} icon={userIcon} />}
    </MapContainer>
  );
}
