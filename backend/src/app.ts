import cors from "cors";
import express from "express";

import { actionsRouter } from "./routes/actions.js";
import { activityRouter } from "./routes/activity.js";
import { advancementRouter } from "./routes/advancement.js";
import { classRouter } from "./routes/class.js";
import { charactersRouter } from "./routes/characters.js";
import { conditionsRouter } from "./routes/conditions.js";
import { sessionsRouter } from "./routes/sessions.js";
import { experienceRouter } from "./routes/experience.js";
import { featsRouter } from "./routes/feats.js";
import { healthRouter } from "./routes/health.js";
import { hitPointsRouter } from "./routes/hitpoints.js";
import { inventoryRouter } from "./routes/inventory.js";
import { itemsRouter } from "./routes/items.js";
import { journalRouter } from "./routes/journal.js";
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
  app.use("/api", conditionsRouter);
  app.use("/api", classRouter);
  app.use("/api", maneuversRouter);
  app.use("/api", featsRouter);
  app.use("/api", advancementRouter);
  app.use("/api", sessionsRouter);
  app.use("/api", actionsRouter);
  app.use("/api", journalRouter);

  // Unknown /api/* paths 404 as JSON (matching every route's { error } shape),
  // rather than falling through to Express's default HTML 404 page.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
