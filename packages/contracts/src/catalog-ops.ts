/**
 * Catalog entitlement route schemas (#1796, epic #1795 1/6) — locked here so
 * Waves 4-6 (grant/fork routes) build against one request shape instead of
 * each inventing its own. The routes themselves are NOT built in this slice;
 * only the contract is.
 *
 * ```
 * POST   /api/catalog/entries/:entryId/grants        { campaignId }
 * DELETE /api/catalog/entries/:entryId/grants/:campaignId
 * POST   /api/catalog/entries/:entryId/fork          { scope, campaignId? }
 * ```
 *
 * z.input policy (index.ts, #1395): both schemas are `.refine()`-only, so
 * input === output — no `.default()`/`.transform()`/`.coerce` divergence to
 * account for.
 */
import { z } from "zod";

export const catalogGrantSchema = z
  .object({
    campaignId: z.string().min(1),
  })
  .strict();
export type CatalogGrantInput = z.input<typeof catalogGrantSchema>;

// `campaignId` is required exactly when scope is CAMPAIGN (forking into a
// campaign's own homebrew) and forbidden when scope is USER (forking into
// the caller's personal homebrew) — a structural pairing the route's fork
// target must always satisfy, not a 5e-rule concern, so it belongs in the
// schema rather than deferred to a lib validator (contrast spell-ops.ts's
// customSpellSchema, which deliberately leaves cross-field 5e coherence to
// custom-spell-validation.ts).
export const catalogForkSchema = z
  .object({
    scope: z.enum(["USER", "CAMPAIGN"]),
    campaignId: z.string().min(1).optional(),
  })
  .strict()
  .refine((v) => (v.scope === "CAMPAIGN") === (v.campaignId !== undefined), {
    message: "campaignId is required when scope is CAMPAIGN, and forbidden when scope is USER",
    path: ["campaignId"],
  });
export type CatalogForkInput = z.input<typeof catalogForkSchema>;
