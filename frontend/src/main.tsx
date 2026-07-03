import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/App";
import { configureDiceText } from "@/lib/troikaTextConfig";
import "./index.css";

// Must run before anything renders a drei <Text> (see #408 / troikaTextConfig).
configureDiceText();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
