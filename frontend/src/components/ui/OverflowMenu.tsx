import { MoreVertical } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { useDismissable } from "@/hooks/useDismissable";

interface OverflowMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
  /**
   * When true the item is shown greyed and its activation is a no-op. Uses
   * aria-disabled (not the native `disabled` attribute) so the item stays
   * focusable and roving-focus keyboard nav still passes over it (WAI-ARIA).
   */
  disabled?: boolean;
}

interface OverflowMenuProps {
  items: OverflowMenuItem[];
  label?: string;
  className?: string;
}

// Icon-only kebab menu-button: WAI-ARIA menu pattern, roving tabindex, focus returns to trigger.
export default function OverflowMenu({ items, label, className = "" }: OverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveTo(index: number) {
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  }

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    itemRefs.current[0]?.focus();
  }, [open]);

  useDismissable({
    open,
    wrapperRef,
    onEscape: close,
    onOutsideClick: () => setOpen(false),
  });

  function select(item: OverflowMenuItem) {
    if (item.disabled) return;
    item.onSelect();
    close();
  }

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function handleItemKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const count = items.length;
    let next = index;

    if (e.key === "ArrowDown") {
      next = (index + 1) % count;
    } else if (e.key === "ArrowUp") {
      next = (index - 1 + count) % count;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = count - 1;
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(items[index]);
      return;
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    } else {
      return;
    }

    e.preventDefault();
    moveTo(next);
  }

  return (
    <div ref={wrapperRef} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ?? "More actions"}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        className="flex h-7 w-7 items-center justify-center rounded-control text-lg leading-none text-parchment-600 transition-colors hover:bg-parchment-200 hover:text-parchment-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
      >
        <MoreVertical aria-hidden="true" className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 min-w-[10rem] overflow-hidden rounded-card border border-parchment-200 bg-parchment-50 py-1 shadow-raised"
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              ref={(el) => { itemRefs.current[i] = el; }}
              tabIndex={i === activeIndex ? 0 : -1}
              onClick={() => select(item)}
              onKeyDown={(e) => handleItemKeyDown(e, i)}
              className={[
                "block w-full px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline-none",
                item.disabled
                  ? "cursor-not-allowed opacity-50 focus-visible:bg-parchment-100"
                  : "focus-visible:bg-parchment-100 hover:bg-parchment-100",
                item.separatorBefore ? "border-t border-parchment-200" : "",
                item.danger ? "text-garnet-700" : "text-parchment-800",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
