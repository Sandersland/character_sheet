import cors from "cors";
import express from "express";

import { activityRouter } from "./routes/activity.js";
import { advancementRouter } from "./routes/advancement.js";
import { classRouter } from "./routes/class.js";
import { charactersRouter } from "./routes/characters.js";
import { experienceRouter } from "./routes/experience.js";
import { featsRouter } from "./routes/feats.js";
import { healthRouter } from "./routes/health.js";
import { hitPointsRouter } from "./routes/hitpoints.js";
import { inventoryRouter } from "./routes/inventory.js";
import { itemsRouter } from "./routes/items.js";
import { maneuversRouter } from "./routes/maneuvers.js";
import { referenceRouter } from "./routes/reference.js";
import { resourcesRouter } from "./routes/resources.js";
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
  app.use("/api", resourcesRouter);
  app.use("/api", classRouter);
  app.use("/api", maneuversRouter);
  app.use("/api", featsRouter);
  app.use("/api", advancementRouter);

  return app;
}
