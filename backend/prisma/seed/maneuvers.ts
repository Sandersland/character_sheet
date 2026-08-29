// Battle Master maneuvers — SRD 5.1 p.25 (2014); 2024 wording is mirror-sourced, not confirmed against SRD 5.2. Every maneuver costs 1 superiority die and rolls it; the server owns the roll on castManeuver.
import { z } from "zod";

import type { SeedEdition } from "./edition.js";

// The session UI's routing key (GrantedAbility.placement) — mirrors it as a const array so
// maneuverSeedSchema below derives from the SAME list a type error would catch drifting.
const MANEUVER_PLACEMENT_VALUES = ["attackRoll", "damageRoll", "reaction", "effect", "attackOption"] as const;
export type ManeuverPlacement = (typeof MANEUVER_PLACEMENT_VALUES)[number];

const ACTION_SLOT_VALUES = ["bonusAction", "reaction"] as const;
// Only the four abilities a Battle Master maneuver's save can target — narrower than the full
// six-ability set (no maneuver imposes an Intelligence/Charisma save).
const MANEUVER_SAVE_ABILITY_VALUES = ["strength", "dexterity", "wisdom", "constitution"] as const;

export interface ManeuverSeed {
  name: string;
  description: string;
  placement: ManeuverPlacement;
  actionSlot?: (typeof ACTION_SLOT_VALUES)[number];
  saveAbility?: (typeof MANEUVER_SAVE_ABILITY_VALUES)[number];
  selfTempHp?: boolean;
  // Omitted = shared (NULL column, valid in both editions, #1306); a diverging row forks (#1415).
  edition?: SeedEdition;
}

export const maneuverSeedSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  placement: z.enum(MANEUVER_PLACEMENT_VALUES),
  actionSlot: z.enum(ACTION_SLOT_VALUES).optional(),
  saveAbility: z.enum(MANEUVER_SAVE_ABILITY_VALUES).optional(),
  selfTempHp: z.boolean().optional(),
  edition: z.enum(["EDITION_2014", "EDITION_2024"]).optional(),
});

export const MANEUVERS: ManeuverSeed[] = [
  {
    name: "Commander's Strike",
    placement: "attackOption",
    actionSlot: "bonusAction",
    description:
      "When you take the Attack action, forgo one of your attacks and use a bonus action to direct one ally to strike. Expend a superiority die; the ally uses their reaction to make one weapon attack and adds the die result to the damage roll.",
  },
  {
    name: "Disarming Attack",
    placement: "damageRoll",
    saveAbility: "strength",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. The target must make a Strength saving throw or drop one item of your choice. The item lands at its feet.",
  },
  {
    name: "Distracting Strike",
    placement: "damageRoll",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. The next attack roll against the target by someone other than you has advantage if made before the start of your next turn.",
  },
  {
    name: "Evasive Footwork",
    placement: "effect",
    description:
      "When you move, expend a superiority die and add it to your AC until you stop moving.",
  },
  {
    name: "Feinting Attack",
    placement: "damageRoll",
    actionSlot: "bonusAction",
    description:
      "As a bonus action, you can expend a superiority die and choose one creature within 5 feet. You have advantage on your next attack roll against that creature this turn. On a hit, add the die result to the damage roll.",
  },
  {
    name: "Goading Attack",
    placement: "damageRoll",
    saveAbility: "wisdom",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. The target must make a Wisdom saving throw or have disadvantage on all attack rolls against targets other than you until the end of your next turn.",
  },
  {
    name: "Lunging Attack",
    placement: "damageRoll",
    description:
      "When you make a melee weapon attack, expend a superiority die to increase your reach by 5 feet. On a hit, add the die result to the damage roll.",
  },
  {
    name: "Maneuvering Attack",
    placement: "damageRoll",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. Choose one friendly creature. It can use its reaction to move up to half its speed without provoking opportunity attacks from the target.",
  },
  {
    name: "Menacing Attack",
    placement: "damageRoll",
    saveAbility: "wisdom",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. The target must make a Wisdom saving throw or be frightened of you until the end of your next turn.",
  },
  {
    name: "Parry",
    placement: "reaction",
    actionSlot: "reaction",
    description:
      "When you take damage from a melee attack, use your reaction to expend a superiority die and reduce the damage by the die result + your Dexterity modifier.",
  },
  {
    name: "Precision Attack",
    placement: "attackRoll",
    description:
      "When you make a weapon attack roll, you can expend a superiority die and add the result to the roll. You can use this maneuver before or after making the attack roll, but before any effects of the attack are applied.",
  },
  {
    name: "Pushing Attack",
    placement: "damageRoll",
    saveAbility: "strength",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. If the target is Large or smaller, it must make a Strength saving throw or be pushed up to 15 feet away from you.",
  },
  {
    name: "Rally",
    placement: "effect",
    actionSlot: "bonusAction",
    selfTempHp: true,
    description:
      "As a bonus action, expend a superiority die to bolster yourself. You gain temporary HP equal to the die result + your Charisma modifier.",
  },
  {
    name: "Riposte",
    placement: "reaction",
    actionSlot: "reaction",
    description:
      "When a creature misses you with a melee attack, use your reaction to expend a superiority die and make one melee weapon attack against that creature. On a hit, add the die result to the damage roll.",
  },
  {
    name: "Sweeping Attack",
    placement: "damageRoll",
    description:
      "When you hit a creature with a melee weapon attack, expend a superiority die and attempt to hit a second creature within 5 feet of the first. If the original roll would have hit the second creature, it takes the die result in damage.",
  },
  {
    name: "Trip Attack",
    placement: "damageRoll",
    saveAbility: "strength",
    description:
      "When you hit a creature with a weapon attack, expend a superiority die and add it to the damage roll. If the target is Large or smaller, it must make a Strength saving throw or be knocked prone.",
  },
];
