import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const root = document.querySelector<HTMLElement>("#app");
if (root === null) throw new Error("Missing #app element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
