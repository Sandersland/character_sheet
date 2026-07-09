import type { Response } from "express";
import type { z } from "zod";

// Parse a request body against a zod schema (#591): on failure it writes the
// standard 400 `{ error: "Invalid request body", details: <flatten> }` and
// returns undefined so the caller bails with `if (data === undefined) return;`.
export function parseBodyOr400<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  res: Response,
): z.infer<T> | undefined {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ error: "Invalid request body", details: result.error.flatten() });
    return undefined;
  }
  return result.data;
}
