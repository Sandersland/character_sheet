import { createApp } from "./app.js";
import { logger } from "@/lib/logger.js";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;

const app = createApp();

app.listen(port, () => {
  logger.info({ port }, "Backend listening");
});
