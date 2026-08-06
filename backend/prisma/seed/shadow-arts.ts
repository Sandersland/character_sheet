// ── Shadow Arts catalog ──────────────────────────────────────────────────────
// Warrior of Shadow (2024, PHB'24 p.91 — #1246 rewrite of #441): exactly one
// cast, a single L3 GrantedAbility row, source "shadowArts", 1 focus, always
// concentrates (shadow-arts.ts shadowArtEffectSpec). Minor Illusion (the
// feature's other grant) is a granted cantrip, seeded in
// subclass-granted-spells.ts; Darkvision is flavor text (this app tracks no
// senses).
//
// Way of Shadow (2014, PHB'14 pp.79-80 — not in SRD 5.1, #1502): "As an
// action, you can spend 2 ki points to cast darkness, darkvision, pass
// without trace, or silence, without providing material components" — four
// L3 rows, 2 ki each, the exact same-name fork #1415's (name, edition)
// widening exists for ("Shadow Arts: Darkness" now exists once per edition).
// costPoolKey/costBase genuinely differ per edition (ki/2 vs focus/1) and are
// threaded per row below; minLevel(3)/alwaysKnown(true)/costKind("pool") stay
// hardcoded in seedShadowArts since every row (both editions) agrees on them.
import type { SeedEdition } from "./edition.js";

export interface ShadowArtSeed {
  name: string;
  description: string;
  // A mechanically diverging row forks (#1415 made this expressible); never
  // omitted here — every row today is edition-specific (see file header).
  edition: SeedEdition;
  // The pool this art spends from and how much — genuinely differs per
  // edition (2014's ki vs 2024's focus, 2 vs 1), unlike minLevel/alwaysKnown/
  // costKind which agree across both and stay hardcoded in seedShadowArts.
  costPoolKey: "ki" | "focus";
  costBase: number;
}

export const SHADOW_ARTS: ShadowArtSeed[] = [
  {
    name: "Shadow Arts: Darkness",
    description:
      "Spend 1 focus to cast Darkness without material components (a 15-ft sphere of magical darkness). You can see through it, and while it persists you can move it up to 30 ft as a bonus action. Requires concentration.",
    edition: "EDITION_2024",
    costPoolKey: "focus",
    costBase: 1,
  },
  {
    name: "Shadow Arts: Darkness",
    description:
      "Spend 2 ki to cast Darkness without material components: a 15-ft-radius sphere of magical darkness spreads from a point you choose within 60 ft, lasting 10 minutes (PHB'14 pp.79-80 — not in SRD 5.1). Requires concentration.",
    edition: "EDITION_2014",
    costPoolKey: "ki",
    costBase: 2,
  },
  {
    name: "Shadow Arts: Darkvision",
    description:
      "Spend 2 ki to cast Darkvision without material components: touch a willing creature to grant it darkvision out to 60 ft for 8 hours (PHB'14 pp.79-80 — not in SRD 5.1). No concentration.",
    edition: "EDITION_2014",
    costPoolKey: "ki",
    costBase: 2,
  },
  {
    name: "Shadow Arts: Pass without Trace",
    description:
      "Spend 2 ki to cast Pass without Trace without material components: for 1 hour, you and companions within 30 ft gain a +10 bonus to Dexterity (Stealth) checks and can't be tracked except by magical means (PHB'14 pp.79-80 — not in SRD 5.1). Requires concentration.",
    edition: "EDITION_2014",
    costPoolKey: "ki",
    costBase: 2,
  },
  {
    name: "Shadow Arts: Silence",
    description:
      "Spend 2 ki to cast Silence without material components: a 20-ft-radius sphere of silence spreads from a point you choose within 60 ft, lasting 10 minutes (PHB'14 pp.79-80 — not in SRD 5.1). Requires concentration.",
    edition: "EDITION_2014",
    costPoolKey: "ki",
    costBase: 2,
  },
];
