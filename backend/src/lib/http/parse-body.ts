import type { Response } from "express";
import type { z } from "zod";

// On failure writes 400 { error: "Invalid request body", details } (#591) and returns undefined so the caller bails with `if (data === undefined) return;`.
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
