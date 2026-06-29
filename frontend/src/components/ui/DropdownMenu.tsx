import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

interface DropdownMenuProps {
  trigger: ReactNode;
  label: string;
  children: (close: () => void) => ReactNode;
  align?: "right" | "left";
  className?: string;
}

// Owned-trigger popup menu: arbitrary render-prop children, keyboard nav driven
// by a live `[role="menuitem"]` query so presentational rows are skipped for free.
export default function DropdownMenu({
  trigger,
  label,
  children,
  align = "right",
  className = "",
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function items(): HTMLElement[] {
    if (!panelRef.current) return [];
    return Array.from(panelRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  }

  function setRovingTabIndex(activeIndex: number) {
    items().forEach((item, i) => {
      item.tabIndex = i === activeIndex ? 0 : -1;
    });
  }

  useEffect(() => {
    if (!open) return;
    const list = items();
    list.forEach((item, i) => {
      item.tabIndex = i === 0 ? 0 : -1;
    });
    list[0]?.focus();

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function handleMouseDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleMouseDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [open]);

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function handlePanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    if (list.length === 0) return;
    const current = list.indexOf(document.activeElement as HTMLElement);
    let next = current;

    if (e.key === "ArrowDown") {
      next = (current + 1) % list.length;
    } else if (e.key === "ArrowUp") {
      next = (current - 1 + list.length) % list.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = list.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    setRovingTabIndex(next);
    list[next]?.focus();
  }

  return (
    <div ref={wrapperRef} className={`relative inline-block ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleTriggerKeyDown}
        className="flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600"
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          tabIndex={-1}
          onKeyDown={handlePanelKeyDown}
          className={`absolute ${align === "left" ? "left-0" : "right-0"} z-10 mt-1 min-w-[12rem] rounded-card border border-parchment-200 bg-parchment-50 shadow-raised`}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
