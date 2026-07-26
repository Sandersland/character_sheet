import type { RulesEdition } from "@character-sheet/shared-types";

// Plain-language copy for the two supported rules editions (#1286) — players
// say "2024 rules" or "the new books", never "SRD 5.2" (the actual citation
// name lives only in backend rule comments, never in UI text).
export const RULES_EDITIONS: readonly RulesEdition[] = ["EDITION_2024", "EDITION_2014"];

export const EDITION_LABELS: Record<RulesEdition, string> = {
  EDITION_2024: "2024 rules",
  EDITION_2014: "2014 rules",
};

export const EDITION_DESCRIPTIONS: Record<RulesEdition, string> = {
  EDITION_2024: "The current rulebooks — what most new tables are running.",
  EDITION_2014: "The original 5th edition rulebooks, sometimes called \"classic\" 5e.",
};
