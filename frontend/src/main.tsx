import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/App";
import "./index.css";

// troika text is configured inside the lazy dice chunk (see DiceScene) so it no
// longer pins the 3D vendor stack into the initial bundle (#432).

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
