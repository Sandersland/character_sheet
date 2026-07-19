import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

/** Live `prefers-reduced-motion: reduce` state; degrades to false without
 *  matchMedia (SSR/old jsdom). Callers gate motion so reduce-motion users get an
 *  instant swap (#1083). */
export function usePrefersReducedMotion(): boolean {
  // getServerSnapshot returns false: no motion preference assumed pre-hydration.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
