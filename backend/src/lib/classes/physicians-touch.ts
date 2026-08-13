/**
 * Physician's Touch (Warrior of Mercy L6, PHB'24 p.92, #1248/#1912) —
 * upgrades Hand of Healing's own action in place (also ends one of
 * Blinded/Deafened/Paralyzed/Poisoned/Stunned) rather than adding a
 * competing catalog row. The base row's reminder (monk-features.ts's
 * "Hand of Healing" row) carries the flat below-L6 text; this descriptor
 * appends the L6 rider. Edition-invariant: Warrior of Mercy has no 2014
 * counterpart (PHB'24 p.92, not in SRD 5.2 — gap-fill content, #1248), so
 * this gates on subclass slug + level only. Registered in
 * ANNOUNCE_AUGMENTORS.
 */
import type { AnnounceAugmentor } from "./announce-augmentors.js";

/** PHB'24 p.92 — Physician's Touch's own grant level. */
export const PHYSICIANS_TOUCH_LEVEL = 6;

export const PHYSICIANS_TOUCH_REMINDER =
  "Physician's Touch (L6): also ends one of Blinded/Deafened/Paralyzed/Poisoned/Stunned.";

export const physiciansTouchAugmentor: AnnounceAugmentor = {
  targetKeys: ["handOfHealing"],
  appliesTo: (ctx) => ctx.slug === "monk-warrior-of-mercy" && ctx.entryLevel >= PHYSICIANS_TOUCH_LEVEL,
  augment: () => ({ reminderAppend: PHYSICIANS_TOUCH_REMINDER }),
};
