// Shared scaffold behind every POST …/transactions endpoint: assert edit access, zod-validate the body (400), apply ops (DomainError → its status, else rethrow), then re-fetch and return serializeCharacter.
import type { Request, Response, Router } from "express";
import type { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { DomainError } from "@/lib/core/errors.js";
import { prisma } from "@/lib/core/prisma.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import type { TransactionHandler } from "@/lib/character/transaction-handler.js";

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
  const { schema, apply, respond } = handler;

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
    if (error instanceof DomainError) {
      res.status(error.status).json({ error: error.message });
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
