import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CapabilityEditor from "@/features/entities/CapabilityEditor";
import type { CatalogSpell, ItemCapability } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchSpells: vi.fn() }));
import { fetchSpells } from "@/api/client";

function spell(partial: Partial<CatalogSpell> & Pick<CatalogSpell, "id" | "name" | "level">): CatalogSpell {
  return {
    school: "evocation",
    castingTime: "1 action",
    range: "60 ft",
    duration: "Instantaneous",
    description: "",
    concentration: false,
    ritual: false,
    classes: ["wizard"],
    cantripScaling: false,
    ...partial,
  };
}

const FIREBALL = spell({ id: "sp-fireball", name: "Fireball", level: 3, attackType: "save", saveAbility: "dexterity" });
const FIRE_BOLT = spell({ id: "sp-firebolt", name: "Fire Bolt", level: 0, attackType: "attack" });
const FLY = spell({ id: "sp-fly", name: "Fly", level: 3 }); // utility — no attackType

const NEW_CAST: ItemCapability = {
  kind: "castSpell",
  resource: "perRestShort",
  uses: 1,
  dcMode: "fixed",
  dcValue: 13,
  attackMode: "fixed",
  attackValue: 5,
};

// The editor is a controlled component; drive it through a stateful harness so a
// spell selection (onChange) is applied and re-rendered, mirroring real usage.
function Harness({ onChange }: { onChange?: (caps: ItemCapability[]) => void }) {
  const [caps, setCaps] = useState<ItemCapability[]>([{ ...NEW_CAST }]);
  return (
    <CapabilityEditor
      capabilities={caps}
      onChange={(next) => {
        setCaps(next);
        onChange?.(next);
      }}
      spellcasterAttunable={false}
    />
  );
}

async function pickSpell(spellId: string) {
  await screen.findByRole("option", { name: /Fireball/ }); // catalog loaded
  await userEvent.selectOptions(screen.getByLabelText("Spell"), spellId);
}

describe("CapabilityEditor — castSpell DC/attack fields are conditional on the spell", () => {
  beforeEach(() => {
    vi.mocked(fetchSpells).mockResolvedValue([FIREBALL, FIRE_BOLT, FLY]);
  });

  it("shows only Save DC for a save spell (Fireball)", async () => {
    render(<Harness />);
    await pickSpell(FIREBALL.id);

    expect(screen.getByLabelText("Save DC")).toBeInTheDocument();
    expect(screen.getByLabelText("DC value")).toBeInTheDocument();
    expect(screen.queryByLabelText("Attack bonus")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Attack value")).not.toBeInTheDocument();
  });

  it("shows only Attack bonus for an attack spell (Fire Bolt)", async () => {
    render(<Harness />);
    await pickSpell(FIRE_BOLT.id);

    expect(screen.getByLabelText("Attack bonus")).toBeInTheDocument();
    expect(screen.getByLabelText("Attack value")).toBeInTheDocument();
    expect(screen.queryByLabelText("Save DC")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("DC value")).not.toBeInTheDocument();
  });

  it("hides both — and clears the values — for a utility spell (Fly)", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await pickSpell(FLY.id);

    expect(screen.queryByLabelText("Save DC")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("DC value")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Attack bonus")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Attack value")).not.toBeInTheDocument();

    // The picked-Fly payload carries neither a DC nor an attack value, so nothing
    // bogus is persisted (a stale default 13/5 would otherwise ride along).
    const last = onChange.mock.calls.at(-1)![0][0];
    expect(last.spellId).toBe(FLY.id);
    expect(last.dcValue).toBeUndefined();
    expect(last.attackValue).toBeUndefined();
  });

  it("no DC/attack fields before a spell is chosen", async () => {
    render(<Harness />);
    await screen.findByRole("option", { name: /Fireball/ });
    expect(screen.queryByLabelText("Save DC")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Attack bonus")).not.toBeInTheDocument();
  });
});
