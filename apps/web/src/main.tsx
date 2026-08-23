import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import {
  Component,
  StrictMode,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./styles.css";
import "./marketing-pages.css";

interface ApplicationErrorBoundaryState {
  failed: boolean;
}

export class ApplicationErrorBoundary extends Component<
  { children: ReactNode },
  ApplicationErrorBoundaryState
> {
  state: ApplicationErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ApplicationErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Porchcast recovered a browser rendering failure.", error, info);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-crash-fallback">
        <section className="app-crash-card" role="alert">
          <span>Your recording remains in the Cloud</span>
          <h1>The room display needs a refresh.</h1>
          <p>
            Porchcast preserved your room and recording state. Reload this page to reconnect
            the display and continue checking your downloads.
          </p>
          <button onClick={() => window.location.reload()} type="button">Reload Porchcast</button>
        </section>
      </main>
    );
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root application mount");

createRoot(root).render(
  <StrictMode>
    <ApplicationErrorBoundary>
      <App />
    </ApplicationErrorBoundary>
  </StrictMode>,
);
