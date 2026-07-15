// Spell-slot / Pact Magic / Mystic Arcanum pip blocks. A filled pip is an
// available slot (click to expend); a spent pip clicks to restore.
import type { ReactNode } from "react";

import { slotOrdinal } from "@/lib/spellMeta";
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

const PIP_FILL: Record<MeterSpec["tone"], string> = {
  arcane: "bg-arcane-500 border-arcane-700",
  gold: "bg-gold-400 border-gold-700",
};
const PIP_BASE = "h-3.5 w-3.5 rounded-full border transition-colors disabled:opacity-40";
const PIP_SPENT = "bg-parchment-100 border-parchment-300";

function SlotMeter({ meter, busy }: { meter: MeterSpec; busy: boolean }) {
  const pips = Array.from({ length: meter.total }, (_, i) => {
    if (i >= meter.remaining) {
      return (
        <button
          key={i}
          type="button"
          data-testid="slot-pip"
          disabled={busy}
          onClick={meter.onRestore}
          title={meter.restoreTitle}
          aria-label={meter.restoreTitle}
          className={`${PIP_BASE} ${PIP_SPENT} hover:border-parchment-400`}
        />
      );
    }
    if (meter.onExpend) {
      return (
        <button
          key={i}
          type="button"
          data-testid="slot-pip"
          disabled={busy}
          onClick={meter.onExpend}
          title={meter.expendTitle}
          aria-label={meter.expendTitle}
          className={`${PIP_BASE} ${PIP_FILL[meter.tone]}`}
        />
      );
    }
    // Available Mystic Arcanum charge — no manual expend affordance.
    return (
      <span key={i} data-testid="slot-pip" aria-hidden="true" className={`${PIP_BASE} ${PIP_FILL[meter.tone]}`} />
    );
  });

  return (
    <div className="flex items-center gap-3">
      <span className="w-10 shrink-0 text-[10px] font-bold uppercase tracking-wide text-parchment-500">
        {slotOrdinal(meter.level)}
      </span>
      <span className="flex flex-wrap gap-1.5">{pips}</span>
      <span className="ml-auto text-[11px] tabular-nums text-parchment-500">
        {meter.remaining} / {meter.total} left
      </span>
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
          <div className="flex flex-col gap-2">
            {group.meters.map((meter) => (
              <SlotMeter key={meter.level} meter={meter} busy={props.busy} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
