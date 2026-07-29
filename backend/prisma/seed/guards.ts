import type { SeedEdition } from "./edition.js";

// Fail-fast guard shared by seed.ts — GrantedAbility.name is unique PER EDITION
// (#1415 widened the DB key to (name, edition)), so the source arrays must not
// collide on that pair before we upsert them. Keyed on the pair rather than the
// name alone because this guard runs before a single row is written: left
// name-only it would reject #1313's 2014/2024 fork the database now accepts.
// An omitted edition is the shared (NULL) row, and NULLS NOT DISTINCT admits
// only one of those per name — hence the `?? "shared"` key rather than a skip.
export function assertUniqueGrantedAbilityNames(abilities: { name: string; edition?: SeedEdition }[]): void {
  const keys = abilities.map((a) => `${a.name}::${a.edition ?? "shared"}`);
  const at = keys.findIndex((key, i) => keys.indexOf(key) !== i);
  if (at !== -1)
    throw new Error(
      `Seed error: duplicate GrantedAbility name "${abilities[at].name}" (edition: ${abilities[at].edition ?? "shared"}) across maneuvers/shadow-arts/channel-divinity/subclass-choices`,
    );
}
