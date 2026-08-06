/**
 * Preferences request schema for PATCH /api/preferences (#1395, epic #1369).
 * `preferencesSchema` is what `backend/src/lib/preferences/preferences.ts`
 * parses a stored/hydrated preferences value against; `UserPreferences` here
 * applies this package's z.input policy (see index.ts) to it — every
 * `.default()`ed field becomes optional, matching what a client may
 * legitimately omit rather than the server-defaulted shape it never needs to
 * construct.
 *
 * The route's actual PATCH validator (`preferencesPatchSchema`) stays
 * backend-local: it re-derives from bare, undefaulted field schemas so
 * `.partial()` leaves an absent key genuinely absent instead of default-
 * filling it (zod's `.partial()` still runs a field's own `.default()` when
 * that field is missing from the input) — a merge-safety detail this package
 * doesn't need to own, not a second wire shape.
 */
import { z } from "zod";

export const themePreferenceSchema = z.enum(["light", "dark", "system"]);
export const diceRollStyleSchema = z.enum(["animated", "quick"]);

export const preferencesSchema = z.object({
  theme: themePreferenceSchema.default("system"),
  diceRollStyle: diceRollStyleSchema.default("animated"),
  autoRollConcentration: z.boolean().default(true),
});
export type UserPreferences = z.input<typeof preferencesSchema>;
