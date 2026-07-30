/**
 * #1431: what the Bonus Action sheet's class cards say about the universal
 * actions their class feature re-costs.
 *
 * The options are built through the real `classActionOption` against the real
 * served-row fixtures, so this covers the whole seam — backend `regrants` keys →
 * edition-resolved names → card subtitle — rather than a hand-made view model.
 *
 * The monk block is the scope latch: those four rows carry `regrants` as data
 * but must keep their curated reminders verbatim, because they are 2024-shaped
 * on an edition-blind catalog (see DERIVED_ACTIONS) and naming their grant would
 * lie to a 2014 monk.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import BonusActionSheetBody from "@/features/session/BonusActionSheetBody";
import { resolverFor } from "@/features/session/actionResolvers";
import { classActionOption, type BonusSheetModel } from "@/lib/turnOptions";
import { SERVED_ACTIONS_2014, SERVED_ACTIONS_2024 } from "@/test/universalActions";
import type { AvailableAction, Character, UniversalActionOption } from "@/types/character";

const character = { resources: { pools: [] }, inventory: [] } as unknown as Character;

function action(over: Partial<AvailableAction> & Pick<AvailableAction, "key" | "name">): AvailableAction {
  return { cost: "bonusAction", enabled: true, ...over };
}

function renderSheet(actions: AvailableAction[], served: UniversalActionOption[] = SERVED_ACTIONS_2024) {
  const model: BonusSheetModel = {
    classBonusOptions: actions.map((a) => classActionOption(a, resolverFor(a.key), character, served)),
    bonusSpells: [],
    twfHintText: null,
    offHandSummary: null,
  };
  render(
    <BonusActionSheetBody
      model={model}
      twfAvailable={false}
      busy={false}
      handleTwfAction={vi.fn()}
      handleFlurryAction={vi.fn()}
      handleActionClick={vi.fn()}
      handleBonusSpellCast={vi.fn()}
      onOther={vi.fn()}
    />,
  );
}

const card = (name: string) => screen.getByRole("button", { name });

describe("BonusActionSheetBody — regranted action names (#1431)", () => {
  const cunningAction = action({
    key: "cunningAction",
    name: "Cunning Action",
    regrants: ["dash", "disengage", "hide"],
  });

  it("names Dash, Disengage and Hide on the Cunning Action card", () => {
    renderSheet([cunningAction]);
    expect(card("Cunning Action")).toHaveTextContent("Dash · Disengage · Hide");
  });

  it("names the object-use action under each edition's own name on the Fast Hands pair", () => {
    // Fast Hands carries rule text of its own (it spends Cunning Action's Bonus
    // Action rather than a second one), so its subtitle stays that text; the
    // regranted key rides the wire and is asserted in turnOptions.test.ts.
    const fastHands = action({
      key: "fastHands",
      name: "Fast Hands",
      regrants: ["useObject"],
      reminder: "Uses Cunning Action's Bonus Action, not an extra one.",
    });
    renderSheet([cunningAction, fastHands]);
    expect(card("Fast Hands")).toHaveTextContent("Uses Cunning Action's Bonus Action, not an extra one.");
    expect(card("Cunning Action")).toHaveTextContent("Dash · Disengage · Hide");
  });

  it("renders nothing extra before the reference query resolves", () => {
    renderSheet([cunningAction], []);
    expect(card("Cunning Action")).toHaveTextContent("Cunning Action");
    expect(card("Cunning Action")).not.toHaveTextContent("·");
  });

  it("uses the 2014 names for a 2014 character", () => {
    renderSheet([action({ key: "fastHands", name: "Fast Hands", regrants: ["useObject"] })], SERVED_ACTIONS_2014);
    expect(card("Fast Hands")).toHaveTextContent("Use an Object");
  });
});

describe("BonusActionSheetBody — the monk cards' subtitles are unchanged (#1431 scope latch)", () => {
  // Byte-identical to the DERIVED_ACTIONS reminders a monk L2 is served. If a
  // future change makes a regranting row's names win over its own rule text,
  // these four go red — which is the point.
  const MONK_L2: [AvailableAction, string][] = [
    [
      action({ key: "patientDefense", name: "Patient Defense", regrants: ["disengage"], reminder: "Disengage (free bonus action)." }),
      "Disengage (free bonus action).",
    ],
    [
      action({
        key: "patientDefenseFocus",
        name: "Patient Defense (1 Focus)",
        regrants: ["disengage", "dodge"],
        reminder: "Disengage + Dodge (spend 1 Focus).",
      }),
      "Disengage + Dodge (spend 1 Focus).",
    ],
    [
      action({ key: "stepOfTheWind", name: "Step of the Wind", regrants: ["dash"], reminder: "Dash (free bonus action)." }),
      "Dash (free bonus action).",
    ],
    [
      action({
        key: "stepOfTheWindFocus",
        name: "Step of the Wind (1 Focus)",
        regrants: ["disengage", "dash"],
        reminder: "Disengage + Dash, jump distance doubled this turn (spend 1 Focus).",
      }),
      "Disengage + Dash, jump distance doubled this turn (spend 1 Focus).",
    ],
  ];

  it("keeps every curated reminder verbatim and names no regrant", () => {
    renderSheet(MONK_L2.map(([a]) => a));
    for (const [a, reminder] of MONK_L2) {
      expect(card(a.name)).toHaveTextContent(reminder);
      // The name list would join with " · " — no monk card may show one.
      expect(card(a.name)).not.toHaveTextContent("·");
    }
  });
});
