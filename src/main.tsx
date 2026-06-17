import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

// Global styles — order matters: tokens define the vars everything else reads.
import "./styles/tokens.css";
import "./styles/reset.css";
import "./styles/theme.css";
import "./styles/animations.css";

import { AuthProvider } from "./auth/AuthContext";
import App from "./App";
import { installTooltipPositioner } from "./lib/tooltips";

// Keep edge-hugging tooltips on-screen (CSS pseudo-tooltips can't self-flip).
installTooltipPositioner();

// The app is served under Vite's base path (/DMTools/ on GitHub Pages, / locally).
// React Router must know it, or every navigation (RequireAuth -> /login, the catch-all
// -> /vault) resolves against the site root and escapes the base. Strip the trailing
// slash BASE_URL carries; fall back to "/" locally (RR rejects an empty basename).
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={routerBasename}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
