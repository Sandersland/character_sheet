// InlineSpellPicker tests (epic #1827 Slice 6, #1833) — the Cast-a-Spell
// picker rewired onto the shared resolver (useResolution/ResolutionRail,
// mirrors InlineAttackPicker.test.tsx's own coverage style, #1832). Exercises
// each of the five spell shapes committing ONE resolveAction op with the
// mapped cost, the 5e economy interlock (onCommitSlot), and that a heal's
// self/ally apply is built while a damage spell's never is (self-or-announce).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineSpellPicker from "@/features/session/InlineSpellPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { applyResolveActionOperations } from "@/api/client";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character, Spell } from "@/types/character";

vi.mock("@/api/client", () => ({
  applyResolveActionOperations: vi.fn(),
}));

function seedMid() {
  return vi.spyOn(Math, "random").mockReturnValue(0.5);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(applyResolveActionOperations).mockResolvedValue({} as Character);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const FIRE_BOLT: Spell = {
  id: "entry-fire-bolt",
  name: "Fire Bolt",
  level: 0,
  school: "evocation",
  prepared: true,
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "A bolt of fire.",
  attackType: "attack",
  damageType: "fire",
  effectKind: "damage",
  castCost: "action",
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 10, modifier: 0 } }],
};

const SACRED_FLAME: Spell = {
  id: "entry-sacred-flame",
  name: "Sacred Flame",
  level: 0,
  school: "evocation",
  prepared: true,
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "",
  attackType: "save",
  saveAbility: "dexterity",
  damageType: "radiant",
  effectKind: "damage",
  castCost: "action",
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 8, modifier: 0 } }],
};

const MAGIC_MISSILE: Spell = {
  id: "entry-magic-missile",
  name: "Magic Missile",
  level: 1,
  school: "evocation",
  prepared: true,
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "",
  effectKind: "damage",
  damageType: "force",
  castCost: "action",
  effectRolls: [{ slotLevel: 1, roll: { count: 3, faces: 4, modifier: 3 } }],
};

const CURE_WOUNDS: Spell = {
  id: "entry-cure-wounds",
  name: "Cure Wounds",
  level: 1,
  school: "evocation",
  prepared: true,
  castingTime: "1 action",
  range: "Touch",
  duration: "Instantaneous",
  description: "",
  effectKind: "heal",
  castCost: "action",
  effectRolls: [{ slotLevel: 1, roll: { count: 1, faces: 8, modifier: 4 } }],
};

const DRUIDCRAFT: Spell = {
  id: "entry-druidcraft",
  name: "Druidcraft",
  level: 0,
  school: "transmutation",
  prepared: true,
  castingTime: "1 action",
  range: "30 feet",
  duration: "Instantaneous",
  description: "",
  castCost: "action",
  effectRolls: [],
};

const CONCENTRATION_SPELL: Spell = {
  id: "entry-bless",
  name: "Bless",
  level: 1,
  school: "enchantment",
  prepared: true,
  castingTime: "1 action",
  range: "30 feet",
  duration: "Concentration, up to 1 minute",
  description: "",
  concentration: true,
  castCost: "action",
  effectRolls: [],
};

function makeCharacter(spells: Spell[]): Character {
  return {
    id: "char-1",
    name: "Tester",
    inventory: [],
    spellcasting: {
      ability: "intelligence",
      spellSaveDC: 14,
      spellAttackBonus: 6,
      slots: [
        { level: 1, total: 3, used: 0 },
        { level: 2, total: 2, used: 0 },
      ],
      arcana: [],
      spells,
      concentratingOn: null,
    },
  } as unknown as Character;
}

interface RenderOpts {
  slotAvailable?: boolean;
  onCommitSlot?: ReturnType<typeof vi.fn>;
  onCastSettled?: ReturnType<typeof vi.fn>;
}

function renderPicker(character: Character, opts: RenderOpts = {}) {
  const onCommitSlot = opts.onCommitSlot ?? vi.fn();
  const onClose = vi.fn();
  const onLogChanged = vi.fn();
  renderWithCharacter(
    <RollProvider>
      <InlineSpellPicker
        sessionId="sess-1"
        onClose={onClose}
        onLogChanged={onLogChanged}
        slot="action"
        slotAvailable={opts.slotAvailable ?? true}
        onCommitSlot={onCommitSlot}
        spellCastThisTurn={{}}
        castingTimeFilter="1 action"
        allies={[]}
        onCastSettled={opts.onCastSettled}
      />
    </RollProvider>,
    character,
  );
  return { onClose, onLogChanged, onCommitSlot };
}

function lastOp() {
  const calls = vi.mocked(applyResolveActionOperations).mock.calls;
  const [, ops] = calls[calls.length - 1];
  return ops[0];
}

describe("InlineSpellPicker — attack-roll shape (Fire Bolt)", () => {
  it("rolls to hit, rolls damage, and commits ONE resolveAction op carrying entryId + toHit + effect", async () => {
    const user = userEvent.setup();
    seedMid();
    const { onCommitSlot } = renderPicker(makeCharacter([FIRE_BOLT]));

    await user.click(screen.getByRole("button", { name: /^Fire Bolt/ }));
    await user.click(screen.getByRole("button", { name: "Roll to hit" }));
    // A mid-face d20 (seedMid) always lands ambiguous under a literal-20 crit
    // range (#1120: spell attacks never widen), so Roll damage is armed the
    // instant the die resolves — no separate "call it" tap needed here.
    const damageBtn = await screen.findByRole("button", { name: /Roll (crit )?damage/ });
    await user.click(damageBtn);
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(applyResolveActionOperations).toHaveBeenCalledTimes(1);
    const op = lastOp();
    expect(op).toMatchObject({ type: "resolveAction", source: "Fire Bolt", entryId: "entry-fire-bolt" });
    expect(op.cost).toEqual({ kind: "action" });
    expect(op.toHit).toBeTruthy();
    expect(op.effect).toMatchObject({ type: "fire", kind: "damage" });
    expect(op.slotLevel).toBeUndefined();
    expect(op.apply).toBeUndefined();
    // Deferred to the mutation's success (#1848 review fix), not synchronous.
    await waitFor(() => expect(onCommitSlot).toHaveBeenCalledWith(0));
  });
});

