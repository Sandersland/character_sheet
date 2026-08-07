import { z } from "zod";

import { diceRollStyleSchema, preferencesSchema, themePreferenceSchema } from "@character-sheet/contracts";

// Account-synced player preferences (#1178) — the cs:pref:* family lifted off
// per-browser localStorage onto User.preferences (typed JSON, not scalar
// columns) so a new key never needs a migration. preferencesSchema itself
// (three `.default()`s) lives in @character-sheet/contracts (#1395) — this
// file owns only the read/write logic built on top of it.

// The fully-resolved shape (every field present) that a stored/hydrated
// value parses to — z.output, deliberately NOT the contracts package's
// UserPreferences (that name is package's z.input type: every field
// optional, for what a PATCH client may send). This file only ever produces
// or consumes the resolved shape.
export type ResolvedPreferences = z.output<typeof preferencesSchema>;

// Shared by both write-side schemas below — bare field schemas (no
// `.default()`) so an ABSENT key stays absent through `.partial()` rather than
// zod filling it in, which would turn a one-key patch into a full object and
// clobber the other stored keys on merge (caught by a red test: a two-write
// scenario where the second patch reset earlier keys to defaults).
const partialPreferencesShape = z
  .object({
    theme: themePreferenceSchema,
    diceRollStyle: diceRollStyleSchema,
    autoRollConcentration: z.boolean(),
  })
  .partial();

// The PATCH /api/preferences request body: `.strict()` so an unrecognized key
// is a 400 — unlike a stored value (see preferencesSchema above), a request is
// almost certainly a client bug.
export const preferencesPatchSchema = partialPreferencesShape.strict();

// Single source of truth for "no preference has ever been chosen" — derived
// from the schema's own per-field defaults rather than duplicated as a literal,
// so the two can't drift.
export const DEFAULT_PREFERENCES: ResolvedPreferences = preferencesSchema.parse({});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Tolerant read: a corrupt or partially-shaped stored value never throws,
// falling all the way back to DEFAULT_PREFERENCES on any validation failure
// (no partial-field recovery — simplicity over salvaging half a corrupt row).
function parseStoredPreferences(raw: unknown): ResolvedPreferences {
  const base = isPlainObject(raw) ? raw : {};
  const result = preferencesSchema.safeParse(base);
  return result.success ? result.data : DEFAULT_PREFERENCES;
}

// Write-side base parse: unlike parseStoredPreferences, keeps the result
// sparse (only keys actually present survive — never defaulted) so merging a
// patch onto a null/never-stored base still yields just the patch, not a full
// object. Non-strict, so unknown/hostile keys (a corrupt or tampered stored
// value) are stripped rather than re-persisted; a recognized key holding an
// invalid value fails the whole parse, falling back to an empty base — same
// everything-or-nothing contract as parseStoredPreferences.
function parseStoredPreferencesBase(raw: unknown): Partial<ResolvedPreferences> {
  const base = isPlainObject(raw) ? raw : {};
  const result = partialPreferencesShape.safeParse(base);
  return result.success ? result.data : {};
}

// The GET /auth/me read path. `null` is preserved (not defaulted) so the
// frontend can distinguish "this account has never stored preferences"
// (migrate local values up) from "a value is stored" (server wins) — see
// mergePreferencesPatch below for the write-side half of that contract.
export function resolvePreferences(raw: unknown): ResolvedPreferences | null {
  if (raw == null) return null;
  return parseStoredPreferences(raw);
}

// The PATCH /api/preferences write path: merges a validated partial patch onto
// whatever is currently stored, so writing one key never clobbers the others.
export function mergePreferencesPatch(
  raw: unknown,
  patch: Partial<ResolvedPreferences>,
): Partial<ResolvedPreferences> {
  return { ...parseStoredPreferencesBase(raw), ...patch };
}
