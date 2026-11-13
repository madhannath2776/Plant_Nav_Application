import type { Coordinates } from "../types";

const earthRadius = 6_371_000;

export function distanceInMeters(a: Coordinates, b: Coordinates) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(b.latitude - a.latitude);
  const longitudeDelta = toRadians(b.longitude - a.longitude);
  const firstLatitude = toRadians(a.latitude);
  const secondLatitude = toRadians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function formatDistance(meters?: number) {
  if (meters == null) return "—";
  if (meters < 1_000) return `${Math.round(meters)} m`;
  return `${(meters / 1_000).toFixed(1)} km`;
}

export function externalDirectionsUrl(origin: Coordinates | null, destination: Coordinates) {
  const base = "https://www.google.com/maps/dir/?api=1";
  const originQuery = origin ? `&origin=${origin.latitude},${origin.longitude}` : "";
  return `${base}${originQuery}&destination=${destination.latitude},${destination.longitude}&travelmode=walking`;
}
