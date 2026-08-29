import { getQueryClient } from "@/api/queryClient";
import { referenceKeys } from "@/api/queryKeys";
import type { UniversalActionOption } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

// The rows GET /api/reference serves per edition (#1430), verbatim off the wire
// and in the served (name-sorted) order. Descriptions are elided — no consumer
// renders them, and duplicating four paragraphs of SRD text per edition here
// would put rules copy back on the client, which is the whole point of #1430.
// reference.test.ts pins the real response's names, keys, costs and order.
const row = (key: string, name: string, cost: UniversalActionOption["cost"]): UniversalActionOption => ({
  key,
  name,
  cost,
  description: `${name} rules text`,
});

/** SRD 5.1's 15 universal actions, name-sorted as the route serves them. */
export const SERVED_ACTIONS_2014: UniversalActionOption[] = [
  row("attack", "Attack", "action"),
  row("castSpell", "Cast a Spell", "action"),
  row("castSpellBonus", "Cast a Spell (Bonus Action)", "bonusAction"),
  row("castSpellReaction", "Cast a Spell (Reaction)", "reaction"),
  row("dash", "Dash", "action"),
  row("disengage", "Disengage", "action"),
  row("dodge", "Dodge", "action"),
  row("grapple", "Grapple", "action"),
  row("help", "Help", "action"),
  row("hide", "Hide", "action"),
  row("opportunityAttack", "Opportunity Attack", "reaction"),
  row("ready", "Ready", "action"),
  row("search", "Search", "action"),
  row("shove", "Shove", "action"),
  row("useObject", "Use an Object", "action"),
];

/** SRD 5.2's 17: the same keys renamed (Magic / Utilize) plus Study + Influence. */
// fallow-ignore-next-line code-duplication -- a wire fixture must state the exact rows the server sends per edition; the six rows the editions happen to share are the assertion that they are shared, and collapsing them into a spread would hide which edition each row came from
export const SERVED_ACTIONS_2024: UniversalActionOption[] = [
  row("attack", "Attack", "action"),
  row("castSpellBonus", "Cast a Bonus-Action Spell", "bonusAction"),
  row("castSpellReaction", "Cast a Reaction Spell", "reaction"),
  row("dash", "Dash", "action"),
  row("disengage", "Disengage", "action"),
  row("dodge", "Dodge", "action"),
  row("grapple", "Grapple", "action"),
  row("help", "Help", "action"),
  row("hide", "Hide", "action"),
  row("influence", "Influence", "action"),
  row("castSpell", "Magic", "action"),
  row("opportunityAttack", "Opportunity Attack", "reaction"),
  row("ready", "Ready", "action"),
  row("search", "Search", "action"),
  row("shove", "Shove", "action"),
  row("study", "Study", "action"),
  row("useObject", "Utilize", "action"),
];

const SERVED_ACTIONS: Record<RulesEdition, UniversalActionOption[]> = {
  EDITION_2014: SERVED_ACTIONS_2014,
  EDITION_2024: SERVED_ACTIONS_2024,
};

/** Seeds the reference cache so useUniversalActions resolves with no fetch — the
 *  staleTime: Infinity entry is permanently fresh, so the query never fires. */
export function seedUniversalActions(
  edition: RulesEdition,
  universalActions = SERVED_ACTIONS[edition],
): void {
  getQueryClient().setQueryData(referenceKeys.byEdition(edition), {
    races: [],
    classes: [],
    backgrounds: [],
    alignments: [],
    artisanTools: [],
    conditions: [],
    itemRarities: [],
    universalActions,
  });
}
