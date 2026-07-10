// Shared scaffold behind every uniform POST …/transactions endpoint: assert edit
// access, zod-validate the body (400), apply ops (domain-error → 400, else
// rethrow), then re-fetch with characterInclude and return serializeCharacter.
// Per-domain code supplies its ops schema, apply closure, and error classes.
import type { Router } from "express";
import type { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { prisma } from "./prisma.js";
import { characterInclude } from "./character-include.js";
import { serializeCharacter } from "./character-serialize.js";

type DomainErrorClass = new (...args: never[]) => Error;
type SerializedCharacter = ReturnType<typeof serializeCharacter>;

interface TransactionsEndpointConfig<Schema extends z.ZodTypeAny, Result> {
  router: Router;
  schema: Schema;
  // Applies the parsed body atomically; the returned value is passed to respond.
  // `userId` is the authenticated caller — needed by domains that mutate a second
  // sheet under consent (e.g. party-target healing #462).
  apply: (characterId: string, data: z.infer<Schema>, userId: string) => Promise<Result>;
  // Errors mapped to 400 { error: message }; anything else rethrows (→ 500).
  domainErrors: DomainErrorClass[];
  // Route sub-path — defaults to "/transactions" (experience mounts on "/").
  path?: string;
  // Shapes the response; defaults to the serialized character itself.
  respond?: (character: SerializedCharacter, result: Result) => unknown;
}

export function makeTransactionsEndpoint<Schema extends z.ZodTypeAny, Result = void>(
  config: TransactionsEndpointConfig<Schema, Result>,
): void {
  const { router, schema, apply, domainErrors, path = "/transactions", respond } = config;

  router.post<{ id: string }>(path, async (req, res) => {
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
        // A domain error may carry an explicit HTTP status (e.g. attunement-cap
        // breach → 409); default to 400 for plain validation failures.
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
    const character = serializeCharacter(updated!);
    res.json(respond ? respond(character, result) : character);
  });
}
