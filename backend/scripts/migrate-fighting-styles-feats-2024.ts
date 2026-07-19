// One-time migration (#1137): the 2024 rules fold fighting styles into the feat
// system. Pre-2024 a character's chosen style was a scalar Character.resources.
// fightingStyle whose effects were derived at read time; now each style is a
// Fighting Style feat stored in resources.advancements tagged slot:"fightingStyle".
// This converts every stored scalar into the equivalent feat entry (snapshotting
// the catalog feat's improvements) so derived AC/attack values are preserved,
// then drops the scalar (serializeResourcesState no longer emits it).
//
// Idempotent: a character with no scalar, or one that already carries the matching
// fs feat, is a no-op. Each changed character gets one undoable advancement
// "featTaken" event (abilityScores/hitPoints/initiativeBonus/resources before-after
// snapshot, restored by the advancement revert branch in activity.ts).
//
// Imports only lib/ rule functions + prisma (no route/serialize code), per the
// migration-script rule in CLAUDE.md.
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client.js";
import { prisma as defaultPrisma } from "@/lib/core/prisma.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import {
  normalizeResourcesMutable,
  serializeResourcesState,
  snapshotResources,
  type FeatImprovement,
} from "@/lib/classes/resources.js";

// Frozen historical map of the pre-2024 scalar style keys → the SRD 5.2 Fighting
// Style feat name they become. Hardcoded (not a live rule) — a historical fact
// about the old storage shape that must not drift with catalog edits.
const CATALOG_STYLE_NAMES: Record<string, string> = {
  archery: "Archery",
  defense: "Defense",
  greatWeaponFighting: "Great Weapon Fighting",
  twoWeaponFighting: "Two-Weapon Fighting",
};

// Dueling + Protection are NOT SRD 5.2 feats, so they migrate to CUSTOM entries
// (no featId) carrying their old label + description (frozen 2014 text).
const CUSTOM_STYLE_DEFS: Record<string, { name: string; description: string }> = {
  dueling: {
    name: "Dueling",
    description:
      "When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.",
  },
  protection: {
    name: "Protection",
    description:
      "When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield.",
  },
};

interface ResolvedStyleFeat {
  featId?: string;
  featName: string;
  featDescription: string;
  improvements: FeatImprovement[];
}

// Fast-fail instead of silently skipping every character when the feat seed
// hasn't run yet (fresh env / out-of-order deploy) — run `prisma db seed` first.
export async function assertFightingStyleFeatsSeeded(prisma: PrismaClient): Promise<void> {
  const count = await prisma.feat.count({ where: { category: "fighting_style" } });
  if (count === 0) {
    throw new Error("No fighting_style feats in the catalog — run the seed before this migration script.");
  }
}

async function resolveStyleFeat(prisma: PrismaClient, styleKey: string): Promise<ResolvedStyleFeat | null> {
  const catalogName = CATALOG_STYLE_NAMES[styleKey];
  if (catalogName) {
    const feat = await prisma.feat.findFirst({ where: { name: catalogName, category: "fighting_style" } });
    if (!feat) return null; // seed missing the feat — leave the character untouched
    return {
      featId: feat.id,
      featName: feat.name,
      featDescription: feat.description,
      improvements: (feat.improvements as unknown as FeatImprovement[]) ?? [],
    };
  }
  const custom = CUSTOM_STYLE_DEFS[styleKey];
  if (custom) return { featName: custom.name, featDescription: custom.description, improvements: [] };
  return null; // unknown key
}

export interface MigrationResult {
  scannedCharacters: number;
  changedCharacters: string[];
}

/**
 * Converts every stored scalar fighting style into the equivalent Fighting Style
 * feat advancement. Pass a Prisma client (the default connects via DATABASE_URL);
 * returns which characters changed.
 */
export async function migrateFightingStylesToFeats(prisma: PrismaClient = defaultPrisma): Promise<MigrationResult> {
  await assertFightingStyleFeatsSeeded(prisma);
  const characters = await prisma.character.findMany({
    select: {
      id: true,
      experiencePoints: true,
      abilityScores: true,
      hitPoints: true,
      initiativeBonus: true,
      resources: true,
    },
  });

  const changedCharacters: string[] = [];

  for (const character of characters) {
    // Read the legacy scalar straight from the raw JSON — it is no longer part of
    // the normalized ResourcesMutableState shape (#1137).
    const rawResources = character.resources as Record<string, unknown> | null;
    const styleKey = typeof rawResources?.fightingStyle === "string" ? rawResources.fightingStyle : null;
    if (!styleKey) continue;

    const resolved = await resolveStyleFeat(prisma, styleKey);
    if (!resolved) continue;

    const state = normalizeResourcesMutable(character.resources);
    // Idempotent: if the matching fs feat already exists, skip (a prior run).
    if (state.advancements.some((a) => a.slot === "fightingStyle" && a.featName === resolved.featName)) {
      continue;
    }

    const scores = character.abilityScores as Record<string, number>;
    const hp = normalizeHitPoints(character.hitPoints);
    const initBonus = character.initiativeBonus;
    const snapshotState = () => ({
      abilityScores: { ...scores },
      hitPoints: { ...hp, deathSaves: { ...hp.deathSaves } },
      initiativeBonus: initBonus,
      resources: snapshotResources(state),
    });

    const before = snapshotState();

    state.advancements.push({
      id: randomUUID(),
      level: levelForExperience(character.experiencePoints),
      kind: "feat",
      slot: "fightingStyle",
      abilityDeltas: {},
      hpDelta: 0,
      initDelta: 0,
      ...(resolved.featId ? { featId: resolved.featId } : {}),
      featName: resolved.featName,
      featDescription: resolved.featDescription,
      improvements: resolved.improvements,
    });

    const after = snapshotState();
    const batchId = randomUUID();

    await prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: character.id },
        // serializeResourcesState no longer emits fightingStyle, so the scalar is
        // dropped on write while the new advancement is persisted.
        data: { resources: serializeResourcesState(state) },
      });
      await logEvent(tx, {
        characterId: character.id,
        category: "advancement",
        type: "featTaken",
        summary: `2024 rules migration: Fighting Style "${resolved.featName}" converted to a feat`,
        before,
        after,
        data: { migration: "fighting-style-feats-2024", fightingStyle: styleKey, featName: resolved.featName },
        batchId,
      });
    });

    changedCharacters.push(character.id);
  }

  return { scannedCharacters: characters.length, changedCharacters };
}

// Thin CLI: run the migration against DATABASE_URL and report the outcome.
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateFightingStylesToFeats()
    .then((result) => {
      console.log(`Scanned ${result.scannedCharacters} character(s); converted ${result.changedCharacters.length} fighting style(s) to feats.`);
      return defaultPrisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await defaultPrisma.$disconnect();
      process.exit(1);
    });
}
