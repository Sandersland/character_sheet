// ── Shadow Arts catalog (Warrior of Shadow, #1246 — 2024 rewrite of #441) ───
// The 2024 Shadow Arts feature has exactly one cast (the 2014 4-spell menu —
// Darkness/Silence/Pass without Trace/Darkvision — is retired): a single L3
// GrantedAbility row, source "shadowArts", flat 1-focus, always concentrates
// (shadow-arts.ts shadowArtEffectSpec). Minor Illusion (the feature's other
// grant) is a granted cantrip, seeded in subclass-granted-spells.ts; Darkvision
// is flavor text (this app tracks no senses).
export interface ShadowArtSeed {
  name: string;
  description: string;
}

export const SHADOW_ARTS: ShadowArtSeed[] = [
  {
    name: "Shadow Arts: Darkness",
    description:
      "Spend 1 focus to cast Darkness without material components (a 15-ft sphere of magical darkness). You can see through it, and while it persists you can move it up to 30 ft as a bonus action. Requires concentration.",
  },
];
