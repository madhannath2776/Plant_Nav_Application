import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type State = { failed: boolean };

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Tree Navigator UI error", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fatal-state">
        <span className="fatal-icon"><AlertTriangle size={28} /></span>
        <h1>Something went wrong</h1>
        <button className="button button-primary" onClick={() => window.location.reload()}>
          <RotateCcw size={18} /> Try again
        </button>
      </main>
    );
  }
}
