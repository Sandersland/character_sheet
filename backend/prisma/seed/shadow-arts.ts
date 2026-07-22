// ── Shadow Arts catalog (Way of Shadow, #441) ───────────────────────────────
// The 4 L3 Shadow Arts spells, GrantedAbility rows with source "shadowArts".
// Flat 2-focus, no scaling (no costPerStep). Concentration is derived in code
// (shadow-arts.ts CONCENTRATION_SHADOW_ARTS), not a column. Pass without Trace
// is a buff (+10 Stealth via #438); the rest are utility. Minor Illusion (the
// other Shadow Arts option) is a granted cantrip, seeded in granted-spells.ts.
export interface ShadowArtSeed {
  name: string;
  description: string;
  effectKind?: "buff";
  buffTarget?: string;
  buffModifier?: number;
}

export const SHADOW_ARTS: ShadowArtSeed[] = [
  {
    name: "Shadow Arts: Darkness",
    description: "Spend 2 focus to cast Darkness without material components (a 15-ft sphere of magical darkness). Requires concentration.",
  },
  {
    name: "Shadow Arts: Silence",
    description: "Spend 2 focus to cast Silence without material components (a 20-ft sphere where no sound can be created or pass). Requires concentration.",
  },
  {
    name: "Shadow Arts: Pass without Trace",
    description: "Spend 2 focus to cast Pass without Trace without material components — you and nearby allies gain +10 to Stealth checks. Requires concentration.",
    effectKind: "buff",
    buffTarget: "stealth",
    buffModifier: 10,
  },
  {
    name: "Shadow Arts: Darkvision",
    description: "Spend 2 focus to cast Darkvision without material components, granting 60 ft of darkvision for 8 hours. No concentration.",
  },
];
