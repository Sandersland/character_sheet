import type { Request, Response } from "express";
import { z } from "zod";

import type { RollKind, RollMode } from "@/lib/session/sessions.js";
import type {
  RollEventAttackComponents,
  RollEventDamageComponents,
  RollEventModeSource,
  RollEventVerdict,
} from "@character-sheet/shared-types";

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
  // #1235 combat-log decomposition — see RollEventData for the field-by-field
  // rationale. `target`/`outcome` are deliberately ABSENT from this interface
  // (and from parseRollInput's return below): no producer populates them, and
  // the engine has no enemy/target model to populate them from (self-or-announce).
  swingId: string | undefined;
  verdict: RollEventVerdict | undefined;
  nat20: boolean | undefined;
  nat1: boolean | undefined;
  crit: boolean | undefined;
  modeSources: RollEventModeSource[] | undefined;
  attackComponents: RollEventAttackComponents | undefined;
  damageComponents: RollEventDamageComponents | undefined;
}

const VALID_KINDS: RollKind[] = ["attack", "damage", "check", "save", "initiative"];
const VALID_MODES: RollMode[] = ["normal", "advantage", "disadvantage"];
const VALID_VERDICTS: RollEventVerdict[] = ["hit", "miss", "crit"];

// Nested #1235 objects validated via zod (permitted for new nested fields only —
// see CLAUDE.md/#1235: the existing flat-field ROLL_CHECKS style stays hand-rolled).
// `.strict()` rejects unknown keys — these persist verbatim into a durable,
// write-once, non-undoable event log, so an attacker-supplied extra key (or
// script payload) must 400, not ride along. `source`'s .max(200) bounds the
// free-text "why" label (e.g. "Poisoned", "Bless") well above any real one.
const modeSourceSchema = z
  .object({
    mode: z.enum(["advantage", "disadvantage", "flat"]),
    kind: z.enum(["attack", "check", "save", "initiative"]),
    ability: z.string().optional(),
    modifier: z.number().finite().optional(),
    source: z.string().max(200),
  })
  .strict();

// A swing rarely stacks more than a couple of advantage/disadvantage/flat
// sources; 20 is generous headroom while still bounding event-log size.
const modeSourcesSchema = z.array(modeSourceSchema).max(20);

const attackComponentsSchema = z
  .object({
    abilityMod: z.number().finite(),
    proficiencyBonus: z.number().finite(),
    rangedBonus: z.number().finite(),
    attackRollBonus: z.number().finite(),
  })
  .strict();

const damageComponentsSchema = z
  .object({
    abilityMod: z.number().finite(),
    meleeDamageBonus: z.number().finite(),
  })
  .strict();

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
  swingId?: unknown;
  verdict?: unknown;
  nat20?: unknown;
  nat1?: unknown;
  crit?: unknown;
  modeSources?: unknown;
  attackComponents?: unknown;
  damageComponents?: unknown;
  // target/outcome intentionally untyped here too — see RollInput's comment.
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
  {
    // Client-generated (crypto.randomUUID, ~36 chars) — 100 is generous
    // headroom while still bounding what an attacker can stuff into the log.
    ok: (b) =>
      b.swingId === undefined ||
      (typeof b.swingId === "string" && b.swingId.trim() !== "" && b.swingId.length <= 100),
    error: "swingId must be a non-empty string of at most 100 characters",
  },
  {
    ok: (b) => b.verdict === undefined || VALID_VERDICTS.includes(b.verdict as RollEventVerdict),
    error: `verdict must be one of ${VALID_VERDICTS.join(", ")}`,
  },
  { ok: (b) => b.nat20 === undefined || typeof b.nat20 === "boolean", error: "nat20 must be a boolean" },
  { ok: (b) => b.nat1 === undefined || typeof b.nat1 === "boolean", error: "nat1 must be a boolean" },
  { ok: (b) => b.crit === undefined || typeof b.crit === "boolean", error: "crit must be a boolean" },
  {
    ok: (b) => b.modeSources === undefined || modeSourcesSchema.safeParse(b.modeSources).success,
    error: "modeSources must be an array of at most 20 valid roll-mode source objects",
  },
  {
    ok: (b) => b.attackComponents === undefined || attackComponentsSchema.safeParse(b.attackComponents).success,
    error: "attackComponents must be a valid decomposed-attack object",
  },
  {
    ok: (b) => b.damageComponents === undefined || damageComponentsSchema.safeParse(b.damageComponents).success,
    error: "damageComponents must be a valid decomposed-damage object",
  },
];

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
    swingId: typeof b.swingId === "string" ? b.swingId : undefined,
    verdict: b.verdict as RollEventVerdict | undefined,
    nat20: typeof b.nat20 === "boolean" ? b.nat20 : undefined,
    nat1: typeof b.nat1 === "boolean" ? b.nat1 : undefined,
    crit: typeof b.crit === "boolean" ? b.crit : undefined,
    // Persist the SAFEPARSE'd values, never the raw body — ROLL_CHECKS already
    // proved these parse (we're past the `failed` check above), so `.data` is
    // defined; this is what actually strips unknown/oversized keys before
    // they reach the durable event log, not just the boolean gate.
    modeSources: b.modeSources === undefined ? undefined : modeSourcesSchema.safeParse(b.modeSources).data,
    attackComponents:
      b.attackComponents === undefined ? undefined : attackComponentsSchema.safeParse(b.attackComponents).data,
    damageComponents:
      b.damageComponents === undefined ? undefined : damageComponentsSchema.safeParse(b.damageComponents).data,
    // target/outcome: never read from `b` — see RollInput's comment (#1235).
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
