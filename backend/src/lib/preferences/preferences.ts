import { z } from "zod";

// Account-synced player preferences (#1178) — the cs:pref:* family (theme,
// dice-roll style, auto-roll concentration) lifted off per-browser
// localStorage onto User.preferences (typed JSON, not scalar columns) so a
// new key never needs a migration. Kept in sync with each preference's own
// module (hooks/useThemePreference.ts, hooks/useDiceRollStyle.ts,
// features/hitpoints/concentrationPreference.ts) on the frontend.
export const themePreferenceSchema = z.enum(["light", "dark", "system"]);
export const diceRollStyleSchema = z.enum(["animated", "quick"]);

// Read-side schema: NOT .strict() — an unknown key (a stale field from a
// removed preference, or a corrupt write) is silently stripped rather than
// failing the whole read, per the "never throw on read" requirement. Each
// field's own default fills gaps left by a partial stored object.
export const preferencesSchema = z.object({
  theme: themePreferenceSchema.default("system"),
  diceRollStyle: diceRollStyleSchema.default("animated"),
  autoRollConcentration: z.boolean().default(true),
});

export type UserPreferences = z.infer<typeof preferencesSchema>;

// Write-side schema: deliberately built from the bare field schemas rather
// than `preferencesSchema.partial()` — zod's `.optional()` wrapped around a
// field that already has `.default(...)` still fills the default in for an
// ABSENT key, which would turn a true one-key patch into a full object and
// clobber the other stored keys on merge (caught by a red test: a two-write
// scenario where the second patch reset earlier keys to defaults). `.strict()`
// so an unrecognized key in a REQUEST is a 400 — unlike a stored value (see
// preferencesSchema above), since here it's almost certainly a client bug.
export const preferencesPatchSchema = z
  .object({
    theme: themePreferenceSchema,
    diceRollStyle: diceRollStyleSchema,
    autoRollConcentration: z.boolean(),
  })
  .partial()
  .strict();

// Single source of truth for "no preference has ever been chosen" — derived
// from the schema's own per-field defaults rather than duplicated as a literal,
// so the two can't drift.
export const DEFAULT_PREFERENCES: UserPreferences = preferencesSchema.parse({});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Tolerant read: a corrupt or partially-shaped stored value never throws,
// falling all the way back to DEFAULT_PREFERENCES on any validation failure
// (no partial-field recovery — simplicity over salvaging half a corrupt row).
function parseStoredPreferences(raw: unknown): UserPreferences {
  const base = isPlainObject(raw) ? raw : {};
  const result = preferencesSchema.safeParse(base);
  return result.success ? result.data : DEFAULT_PREFERENCES;
}

// The GET /auth/me read path. `null` is preserved (not defaulted) so the
// frontend can distinguish "this account has never stored preferences"
// (migrate local values up) from "a value is stored" (server wins) — see
// mergePreferencesPatch below for the write-side half of that contract.
export function resolvePreferences(raw: unknown): UserPreferences | null {
  if (raw == null) return null;
  return parseStoredPreferences(raw);
}

// The PATCH /api/preferences write path: merges a validated partial patch
// onto whatever is currently stored, so writing one key never clobbers the
// others. A null/corrupt existing value is treated as an empty base (not
// propagated) — there is nothing legitimate to preserve from it.
export function mergePreferencesPatch(
  raw: unknown,
  patch: Partial<UserPreferences>,
): Record<string, unknown> {
  const base = isPlainObject(raw) ? raw : {};
  return { ...base, ...patch };
}
