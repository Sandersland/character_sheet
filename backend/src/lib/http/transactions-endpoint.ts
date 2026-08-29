// Shared scaffold behind every POST …/transactions endpoint: assert edit access, zod-validate the body (400), apply ops (domain-error → 400, else rethrow), then re-fetch and return serializeCharacter.
import type { Request, Response, Router } from "express";
import type { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { prisma } from "@/lib/core/prisma.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

type DomainErrorClass = new (...args: never[]) => Error;
// Awaited<>, not a bare ReturnType: serializeCharacter is async (#1798).
type SerializedCharacter = Awaited<ReturnType<typeof serializeCharacter>>;

// One router owns this via makeTransactionsEndpoint, or ABILITY_REGISTRY stores many and the shared ability endpoint dispatches on a URL key (#1275).
// `apply`/`respond` are method shorthand, not arrow properties: TS checks method parameters bivariantly, letting heterogeneous <Schema, Result> pairs live in one erased Record<string, TransactionHandler> without a cast.
export interface TransactionHandler<Schema extends z.ZodTypeAny = z.ZodTypeAny, Result = unknown> {
  schema: Schema;
  // `userId` is the authenticated caller — needed by domains that mutate a second sheet under consent (e.g. party-target healing #462).
  apply(characterId: string, data: z.infer<Schema>, userId: string): Promise<Result>;
  // Errors mapped to 400 { error: message }; anything else rethrows (→ 500).
  domainErrors: DomainErrorClass[];
  respond?(character: SerializedCharacter, result: Result): unknown;
}

interface TransactionsEndpointConfig<Schema extends z.ZodTypeAny, Result>
  extends TransactionHandler<Schema, Result> {
  router: Router;
  path?: string;
}

export async function runTransaction<Schema extends z.ZodTypeAny, Result>(
  handler: TransactionHandler<Schema, Result>,
  req: Request<{ id: string }>,
  res: Response,
): Promise<void> {
  const { schema, apply, domainErrors, respond } = handler;

  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  let result: Result;
  try {
    result = await apply(req.params.id, parseResult.data, req.user!.id);
  } catch (error) {
    if (domainErrors.some((ErrorClass) => error instanceof ErrorClass)) {
      // A domain error may carry an explicit status (e.g. attunement-cap breach → 409); defaults to 400 for plain validation failures.
      const status = typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 400;
      res.status(status).json({ error: (error as Error).message });
      return;
    }
    throw error;
  }

  const updated = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: characterInclude,
  });
  const character = await serializeCharacter(updated!);
  res.json(respond ? respond(character, result) : character);
}

export function makeTransactionsEndpoint<Schema extends z.ZodTypeAny, Result = void>(
  config: TransactionsEndpointConfig<Schema, Result>,
): void {
  const { router, path = "/transactions" } = config;

  router.post<{ id: string }>(path, (req, res) => runTransaction(config, req, res));
}
