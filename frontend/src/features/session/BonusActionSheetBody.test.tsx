/**
 * #1431/#1505: what the Bonus Action sheet's class cards say about the
 * universal actions their class feature re-costs.
 *
 * The options are built through the real `classActionOption` against the real
 * served-row fixtures, so this covers the whole seam — backend `regrants` keys →
 * edition-resolved names → card subtitle — rather than a hand-made view model.
 *
 * Resolved regrant names win the subtitle over a row's own curated reminder
 * (#1505) — a name list is more scannable, and the reminder prose stays
 * available via the on-use toast/drill-in. The monk block is the scope latch:
 * those four rows carry `regrants` that are 2024-shaped on an edition-blind
 * catalog (see DERIVED_ACTIONS), so a 2014 monk is never SERVED them at all —
 * naming a served row's regrant never lies to the wrong edition.
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

  it("names the object-use action under each edition's own name on the Fast Hands pair, even though the row also carries its own reminder", () => {
    // Fast Hands carries rule text of its own (it spends Cunning Action's Bonus
    // Action rather than a second one) — the resolved regrant name still wins
    // the subtitle (#1505); the reminder prose surfaces on-use instead.
    const fastHands = action({
      key: "fastHands",
      name: "Fast Hands",
      regrants: ["useObject"],
      reminder: "Uses Cunning Action's Bonus Action, not an extra one.",
    });
    renderSheet([cunningAction, fastHands]);
    expect(card("Fast Hands")).toHaveTextContent("Utilize");
    expect(card("Cunning Action")).toHaveTextContent("Dash · Disengage · Hide");
  });

  it("renders nothing extra before the reference query resolves", () => {
    renderSheet([cunningAction], []);
    expect(card("Cunning Action")).toHaveTextContent("Cunning Action");
    expect(card("Cunning Action")).not.toHaveTextContent("·");
  });

  // Reminder deliberately omitted so the card falls through to the resolved
  // names — this pins the CARD's edition seam, not what a Thief sees (the real
  // row always carries rule text and the test above covers that).
  it("a reminder-less regranting row renders each edition's own name", () => {
    renderSheet([action({ key: "fastHands", name: "Fast Hands", regrants: ["useObject"] })], SERVED_ACTIONS_2014);
    expect(card("Fast Hands")).toHaveTextContent("Use an Object");
  });
});

describe("BonusActionSheetBody — the monk cards name their regrants (#1431/#1505)", () => {
  // A 2024 monk L2 is served all four rows (the free/1-Focus pair for each of
  // Patient Defense/Step of the Wind); each now shows its resolved regrant
  // names instead of the curated reminder prose that used to win (#1505 —
  // ActionSheetBody's regrantNames-first precedence). Byte-identical to the
  // real DERIVED_ACTIONS rows' `regrants` arrays and reminders.
  const MONK_L2: [AvailableAction, string][] = [
    [
      action({ key: "patientDefense", name: "Patient Defense", regrants: ["disengage"], reminder: "Disengage (free bonus action)." }),
      "Disengage",
    ],
    [
      action({
        key: "patientDefenseFocus",
        name: "Patient Defense (1 Focus)",
        regrants: ["disengage", "dodge"],
        reminder: "Disengage + Dodge (spend 1 Focus).",
      }),
      "Disengage · Dodge",
    ],
    [
      action({ key: "stepOfTheWind", name: "Step of the Wind", regrants: ["dash"], reminder: "Dash (free bonus action)." }),
      "Dash",
    ],
    [
      action({
        key: "stepOfTheWindFocus",
        name: "Step of the Wind (1 Focus)",
        regrants: ["disengage", "dash"],
        reminder: "Disengage + Dash, jump distance doubled this turn (spend 1 Focus).",
      }),
      "Disengage · Dash",
    ],
  ];

  it("names each row's resolved regrants instead of its curated reminder", () => {
    renderSheet(MONK_L2.map(([a]) => a));
    for (const [a, names] of MONK_L2) {
      expect(card(a.name)).toHaveTextContent(names);
    }
  });

  it("falls back to the curated reminder before the reference query resolves", () => {
    const [patientDefense] = MONK_L2[0];
    renderSheet([patientDefense], []);
    expect(card(patientDefense.name)).toHaveTextContent(patientDefense.reminder!);
  });
});
