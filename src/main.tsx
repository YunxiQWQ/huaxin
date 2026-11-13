import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Offline support: the service worker caches the program, templates and fonts (production builds only).
if (__BX_BUILT__ && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js?build=${__BUILD_ID__}`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch(() => undefined);
  });
}

// Development-only inspection hook used by the end-to-end checks.
if (!__BX_BUILT__) {
  import("./editor/store").then(
    (m) => ((window as any).__bx = { state: () => (m.hasState() ? m.getState() : null) }),
  );
}
