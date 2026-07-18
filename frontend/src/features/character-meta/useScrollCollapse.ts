import { useEffect, useRef, useState } from "react";

/**
 * Collapse-on-scroll for the mobile sheet header (#1026). Watches a zero-height
 * sentinel at the top of the panel scroller; once it scrolls out of view the
 * header shrinks to a single bar. Desktop's container doesn't scroll, so the
 * sentinel always intersects and `collapsed` stays false there.
 */
export function useScrollCollapse() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCollapsed(!entry.isIntersecting),
      { root, threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return { scrollRef, sentinelRef, collapsed };
}
