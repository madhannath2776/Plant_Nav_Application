import { ArrowLeft, ArrowRight, Camera, Check, Crosshair, ImagePlus, MapPin, Navigation, RefreshCw, Send, Sprout, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import treeNavigatorLogo from "../assets/tree-navigator-logo.png";
import LocationPicker from "../components/LocationPicker";
import { Button } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import useGeolocation from "../hooks/useGeolocation";
import { compressImage } from "../lib/api";
import { XP_PER_APPROVAL } from "../lib/levels";
import { supabase } from "../lib/supabase";
import type { Coordinates } from "../types";

type SelectedLocation = Coordinates & { source: "GPS" | "map" };
type SubmitState = "idle" | "uploading" | "submitting" | "success";

const STEPS = ["Photo", "Name", "Location", "Landmark", "Submit"] as const;

export default function AddPlant() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const gps = useGeolocation();
  const [step, setStep] = useState(1);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [name, setName] = useState("");
  const [landmark, setLandmark] = useState("");
  const [location, setLocation] = useState<SelectedLocation | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [mapLocation, setMapLocation] = useState<Coordinates | null>(null);
  const [error, setError] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const autoLocated = useRef(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (gps.location && gps.status === "success") setLocation({ ...gps.location, source: "GPS" });
  }, [gps.location, gps.status]);

  // Entering the location step: detect GPS automatically (once).
  useEffect(() => {
    if (step === 3 && !location && !autoLocated.current) {
      autoLocated.current = true;
      gps.locate();
    }
  }, [step, location, gps]);

  function chooseImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) {
      setError("Use a JPG, PNG or WebP photo under 15 MB");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setImage(file); setPreview(URL.createObjectURL(file)); setError("");
  }

  async function submit() {
    if (!supabase || !user || !image || !location) { setError("Something went wrong"); return; }
    setSubmitState("uploading"); setError("");
    const file = await compressImage(image);
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
    const upload = await supabase.storage.from("plant-images").upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (upload.error) { setError("Photo upload failed"); setSubmitState("idle"); return; }
    const { data: publicImage } = supabase.storage.from("plant-images").getPublicUrl(path);
    setSubmitState("submitting");
    // Goes to plant_submissions as PENDING. It becomes public only after an admin approves it.
    const insert = await supabase.from("plant_submissions").insert({
      user_id: user.id, plant_name: name.trim(), image_url: publicImage.publicUrl,
      latitude: location.latitude, longitude: location.longitude,
      location_source: location.source === "GPS" ? "gps" : "map",
      gps_accuracy: location.source === "GPS" ? location.accuracy ?? null : null,
      landmark: landmark.trim() || null, status: "pending",
    });
    if (insert.error) {
      void supabase.storage.from("plant-images").remove([path]);
      setError("Submission failed. Try again"); setSubmitState("idle"); return;
    }
    setSubmitState("success");
  }

  function reset() {
    setStep(1); setImage(null); setPreview(""); setName(""); setLandmark(""); setLocation(null);
    setMapLocation(null); setError(""); setSubmitState("idle"); autoLocated.current = false;
  }

  if (submitState === "success") return (
    <div className="add-success">
      <div className="submit-mark">
        <span className="submit-ring" aria-hidden="true" />
        <img src={treeNavigatorLogo} alt="" />
        <span className="success-check"><Check size={30} strokeWidth={3} /></span>
      </div>
      <h1>Submission complete</h1>
      <span className="pending-pill">Pending verification</span>
      <div className="pending-reward"><strong className="num">{XP_PER_APPROVAL} XP</strong><span>after approval</span></div>
      <div className="success-actions">
        <button className="button button-primary" onClick={() => navigate("/contributions")}>My plants</button>
        <button className="button button-ghost" onClick={reset}>Add another</button>
      </div>
    </div>
  );

  if (showPicker) return (
    <div className="picker-screen">
      <header><button onClick={() => setShowPicker(false)} aria-label="Close map"><X size={22} /></button><strong>Select location</strong><span /></header>
      <LocationPicker value={mapLocation} near={gps.location} onChange={setMapLocation} onConfirm={() => {
        if (!mapLocation) return;
        setLocation({ ...mapLocation, source: "map" }); setShowPicker(false);
      }} />
    </div>
  );

  const busy = submitState !== "idle";
  const canContinue = step === 1 ? Boolean(image) : step === 2 ? Boolean(name.trim()) : step === 3 ? Boolean(location) : true;
  const progress = busy ? (submitState === "uploading" ? 82 : 96) : step * 20;
  return (
    <div className="add-screen">
      <header className="add-header"><button disabled={busy} onClick={() => step === 1 ? navigate(-1) : setStep(step - 1)} aria-label="Back"><ArrowLeft size={22} /></button><strong>{STEPS[step - 1]}</strong><span className="num">{step}/5</span></header>
      <div className="add-progress"><i style={{ width: `${progress}%` }} /></div>
      <div className="add-content">
        {step === 1 && <section className="add-step"><div className="step-title"><span><Camera size={22} /></span><div><h1>Photo</h1></div></div>
          {preview ? <div className="photo-preview"><img src={preview} alt="Plant preview" /><button onClick={() => { setImage(null); setPreview(""); }}><Trash2 size={17} /> Remove</button></div>
            : <label className="camera-card"><span><ImagePlus size={34} /></span><strong>Take photo</strong><small>Clear and well lit</small><span className="button button-primary">Camera or gallery</span><input hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => chooseImage(event.target.files?.[0])} /></label>}
        </section>}
        {step === 2 && <section className="add-step"><div className="step-title"><span><Sprout size={22} /></span><div><h1>Plant name</h1></div></div>
          <label className="app-field"><input autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="Neem, Coconut, Banyan…" aria-label="Plant name" /></label>
        </section>}
        {step === 3 && <section className="add-step"><div className="step-title"><span><MapPin size={22} /></span><div><h1>Location</h1></div></div>
          {location ? <div className="location-found"><span><Check size={24} /></span><div><strong>Location found</strong><small className="num">{location.source === "GPS" ? `${Math.round(location.accuracy ?? 0)} m accuracy` : "Selected on map"}</small></div><button onClick={() => { setLocation(null); gps.locate(); }}>Retry</button></div>
            : <div className="location-choice">
              <button className="gps-button" onClick={gps.locate} disabled={gps.status === "locating"}><span className={gps.status === "locating" ? "gps-pulse" : ""}><Crosshair size={25} /></span><strong>{gps.status === "locating" ? "Locating…" : "Use current location"}</strong></button>
              <button className="map-pick-button" onClick={() => setShowPicker(true)}><MapPin size={20} /><span>Select on map</span><ArrowRight size={18} /></button>
              {gps.status === "error" && <div className="location-error"><span>GPS unavailable</span><button onClick={gps.locate}><RefreshCw size={15} /> Try again</button></div>}
            </div>}
          {location?.source === "GPS" && (location.accuracy ?? 0) > 50 && <button className="map-pick-button" onClick={() => setShowPicker(true)}><MapPin size={20} /><span>Fine-tune on map</span><ArrowRight size={18} /></button>}
        </section>}
        {step === 4 && <section className="add-step"><div className="step-title"><span><Navigation size={22} /></span><div><h1>Landmark</h1></div></div>
          <label className="app-field"><input autoFocus maxLength={160} value={landmark} onChange={(event) => setLandmark(event.target.value)} placeholder="Near the library" aria-label="Landmark" /></label>
        </section>}
        {step === 5 && <section className="add-step"><div className="step-title"><span><Send size={22} /></span><div><h1>Submit</h1></div></div>
          <div className="review-card"><img src={preview} alt="" /><div><strong>{name}</strong><span><MapPin size={15} /> {landmark || "No landmark"}</span><span className="num"><Navigation size={15} /> {location?.source === "GPS" ? `GPS · ${Math.round(location.accuracy ?? 0)} m` : "Map pin"}</span></div></div>
          {busy && <div className="submit-progress" role="status" aria-label="Submitting"><i style={{ width: `${progress}%` }} /></div>}
        </section>}
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>
      <footer className="add-footer">
        <Button className="add-submit" loading={busy} disabled={!canContinue} onClick={() => step < 5 ? setStep(step + 1) : submit()}>
          {busy ? (submitState === "uploading" ? "Uploading…" : "Submitting…") : step === 5 ? "Submit" : step === 4 && !landmark.trim() ? "Skip" : "Continue"}
          {!busy && (step === 5 ? <Send size={18} /> : <ArrowRight size={18} />)}
        </Button>
      </footer>
    </div>
  );
}
