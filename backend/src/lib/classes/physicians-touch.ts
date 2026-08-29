// Physician's Touch, PHB'24 p.92, Warrior of Mercy L6 — upgrades Hand of Healing's own action in place, rather than a competing catalog row.
// Edition-invariant: Warrior of Mercy has no 2014 counterpart, so this gates on subclass slug + level only.
import type { AnnounceAugmentor } from "./announce-augmentors.js";

// PHB'24 p.92 — Physician's Touch's own grant level.
export const PHYSICIANS_TOUCH_LEVEL = 6;

export const PHYSICIANS_TOUCH_REMINDER =
  "Physician's Touch (L6): also ends one of Blinded/Deafened/Paralyzed/Poisoned/Stunned.";

export const physiciansTouchAugmentor: AnnounceAugmentor = {
  targetKeys: ["handOfHealing"],
  appliesTo: (ctx) => ctx.slug === "monk-warrior-of-mercy" && ctx.entryLevel >= PHYSICIANS_TOUCH_LEVEL,
  augment: () => ({ reminderAppend: PHYSICIANS_TOUCH_REMINDER }),
};
