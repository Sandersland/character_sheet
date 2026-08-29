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

  it("a reminder-less regranting row renders each edition's own name", () => {
    renderSheet([action({ key: "fastHands", name: "Fast Hands", regrants: ["useObject"] })], SERVED_ACTIONS_2014);
    expect(card("Fast Hands")).toHaveTextContent("Use an Object");
  });
});

describe("BonusActionSheetBody — the monk cards name their regrants (#1431/#1505)", () => {
  // Kept byte-identical to DERIVED_ACTIONS' regrants/reminders — update both together.
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
