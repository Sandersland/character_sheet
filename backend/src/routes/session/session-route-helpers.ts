import type { Request, Response } from "express";

// Validates a required characterId in the body; sends 400 and returns null when
// missing/blank, otherwise returns the raw id.
export function requireCharacterId(req: Request, res: Response): string | null {
  const { characterId } = req.body as { characterId?: string };
  if (typeof characterId !== "string" || characterId.trim() === "") {
    res.status(400).json({ error: "characterId is required" });
    return null;
  }
  return characterId;
}
