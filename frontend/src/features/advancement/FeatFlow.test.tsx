import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import FeatFlow from "@/features/advancement/FeatFlow";
import { FEAT_VIEW_INITIAL } from "@/features/advancement/featView";
import type { FeatCatalog } from "@/features/advancement/useFeatCatalog";
import type { CatalogFeat } from "@/types/character";

const noop = () => {};

const FEAT: CatalogFeat = {
  id: "alert",
  name: "Alert",
  description: "Always on the lookout.",
  abilityOptions: [],
  abilityIncrease: 0,
  improvements: [],
};

function stubCatalog(feats: CatalogFeat[]): FeatCatalog {
  return {
    catalog: feats,
    error: null,
    showSpinner: false,
    ensureFetched: noop,
    filter: () => feats,
  };
}

const customDraft = {
  form: { name: "", description: "", abilityChoice: "", skillChoice: "" },
  setField: noop,
  reset: noop,
} as never;

describe("FeatFlow catalog list", () => {
  it("pads the scroll container so Select buttons clear the scrollbar", () => {
    render(
      <FeatFlow
        currentScores={{}}
        skillNames={[]}
        busy={false}
        feats={stubCatalog([FEAT])}
        view={FEAT_VIEW_INITIAL}
        dispatchView={noop}
        custom={customDraft}
        onSubmit={noop}
      />
    );

    const list = screen.getByRole("list");
    expect(list.className).toContain("pr-3");
  });
});
