/**
 * Standalone-roll op (#1861) — the `logRoll` arm of the resolve-action resolver's op union. A
 * player-driven ability check/saving throw/initiative roll, or the tally-resolve inline damage roll,
 * commits here as a real batched, trivially-undoable audit event (a standalone roll is itself the next
 * undoable batch in the LIFO chain, so it never blocks a real batch's undo).
 *
 * The persisted event matches what the retired logRollEvent wrote: category "roll", type
 * ROLL_EVENT_TYPES[kind], the same RollEventData-shaped `data`, before/after null (a roll mutates no
 * character state). The session-log feed dispatches on event TYPE, so its rendering is untouched —
 * only the write path (batched + resolver-owned batchId) changed.
 */
import { z } from "zod";

import { logEvent, type EventType } from "@/lib/activity/events.js";
import { Prisma } from "@/generated/prisma/client.js";
import { attackComponentsSchema, damageComponentsSchema } from "@/lib/session/roll-components.js";
import type { RollEventKind } from "@character-sheet/shared-types";

const ROLL_EVENT_TYPES: Record<RollEventKind, EventType> = {
  attack: "attackRoll",
  damage: "damageRoll",
  check: "checkRoll",
  save: "saveRoll",
  initiative: "initiativeRoll",
};

// `.strict()` rejects unknown keys — these persist verbatim into a durable
// event log, so an attacker-supplied extra key must 400, not ride along
// (mirrors roll-components' own rationale).
const modeSourceSchema = z
  .object({
    mode: z.enum(["advantage", "disadvantage", "flat"]),
    kind: z.enum(["attack", "check", "save", "initiative"]),
    ability: z.string().optional(),
    modifier: z.number().finite().optional(),
    source: z.string().max(200),
  })
  .strict();

const positiveFaces = z.array(z.number().int().positive());

export const standaloneRollOperationSchema = z.object({
  type: z.literal("logRoll"),
  kind: z.enum(["attack", "damage", "check", "save", "initiative"]),
  // Written verbatim into the durable log (as the summary AND `data.source`) —
  // bounded like modeSource.source below to keep a caller from inflating it.
  source: z.string().trim().min(1).max(200),
  total: z.number().finite(),
  specLabel: z.string().optional(),
  damageType: z.string().optional(),
  faces: positiveFaces.optional(),
  droppedFaces: positiveFaces.optional(),
  ability: z.string().optional(),
  skill: z.string().optional(),
  dc: z.number().finite().optional(),
  rollMode: z.enum(["normal", "advantage", "disadvantage"]).optional(),
  // Client-generated (crypto.randomUUID, ~36 chars); 100 bounds the log.
  swingId: z.string().trim().min(1).max(100).optional(),
  verdict: z.enum(["hit", "miss", "crit"]).optional(),
  nat20: z.boolean().optional(),
  nat1: z.boolean().optional(),
  crit: z.boolean().optional(),
  modeSources: z.array(modeSourceSchema).max(20).optional(),
  attackComponents: attackComponentsSchema.optional(),
  damageComponents: damageComponentsSchema.optional(),
  // target/outcome are RESERVED on RollEventData and never accepted (self-or-announce, no enemy/target model).
});

export type StandaloneRollOperation = z.infer<typeof standaloneRollOperationSchema>;

function buildRollSummary(op: StandaloneRollOperation): string {
  const { kind, source, total, specLabel, damageType, dc } = op;
  if (kind === "damage") {
    return `${source}: ${total}${damageType ? ` ${damageType}` : ""}${specLabel ? ` (${specLabel})` : ""}`;
  }
  const dcSuffix = dc !== undefined ? ` vs DC ${dc}` : "";
  return `${source}: ${total}${dcSuffix}${specLabel ? ` (${specLabel})` : ""}`;
}

// Optional wire field -> persisted JSON value: undefined becomes null (a JSON
// column can't hold undefined), so every unset field stores as an explicit
// null rather than an omitted key.
function nullish<T>(value: T | undefined): T | null {
  return value ?? null;
}

/**
 * Writes ONE standalone roll as a roll-category CharacterEvent inside the
 * caller's transaction, tagged with the resolver's batchId/sessionId. Pure log
 * entry: before/after null, so its LIFO revert restores nothing and only marks
 * the batch reverted.
 */
export async function writeStandaloneRollEvent(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  op: StandaloneRollOperation,
): Promise<void> {
  await logEvent(tx, {
    characterId,
    category: "roll",
    type: ROLL_EVENT_TYPES[op.kind],
    summary: buildRollSummary(op),
    before: null,
    after: null,
    data: {
      kind: op.kind,
      source: op.source,
      total: op.total,
      specLabel: nullish(op.specLabel),
      damageType: nullish(op.damageType),
      faces: nullish(op.faces),
      droppedFaces: nullish(op.droppedFaces),
      ability: nullish(op.ability),
      skill: nullish(op.skill),
      dc: nullish(op.dc),
      rollMode: nullish(op.rollMode),
      swingId: nullish(op.swingId),
      verdict: nullish(op.verdict),
      nat20: nullish(op.nat20),
      nat1: nullish(op.nat1),
      crit: nullish(op.crit),
      modeSources: nullish(op.modeSources),
      attackComponents: nullish(op.attackComponents),
      damageComponents: nullish(op.damageComponents),
    },
    batchId,
    sessionId,
  });
}
