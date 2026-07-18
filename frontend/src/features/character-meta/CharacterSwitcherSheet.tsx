import { Check, ChevronRight, LayoutGrid, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";

import BottomSheet from "@/components/ui/BottomSheet";
import Spinner from "@/components/ui/Spinner";
import { useCharacterList } from "@/hooks/useCharacterList";
import { classSummary, isMulticlass } from "@/lib/multiclass";
import type { CharacterSummary } from "@/types/character";

interface CharacterSwitcherSheetProps {
  /** The sheet currently open — gets the check, taps to itself just close. */
  currentId: string;
  onClose: () => void;
}

// Garnet identity chip, matching the header avatar.
function Avatar({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control bg-gradient-to-br from-garnet-700 to-garnet-900 font-display text-base font-semibold text-parchment-50 shadow-raised">
      {name.charAt(0)}
    </span>
  );
}

// "Class Level" — CharacterSummary carries no HP, so the switcher shows the
// same class/level the list page does (multiclass folds per-class levels in).
function classLine(c: CharacterSummary): string {
  return isMulticlass(c.classes) ? classSummary(c.classes, { name: c.class }) : `${c.class} ${c.level}`;
}

/**
 * Mobile character switcher (#1027) — the immersive shell hides `AppHeader`, so
 * tapping the header identity opens this sheet as the route back out. Lists owned
 * characters (reusing the list-page query), plus "All characters" → the list and
 * "New character" → creation. Mis-taps cost nothing: it swipe-dismisses.
 */
export default function CharacterSwitcherSheet({ currentId, onClose }: CharacterSwitcherSheetProps) {
  const navigate = useNavigate();
  const { characters, error } = useCharacterList();

  function go(path: string) {
    onClose();
    navigate(path);
  }

  return (
    <BottomSheet title="Characters" subtitle="Switch sheet" onClose={onClose}>
      <div className="-mx-4">
        {characters === null && !error && <Spinner className="py-8" />}
        {error && (
          <p className="px-4 py-6 text-center text-sm text-parchment-500">
            Couldn&apos;t load characters. Check your connection.
          </p>
        )}

        {characters?.map((c) => {
          const current = c.id === currentId;
          return (
            <button
              key={c.id}
              type="button"
              aria-current={current ? "true" : undefined}
              onClick={() => (current ? onClose() : go(`/characters/${c.id}`))}
              className="pressable flex w-full items-center gap-3 divider-hairline px-4 py-2.5 text-left transition-colors hover:bg-parchment-100"
            >
              <Avatar name={c.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base font-semibold text-parchment-900">
                  {c.name}
                </span>
                <span className="block truncate text-[13px] tabular-nums text-parchment-600">{classLine(c)}</span>
              </span>
              {current ? (
                <Check className="h-5 w-5 flex-none text-vitality-600" aria-hidden />
              ) : (
                <ChevronRight className="h-[18px] w-[18px] flex-none text-parchment-400" aria-hidden />
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => go("/")}
          className="pressable flex w-full items-center gap-3 divider-hairline px-4 py-2.5 text-left transition-colors hover:bg-parchment-100"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control bg-parchment-100 text-parchment-600">
            <LayoutGrid className="h-[19px] w-[19px]" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-base font-semibold text-parchment-900">
              All characters
            </span>
            <span className="block truncate text-[13px] text-parchment-600">Manage, rename, archive</span>
          </span>
          <ChevronRight className="h-[18px] w-[18px] flex-none text-parchment-400" aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => go("/characters/new")}
          className="pressable flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-parchment-100"
        >
          <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control bg-arcane-100 text-arcane-700">
            <Plus className="h-[19px] w-[19px]" aria-hidden />
          </span>
          <span className="block font-display text-base font-semibold text-arcane-700">New character</span>
        </button>
      </div>
    </BottomSheet>
  );
}
