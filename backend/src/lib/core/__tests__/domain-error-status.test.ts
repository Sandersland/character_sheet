/**
 * Pins the intentional HTTP `status` each domain error carries (#1007). The
 * central `errorHandler` maps `err.status` to the response code, so these values
 * ARE the route contract — no route-local try/catch or message-string sniffing
 * derives them any more. Pure: no DB.
 */
import { describe, expect, it } from "vitest";

import { InvalidHitPointOperationError } from "@/lib/combat/hp-core.js";
import { InvalidResourceOperationError } from "@/lib/classes/resources.js";
import {
  AttunementLimitError,
  InsufficientCurrencyError,
  InvalidInventoryOperationError,
} from "@/lib/inventory/inventory-currency.js";
import { InvalidSpellcastingOperationError } from "@/lib/spellcasting/ability-cost.js";
import { UnknownActionError } from "@/lib/classes/actions.js";
import { CombatError, SessionError } from "@/lib/session/sessions.js";

describe("domain errors carry an explicit HTTP status", () => {
  it("action-op domain errors default to 400 (client validation)", () => {
    expect(new InvalidHitPointOperationError("x").status).toBe(400);
    expect(new InvalidResourceOperationError("x").status).toBe(400);
    expect(new InvalidInventoryOperationError("x").status).toBe(400);
    expect(new InsufficientCurrencyError("x").status).toBe(400);
    expect(new InvalidSpellcastingOperationError("x").status).toBe(400);
    expect(new UnknownActionError("x").status).toBe(400);
  });

  it("attunement-cap breach keeps its distinct 409 (subclass override)", () => {
    expect(new AttunementLimitError("x").status).toBe(409);
    expect(new AttunementLimitError("x")).toBeInstanceOf(InvalidInventoryOperationError);
  });

  it("session/combat errors default to 409 (conflict) and take 404 for not-found", () => {
    expect(new SessionError("already active").status).toBe(409);
    expect(new CombatError("not a participant").status).toBe(409);
    expect(new SessionError("Session not found: abc", 404).status).toBe(404);
    expect(new CombatError("Session not found: abc", 404).status).toBe(404);
  });
});
