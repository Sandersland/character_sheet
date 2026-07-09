import type { Request, Response } from "express";

import { CombatError, SessionError, type RollKind, type RollMode } from "../../lib/sessions.js";

export interface RollInput {
  kind: RollKind;
  source: string;
  total: number;
  specLabel: string | undefined;
  damageType: string | undefined;
  faces: number[] | undefined;
  ability: string | undefined;
  skill: string | undefined;
  dc: number | undefined;
  rollMode: RollMode | undefined;
}

const VALID_KINDS: RollKind[] = ["attack", "damage", "check", "save", "initiative"];
const VALID_MODES: RollMode[] = ["normal", "advantage", "disadvantage"];

interface RollBody {
  kind?: unknown;
  source?: unknown;
  total?: unknown;
  specLabel?: unknown;
  damageType?: unknown;
  faces?: unknown;
  ability?: unknown;
  skill?: unknown;
  dc?: unknown;
  rollMode?: unknown;
}

// Field validators, checked in order; the first failure's error is the 400 body.
const ROLL_CHECKS: { ok: (b: RollBody) => boolean; error: string }[] = [
  {
    ok: (b) => typeof b.kind === "string" && VALID_KINDS.includes(b.kind as RollKind),
    error: `kind must be one of ${VALID_KINDS.join(", ")}`,
  },
  {
    ok: (b) => typeof b.source === "string" && b.source.trim() !== "",
    error: "source must be a non-empty string",
  },
  {
    ok: (b) => typeof b.total === "number" && Number.isFinite(b.total),
    error: "total must be a finite number",
  },
  { ok: (b) => areValidFaces(b.faces), error: "faces must be an array of positive integers" },
  {
    ok: (b) => b.dc === undefined || (typeof b.dc === "number" && Number.isFinite(b.dc)),
    error: "dc must be a finite number",
  },
  {
    ok: (b) => b.rollMode === undefined || VALID_MODES.includes(b.rollMode as RollMode),
    error: `rollMode must be one of ${VALID_MODES.join(", ")}`,
  },
];

// SessionError/CombatError message → HTTP status: 404 for not-found, else 409.
export function sessionErrorStatus(message: string): number {
  return message.includes("not found") ? 404 : 409;
}

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

// Validates a roll event body; sends the field-specific 400 and returns null on
// the first invalid field, otherwise the normalized RollInput.
export function parseRollInput(req: Request, res: Response): RollInput | null {
  const b = req.body as RollBody;
  const failed = ROLL_CHECKS.find((check) => !check.ok(b));
  if (failed) {
    res.status(400).json({ error: failed.error });
    return null;
  }
  return {
    kind: b.kind as RollKind,
    source: (b.source as string).trim(),
    total: b.total as number,
    specLabel: typeof b.specLabel === "string" ? b.specLabel : undefined,
    damageType: typeof b.damageType === "string" ? b.damageType : undefined,
    faces: b.faces as number[] | undefined,
    ability: typeof b.ability === "string" ? b.ability : undefined,
    skill: typeof b.skill === "string" ? b.skill : undefined,
    dc: typeof b.dc === "number" ? b.dc : undefined,
    rollMode: b.rollMode as RollMode | undefined,
  };
}

// Optional faces array must contain only positive integers when present.
function areValidFaces(faces: unknown): boolean {
  if (faces === undefined) return true;
  return (
    Array.isArray(faces) &&
    faces.every((f) => typeof f === "number" && Number.isInteger(f) && f > 0)
  );
}

// Wraps an async handler so SessionError/CombatError map to a status + { error };
// any other error re-throws to the terminal handler (express-async-errors).
export function withSessionErrors(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (err instanceof SessionError || err instanceof CombatError) {
        res.status(sessionErrorStatus(err.message)).json({ error: err.message });
        return;
      }
      throw err;
    }
  };
}
