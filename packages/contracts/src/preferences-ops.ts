/** `UserPreferences` applies this package's z.input policy — every `.default()`ed field becomes optional here, matching what a client may legitimately omit. */
/** The route's own `preferencesPatchSchema` stays backend-local and re-derives from undefaulted field schemas, because `.partial()` still runs a field's `.default()` when that field is missing from the input. */
import { z } from "zod";

export const themePreferenceSchema = z.enum(["light", "dark", "system"]);
export const diceRollStyleSchema = z.enum(["animated", "quick"]);

export const preferencesSchema = z.object({
  theme: themePreferenceSchema.default("system"),
  diceRollStyle: diceRollStyleSchema.default("animated"),
  autoRollConcentration: z.boolean().default(true),
});
export type UserPreferences = z.input<typeof preferencesSchema>;
