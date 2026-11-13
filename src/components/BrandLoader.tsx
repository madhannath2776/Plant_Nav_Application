import treeNavigatorLogo from "../assets/tree-navigator-logo.png";

/** Logo-only loading identity: logo + small animated ring. No text. */
export default function BrandLoader({ fullscreen = false }: { fullscreen?: boolean }) {
  return (
    <div className={`brand-loader${fullscreen ? " fullscreen" : ""}`} role="status" aria-label="Loading">
      <div className="brand-loader-mark">
        <svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="37" /></svg>
        <img src={treeNavigatorLogo} alt="" />
      </div>
    </div>
  );
}
