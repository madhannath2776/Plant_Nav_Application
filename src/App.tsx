import { useCallback, useEffect, useState } from "react";
import { RouterProvider } from "react-router";
import { router } from "./app/routes";
import treeNavigatorLogo from "./assets/tree-navigator-logo.png";
import { useAuth } from "./contexts/AuthContext";

export default function App() {
  const { loading } = useAuth();
  const [minimumComplete, setMinimumComplete] = useState(false);
  const [splashVisible, setSplashVisible] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);

  const dismissSplash = useCallback(() => {
    setSplashLeaving(true);
    window.setTimeout(() => setSplashVisible(false), 380);
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const minimumTimer = window.setTimeout(() => setMinimumComplete(true), reducedMotion ? 150 : 1150);
    const maximumTimer = window.setTimeout(dismissSplash, 2400);
    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(maximumTimer);
    };
  }, [dismissSplash]);

  useEffect(() => {
    if (minimumComplete && !loading) dismissSplash();
  }, [dismissSplash, loading, minimumComplete]);

  return (
    <>
      <RouterProvider router={router} />
      {splashVisible && (
        <div className={`startup-splash ${splashLeaving ? "leaving" : ""}`} role="status" aria-label="Tree Navigator">
          <span className="splash-glow" aria-hidden="true" />
          <img src={treeNavigatorLogo} alt="" />
        </div>
      )}
    </>
  );
}
