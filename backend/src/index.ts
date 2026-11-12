import { createApp } from "./app.js";
import { config } from "@/lib/core/config.js";
import { logger } from "@/lib/core/logger.js";

const app = createApp();

app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "Backend listening");
});
