// Fail-fast guard shared by seed.ts — GrantedAbility.name is globally unique,
// so the source arrays must not collide before we upsert them by name.
export function assertUniqueGrantedAbilityNames(abilities: { name: string }[]): void {
  const names = abilities.map((a) => a.name);
  const dupe = names.find((name, i) => names.indexOf(name) !== i);
  if (dupe)
    throw new Error(
      `Seed error: duplicate GrantedAbility name "${dupe}" across maneuvers/shadow-arts/channel-divinity/subclass-choices`,
    );
}
