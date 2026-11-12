import type { z } from "zod";

import type { serializeCharacter } from "@/lib/character/character-serialize.js";

// Awaited<>, not a bare ReturnType: serializeCharacter is async (#1798).
type SerializedCharacter = Awaited<ReturnType<typeof serializeCharacter>>;

// One router owns this via makeTransactionsEndpoint, or ABILITY_REGISTRY stores many and the shared ability endpoint dispatches on a URL key (#1275).
// `apply`/`respond` are method shorthand, not arrow properties: TS checks method parameters bivariantly, letting heterogeneous <Schema, Result> pairs live in one erased Record<string, TransactionHandler> without a cast.
export interface TransactionHandler<Schema extends z.ZodTypeAny = z.ZodTypeAny, Result = unknown> {
  schema: Schema;
  // `userId` is the authenticated caller — needed by domains that mutate a second sheet under consent (e.g. party-target healing #462).
  apply(characterId: string, data: z.infer<Schema>, userId: string): Promise<Result>;
  respond?(character: SerializedCharacter, result: Result): unknown;
}
