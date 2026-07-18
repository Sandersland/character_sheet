import { Plus } from "lucide-react";

interface AddItemFabProps {
  onClick: () => void;
}

// Mobile add-item FAB (#1029): a 52px thumb-reach target floating above the
// bottom nav, respecting the home-indicator safe area.
export default function AddItemFab({ onClick }: AddItemFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add item"
      className="fixed right-4 z-40 flex size-[52px] items-center justify-center rounded-full bg-garnet-700 text-parchment-50 shadow-raised transition-colors hover:bg-garnet-800 md:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }}
    >
      <Plus aria-hidden="true" className="size-6" />
    </button>
  );
}
