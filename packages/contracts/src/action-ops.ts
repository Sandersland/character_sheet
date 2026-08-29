import { z } from "zod";

export const executeActionOpSchema = z.object({
  type: z.literal("executeAction"),
  actionKey: z.string().min(1),
  /** Client-supplied roll total. The server validates and records it; it does NOT re-roll. */
  roll: z.number().int().positive().optional(),
  inventoryItemId: z.string().optional(),
  /** Chosen spell-slot level for a `{costKind:"slot"}` ability; omitted defaults to the ability's own minimum level. */
  slotLevel: z.number().int().positive().optional(),
});
export type ExecuteActionOperation = z.infer<typeof executeActionOpSchema>;

export type ActionOperation = ExecuteActionOperation;
