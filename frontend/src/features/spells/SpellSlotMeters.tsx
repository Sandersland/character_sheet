// Spell-slot / Pact Magic / Mystic Arcanum meter blocks.
import type { ReactNode } from "react";

import MeterBar from "@/components/ui/MeterBar";
import type { SpellSlots } from "@/types/character";

interface PactBlock {
  slotLevel: number;
  count: number;
  used: number;
}

interface SpellSlotMetersProps {
  slots: SpellSlots[];
  pact: PactBlock | null;
  arcana: SpellSlots[];
  slotsArePactMagic: boolean;
  busy: boolean;
  onExpend: (level: number) => void;
  onRestore: (level: number) => void;
}

interface MeterSpec {
  level: number;
  remaining: number;
  total: number;
  tone: "arcane" | "gold";
  label: string;
  onExpend?: () => void;
  onRestore: () => void;
  expendTitle?: string;
  restoreTitle: string;
}

interface GroupSpec {
  key: string;
  heading: ReactNode;
  meters: MeterSpec[];
}

function pactMagicSlotsHeading() {
  return (
    <>
      Pact Magic{" "}
      <span className="font-normal normal-case tracking-normal text-parchment-600">
        — recharges on a short rest
      </span>
    </>
  );
}

type Handlers = Pick<SpellSlotMetersProps, "onExpend" | "onRestore">;

function slotsGroup(
  slots: SpellSlots[],
  slotsArePactMagic: boolean,
  { onExpend, onRestore }: Handlers,
): GroupSpec {
  return {
    key: "slots",
    heading: slotsArePactMagic ? pactMagicSlotsHeading() : "Spell Slots",
    meters: slots.map((slot) => ({
      level: slot.level,
      remaining: slot.total - slot.used,
      total: slot.total,
      tone: "arcane",
      label: `Level ${slot.level} slots remaining`,
      onExpend: () => onExpend(slot.level),
      onRestore: () => onRestore(slot.level),
      expendTitle: `Expend a level ${slot.level} slot`,
      restoreTitle: `Restore a level ${slot.level} slot`,
    })),
  };
}

function pactGroup(pact: PactBlock, { onExpend, onRestore }: Handlers): GroupSpec {
  return {
    key: "pact",
    heading: (
      <>
        Pact Magic{" "}
        <span className="font-normal normal-case tracking-normal text-parchment-600">
          — level {pact.slotLevel}, recharges on a short rest
        </span>
      </>
    ),
    meters: [{
      level: pact.slotLevel,
      remaining: pact.count - pact.used,
      total: pact.count,
      tone: "arcane",
      label: `Pact Magic level ${pact.slotLevel} slots remaining`,
      onExpend: () => onExpend(pact.slotLevel),
      onRestore: () => onRestore(pact.slotLevel),
      expendTitle: `Expend a Pact Magic (level ${pact.slotLevel}) slot`,
      restoreTitle: `Restore a Pact Magic (level ${pact.slotLevel}) slot`,
    }],
  };
}

function arcanaGroup(arcana: SpellSlots[], { onRestore }: Handlers): GroupSpec {
  return {
    key: "arcana",
    heading: (
      <>
        Mystic Arcanum{" "}
        <span className="font-normal normal-case tracking-normal text-parchment-600">
          — one cast each per long rest
        </span>
      </>
    ),
    // Arcanum charges have no manual expend — only restore (undo a mis-cast).
    meters: arcana.map((charge) => ({
      level: charge.level,
      remaining: charge.total - charge.used,
      total: charge.total,
      tone: "gold",
      label: `Level ${charge.level} Mystic Arcanum`,
      onRestore: () => onRestore(charge.level),
      restoreTitle: `Restore the level ${charge.level} Mystic Arcanum`,
    })),
  };
}

// Assemble the merged-slot, dedicated Pact Magic, and Mystic Arcanum groups.
function buildGroups(props: SpellSlotMetersProps): GroupSpec[] {
  const groups: GroupSpec[] = [];
  if (props.slots.length > 0) groups.push(slotsGroup(props.slots, props.slotsArePactMagic, props));
  if (props.pact) groups.push(pactGroup(props.pact, props));
  if (props.arcana.length > 0) groups.push(arcanaGroup(props.arcana, props));
  return groups;
}

function SlotMeter({ meter, busy }: { meter: MeterSpec; busy: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-parchment-600">
        <span className="font-medium">Level {meter.level}</span>
        <span className="tabular-nums">{meter.remaining}/{meter.total}</span>
      </div>
      <MeterBar current={meter.remaining} max={meter.total} tone={meter.tone} label={meter.label} />
      <div className="mt-1.5 flex gap-1">
        {meter.onExpend && (
          <button
            type="button"
            disabled={busy || meter.remaining === 0}
            onClick={meter.onExpend}
            className="flex-1 rounded bg-arcane-100 py-0.5 text-[11px] font-semibold text-arcane-700 hover:bg-arcane-200 disabled:opacity-30"
            title={meter.expendTitle}
          >
            − use
          </button>
        )}
        <button
          type="button"
          disabled={busy || meter.remaining === meter.total}
          onClick={meter.onRestore}
          className="flex-1 rounded bg-arcane-100 py-0.5 text-[11px] font-semibold text-arcane-700 hover:bg-arcane-200 disabled:opacity-30"
          title={meter.restoreTitle}
        >
          + restore
        </button>
      </div>
    </div>
  );
}

export default function SpellSlotMeters(props: SpellSlotMetersProps) {
  return (
    <>
      {buildGroups(props).map((group) => (
        <div key={group.key}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            {group.heading}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {group.meters.map((meter) => (
              <SlotMeter key={meter.level} meter={meter} busy={props.busy} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
