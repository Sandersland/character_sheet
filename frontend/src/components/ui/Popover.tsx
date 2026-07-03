import { useEffect, useRef, useState, type ReactNode } from "react";

interface PopoverProps {
  trigger: ReactNode;
  label: string;
  children: ReactNode;
  align?: "right" | "left";
  className?: string;
  triggerClassName?: string;
}

// Owned-trigger disclosure popover for read-only detail panels (role=dialog);
// unlike DropdownMenu it has no menuitem semantics or roving focus.
export default function Popover({
  trigger,
  label,
  children,
  align = "left",
  className = "",
  triggerClassName = "",
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
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

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-garnet-600 ${triggerClassName}`}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className={`absolute ${align === "left" ? "left-0" : "right-0"} z-10 mt-1 min-w-[12rem] rounded-card border border-parchment-200 bg-parchment-50 shadow-raised focus:outline-none`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
