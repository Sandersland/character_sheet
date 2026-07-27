/**
 * `ABILITY_REGISTRY` transaction-op schemas (backend/src/lib/classes/*.ts),
 * migrated one family at a time (#1370). Each op has exactly one declaration
 * here; the backend value-imports the schema and runs `.parse()`, and every
 * derived type is `z.infer` of that same schema — never a hand-written mirror.
 *
 * `warrior-of-elements` is deliberately excluded: its op types already live in
 * `packages/shared-types/src/class-resources.ts` (#1273), and its
 * `damageType` enum reads `ELEMENTAL_DAMAGE_TYPES`, a runtime const in
 * `backend/src/lib/classes/warrior-of-elements.ts` that this package may not
 * import (backend → contracts is one-directional). See the #1370 PR body /
 * follow-up issue for the shared-types/contracts overlap this leaves open.
 */
import { z } from "zod";

export const castChannelDivinityOpSchema = z.object({
  type: z.literal("castChannelDivinity"),
  abilityId: z.string().min(1),
});
export type CastChannelDivinityOperation = z.infer<typeof castChannelDivinityOpSchema>;
export type ChannelDivinityOperation = CastChannelDivinityOperation;
