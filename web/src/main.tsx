import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@fontsource/silkscreen/latin-400.css";
import "@fontsource/silkscreen/latin-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "./styles.css";
import { App } from "./App";
import { LiveProvider } from "./store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <LiveProvider>
        <App />
      </LiveProvider>
    </HashRouter>
  </StrictMode>,
);
