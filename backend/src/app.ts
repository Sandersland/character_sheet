import cors from "cors";
import express from "express";

import { activityRouter } from "./routes/activity.js";
import { charactersRouter } from "./routes/characters.js";
import { experienceRouter } from "./routes/experience.js";
import { healthRouter } from "./routes/health.js";
import { hitPointsRouter } from "./routes/hitpoints.js";
import { inventoryRouter } from "./routes/inventory.js";
import { itemsRouter } from "./routes/items.js";
import { referenceRouter } from "./routes/reference.js";
import { spellsRouter } from "./routes/spells.js";
import { spellcastingRouter } from "./routes/spellcasting.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.use("/api", healthRouter);
  app.use("/api", charactersRouter);
  app.use("/api", referenceRouter);
  app.use("/api", itemsRouter);
  app.use("/api", hitPointsRouter);
  app.use("/api", inventoryRouter);
  app.use("/api", experienceRouter);
  app.use("/api", activityRouter);
  app.use("/api", spellsRouter);
  app.use("/api", spellcastingRouter);

  return app;
}
