import { Check, Crosshair, MapPin } from "lucide-react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import type { Coordinates } from "../types";
import { Button } from "./ui";

const pinIcon = L.divIcon({
  className: "",
  html: '<span class="picker-marker"><svg viewBox="0 0 24 24"><path d="M12 22s7-6.1 7-13A7 7 0 1 0 5 9c0 6.9 7 13 7 13Zm0-10a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg></span>',
  iconSize: [42, 48],
  iconAnchor: [21, 46],
});

function PickerEvents({ onChange }: { onChange: (value: Coordinates) => void }) {
  useMapEvents({ click: (event) => onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng }) });
  return null;
}

export default function LocationPicker({ value, near, onChange, onConfirm }: {
  value: Coordinates | null;
  /** Where to open the map when nothing is picked yet (e.g. last GPS fix). */
  near?: Coordinates | null;
  onChange: (value: Coordinates) => void;
  onConfirm: () => void;
}) {
  const start = value ?? near ?? null;
  const center: [number, number] = start ? [start.latitude, start.longitude] : [20.5937, 78.9629];
  return (
    <div className="location-picker">
      <MapContainer center={center} zoom={start ? 17 : 4} className="picker-map">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <PickerEvents onChange={onChange} />
        {value && <Marker position={[value.latitude, value.longitude]} icon={pinIcon} />}
      </MapContainer>
      <div className="picker-bar">
        <span>{value ? <><MapPin size={17} /> Location selected</> : <><Crosshair size={17} /> Tap the map</>}</span>
        <Button disabled={!value} onClick={onConfirm}><Check size={17} /> Confirm</Button>
      </div>
    </div>
  );
}
