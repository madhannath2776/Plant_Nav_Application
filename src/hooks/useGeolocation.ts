import { useCallback, useState } from "react";
import type { Coordinates } from "../types";

export type LocationState = "idle" | "locating" | "success" | "error";

export default function useGeolocation() {
  const [location, setLocation] = useState<Coordinates | null>(null);
  const [status, setStatus] = useState<LocationState>("idle");
  const [error, setError] = useState("");

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Location unavailable");
      setStatus("error");
      return;
    }
    setStatus("locating");
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy });
        setStatus("success");
      },
      (failure) => {
        setError(failure.code === 1 ? "Location permission denied" : "Location unavailable");
        setStatus("error");
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, []);

  return { location, status, error, locate };
}