describe("InlineSpellPicker — saving-throw shape (Sacred Flame)", () => {
  it("shows the announce-save step (no to-hit) and commits an op with save set", async () => {
    const user = userEvent.setup();
    seedMid();
    renderPicker(makeCharacter([SACRED_FLAME]));

    await user.click(screen.getByRole("button", { name: /^Sacred Flame/ }));
    expect(screen.queryByText("Roll to hit")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Roll damage" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    const op = lastOp();
    expect(op.toHit).toBeFalsy();
    expect(op.save).toEqual({ dc: 14, ability: "dexterity" });
    expect(op.effect).toMatchObject({ type: "radiant" });
  });
});

describe("InlineSpellPicker — leveled damage spell (Magic Missile)", () => {
  it("commits with the chosen slotLevel and no apply (announce-only, no target model)", async () => {
    const user = userEvent.setup();
    seedMid();
    renderPicker(makeCharacter([MAGIC_MISSILE]));

    await user.click(screen.getByRole("button", { name: /^Magic Missile/ }));
    await user.click(screen.getByRole("button", { name: "Roll damage" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    const op = lastOp();
    expect(op.slotLevel).toBe(1);
    expect(op.entryId).toBe("entry-magic-missile");
    expect(op.apply).toBeUndefined();
  });
});

describe("InlineSpellPicker — heal shape (Cure Wounds)", () => {
  it("shows healing labels and commits with a self apply payload", async () => {
    const user = userEvent.setup();
    seedMid();
    renderPicker(makeCharacter([CURE_WOUNDS]));

    await user.click(screen.getByRole("button", { name: /^Cure Wounds/ }));
    expect(screen.getByRole("button", { name: "Roll healing" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Roll healing" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    const op = lastOp();
    expect(op.effect?.kind).toBe("heal");
    expect(op.apply).toMatchObject({ target: "self", kind: "heal" });
    expect(op.apply?.amount).toBeGreaterThan(0);
  });
});

describe("InlineSpellPicker — no-roll utility shape (Druidcraft)", () => {
  it("one tap resolves it — toHit/save/effect all absent", async () => {
    const user = userEvent.setup();
    renderPicker(makeCharacter([DRUIDCRAFT]));

    await user.click(screen.getByRole("button", { name: /^Druidcraft/ }));
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    const op = lastOp();
    expect(op.toHit ?? null).toBeNull();
    expect(op.save ?? null).toBeNull();
    expect(op.effect ?? null).toBeNull();
    expect(op.entryId).toBe("entry-druidcraft");
  });
});

describe("InlineSpellPicker — economy interlock + single spend", () => {
  it("commits exactly once per resolution and fires onCommitSlot (deferred to mutation success) with the spell's base level", async () => {
    const user = userEvent.setup();
    const { onCommitSlot } = renderPicker(makeCharacter([DRUIDCRAFT]));

    await user.click(screen.getByRole("button", { name: /^Druidcraft/ }));
    const resolve = screen.getByRole("button", { name: "Resolve" });
    await user.click(resolve);

    expect(applyResolveActionOperations).toHaveBeenCalledTimes(1);
    // onCommitSlot fires only once the mutation's promise resolves (#1848
    // review fix) — not synchronously alongside the mutate() call.
    await waitFor(() => expect(onCommitSlot).toHaveBeenCalledTimes(1));
    expect(onCommitSlot).toHaveBeenCalledWith(0);
    // The rail's own completion button disappears once completed — no second tap possible.
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
  });

  it("disables the resolver once the economy slot is unavailable", async () => {
    const user = userEvent.setup();
    renderPicker(makeCharacter([DRUIDCRAFT]), { slotAvailable: false });

    await user.click(screen.getByRole("button", { name: /^Druidcraft/ }));
    expect(screen.getByRole("button", { name: "Resolve" })).toBeDisabled();
  });

  // #1848 review (CRITICAL): a rejected resolveAction mutation must NOT spend
  // the turn-state economy slot — the pre-fix code called onCommitSlot
  // synchronously, fire-and-forget alongside the mutation, so a server error
  // still permanently marked the slot spent with no retry path.
  it("does NOT call onCommitSlot when the resolveAction mutation rejects", async () => {
    const user = userEvent.setup();
    vi.mocked(applyResolveActionOperations).mockRejectedValueOnce(new Error("network blip"));
    const { onCommitSlot } = renderPicker(makeCharacter([DRUIDCRAFT]));

    await user.click(screen.getByRole("button", { name: /^Druidcraft/ }));
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    // Let the rejected mutation settle — the failure surfaces as an error message.
    await screen.findByText("network blip");
    expect(onCommitSlot).not.toHaveBeenCalled();
  });
});

describe("InlineSpellPicker — entryId routes concentration through the same castAbilityInTx sequence", () => {
  it("a concentration spell's op carries the entry id the backend needs to set/displace concentration", async () => {
    const user = userEvent.setup();
    renderPicker(makeCharacter([CONCENTRATION_SPELL]));

    await user.click(screen.getByRole("button", { name: /^Bless/ }));
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    const op = lastOp();
    expect(op.entryId).toBe("entry-bless");
    expect(op.slotLevel).toBe(1);
  });
});
