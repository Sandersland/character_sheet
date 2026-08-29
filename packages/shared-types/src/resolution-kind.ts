// Served on the wire as ClassFeature.resolverKind (validated at seed time by
// RESOLVER_KIND_VALUES) and switched on client-side by
// ACTION_RESOLVERS/resolverFromRow. Both sides `satisfies readonly
// ResolutionKind[]` a local value array against this type, so adding a
// member here without updating both arrays fails typecheck on whichever
// side is behind.
export type ResolutionKind =
  | "attack-picker"
  | "twf-picker"
  | "flurry-picker"
  | "spell-picker"
  | "item-picker"
  | "heal-roll"
  | "heal-input"
  | "loadout-picker"
  | "simple-confirm"
  // Behaves exactly like "simple-confirm"; kept distinct only because resolverFromRow
  // sources it from a row's resolverKind rather than a hand-authored entry.
  | "toggle"
  | "slot-picker";
