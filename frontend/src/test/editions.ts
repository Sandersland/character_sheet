import { getQueryClient } from "@/api/queryClient";
import { catalogKeys } from "@/api/queryKeys";
import type { EditionOption, EditionsResponse } from "@/types/character";

/** The two rows GET /api/editions serves (#1436), verbatim off the wire. */
// fallow-ignore-next-line code-duplication -- a wire fixture must state the exact rows the server sends; its clone of the backend copy tables IS the assertion, and editions.test.ts pins the real response against the same values
export const SERVED_EDITIONS: EditionOption[] = [
  {
    key: "EDITION_2024",
    label: "2024 rules",
    description: "The current rulebooks — what most new tables are running.",
  },
  {
    key: "EDITION_2014",
    label: "2014 rules",
    description: "The original 5th edition rulebooks, sometimes called \"classic\" 5e.",
    // #1506: "Monk rules" dropped — the 2014 Monk shipped in full (epic #1313).
    unavailableReason:
      "Not available yet — the 2014 feats, fighting styles, and caster model haven't shipped, and a character's edition can't be changed later.",
  },
];

/** Seeds the editions cache so useEditions resolves with no fetch — the
 *  staleTime: Infinity entry is permanently fresh, so the query never fires and
 *  no test needs a fetchEditions mock merely to render a picker.
 *
 *  Pass `editions`/`defaultEdition` to make display order and the default
 *  DISAGREE — the scrambled-order fixture no positional implementation can
 *  satisfy. */
export function seedEditions(overrides: Partial<EditionsResponse> = {}): void {
  getQueryClient().setQueryData<EditionsResponse>(catalogKeys.editions(), {
    defaultEdition: "EDITION_2024",
    editions: SERVED_EDITIONS,
    ...overrides,
  });
}
