import cors from "cors";
import express from "express";

import { charactersRouter } from "./routes/characters.js";
import { healthRouter } from "./routes/health.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api", healthRouter);
  app.use("/api", charactersRouter);

  return app;
}
