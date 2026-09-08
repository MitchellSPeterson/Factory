import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { BrowserRouter } from "react-router-dom";
import { ServerProvider } from "./servers/connection";
import { GitHubProvider } from "./github/connection";
import { App } from "./App";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <BrowserRouter>
        <ServerProvider><GitHubProvider><App /></GitHubProvider></ServerProvider>
      </BrowserRouter>
    </ConvexProvider>
  </StrictMode>,
);
