import { useState, useCallback } from "react";
import { resolverFor, type ActionResolver } from "@/features/session/actionResolvers";
import type { AvailableAction } from "@/types/character";

export interface ResolutionContext {
  spellId?: string;
}

export interface ActiveResolution {
  resolver: ActionResolver;
  context?: ResolutionContext;
}

export interface ActiveResolutionState {
  activeResolution: ActiveResolution | null;
  // `action` is optional context for resolverFor's row-driven fallback — omit for static-key callers; a row-driven kind that needs an open sheet must pass it, since only the served AvailableAction lets resolverFor synthesize its resolver.
  openResolution: (key: string, context?: ResolutionContext, action?: AvailableAction) => void;
  closeResolution: () => void;
}

export function useActiveResolution(): ActiveResolutionState {
  const [activeResolution, setActiveResolution] = useState<ActiveResolution | null>(null);

  const openResolution = useCallback((key: string, context?: ResolutionContext, action?: AvailableAction) => {
    const resolver = resolverFor(key, action);
    if (!resolver) return;
    setActiveResolution(context ? { resolver, context } : { resolver });
  }, []);

  const closeResolution = useCallback(() => {
    setActiveResolution(null);
  }, []);

  return { activeResolution, openResolution, closeResolution };
}
