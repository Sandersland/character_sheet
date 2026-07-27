// The precondition gate for the "new character" entry point (#1286): resolves
// which campaign (if any) a character is being created for, and therefore its
// rulesEdition, BEFORE the creation ceremony's identity step can be reached.
// Picking a campaign displays its inherited edition; "Solo" surfaces the
// picker instead. Deliberately NOT a ceremony step (creationSteps) — a step
// that auto-skips whenever a campaign is picked is a step built and maintained
// for the uncommon case (settled 2026-07-26, issue #1286 decisions).

import { useEffect, useState } from "react";

import type { RulesEdition } from "@character-sheet/shared-types";

import EditionPicker from "@/components/ui/EditionPicker";
import Spinner from "@/components/ui/Spinner";
import { CeremonyCard, CeremonyStage, GHOST_BTN } from "@/features/ceremony/CeremonyShell";
import { fetchCampaigns } from "@/api/client";
import { useRovingRadioGroup } from "@/hooks/useRovingRadioGroup";
import { EDITION_LABELS, RULES_EDITIONS } from "@/lib/editionCopy";
import type { Campaign } from "@/types/character";

interface CreationEntryGateProps {
  onResolved: (choice: {
    campaignId: string | null;
    /** The chosen campaign's display name, so Review can echo it without a
     *  second fetch — null for solo. */
    campaignName: string | null;
    rulesEdition: RulesEdition;
  }) => void;
  /** Leave the page instead of resolving (mirrors the ceremony's own Cancel). */
  onCancel?: () => void;
}

// Sentinel campaign-choice value meaning "no campaign" — a real campaign id
// can never be the empty string, so this never collides with one.
const SOLO = "";

const CARD_BASE =
  "flex flex-col gap-1 rounded border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-garnet-400";
const CARD_SELECTED = "border-garnet-600 bg-parchment-50 ring-2 ring-garnet-50";
const CARD_IDLE = "border-parchment-300 bg-parchment-50 hover:border-garnet-400";
const PRIMARY_BTN =
  "min-h-11 rounded-control border border-garnet-surface-hover bg-garnet-surface px-5 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover";

// One "which campaign" card per membership + a leading Solo option. Extracted
// so CreationEntryGate's own render stays a plain if/else over load state.
function CampaignChoiceCards({
  campaigns,
  choice,
  onChoose,
}: {
  campaigns: Campaign[];
  choice: string;
  onChoose: (id: string) => void;
}) {
  const options = [{ id: SOLO, label: "Solo / no campaign" }, ...campaigns.map((c) => ({ id: c.id, label: c.name }))];
  const checkedIndex = options.findIndex((o) => o.id === choice);
  const { itemRef, tabIndexFor, keyDownFor } = useRovingRadioGroup(options.length, checkedIndex, (index) =>
    onChoose(options[index].id),
  );

  return (
    <div role="radiogroup" aria-label="Which campaign is this for?" className="grid gap-3 sm:grid-cols-2">
      {options.map((opt, i) => {
        const selected = opt.id === choice;
        return (
          <button
            key={opt.id || "solo"}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            tabIndex={tabIndexFor(i)}
            ref={itemRef(i)}
            onClick={() => onChoose(opt.id)}
            onKeyDown={keyDownFor(i)}
            className={`${CARD_BASE} ${selected ? CARD_SELECTED : CARD_IDLE}`}
          >
            <span className="font-display text-base font-semibold text-parchment-900">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// The edition sub-section: a picker for Solo, a read-only inherited line for a
// chosen campaign — either way, the irreversibility notice is always shown so
// it's stated at the moment of choosing, never discovered later (#1286).
function EditionSection({
  campaign,
  soloEdition,
  onSoloEditionChange,
}: {
  campaign: Campaign | undefined;
  soloEdition: RulesEdition;
  onSoloEditionChange: (edition: RulesEdition) => void;
}) {
  return (
    <div className="mt-5">
      {campaign ? (
        <p className="text-sm text-parchment-700">
          This character will use the{" "}
          <span className="font-semibold text-parchment-900">{EDITION_LABELS[campaign.rulesEdition]}</span> —
          inherited from {campaign.name}.
        </p>
      ) : (
        <>
          <p className="mb-2 text-sm font-semibold text-parchment-800">Which rules is this character using?</p>
          <EditionPicker value={soloEdition} onChange={onSoloEditionChange} label="Rules edition" />
        </>
      )}
      <p className="mt-3 text-xs text-parchment-500">This can't be changed later — a character's rules edition is locked in at creation.</p>
    </div>
  );
}

export default function CreationEntryGate({ onResolved, onCancel }: CreationEntryGateProps) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  // Bumped by "Try again" to re-run the fetch effect below.
  const [retryToken, setRetryToken] = useState(0);
  const [choice, setChoice] = useState<string>(SOLO);
  const [soloEdition, setSoloEdition] = useState<RulesEdition>(RULES_EDITIONS[0]);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    fetchCampaigns()
      .then((list) => active && setCampaigns(list))
      .catch(() => active && setLoadError(true));
    return () => {
      active = false;
    };
  }, [retryToken]);

  // #1286: the choice is irreversible, so a fetch failure must never silently
  // fall through to "no campaigns" — that would steer a player who meant to
  // join a campaign into picking an edition for a character that can't move.
  if (loadError) {
    return (
      <CeremonyStage layout="page">
        <CeremonyCard className="px-6 py-10 text-center">
          <h1 className="font-display text-2xl font-semibold text-parchment-900">Couldn't check your campaigns</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-parchment-600">
            This choice can't be undone once you continue, so we won't guess — check your connection and try
            again.
          </p>
          <button
            type="button"
            onClick={() => setRetryToken((t) => t + 1)}
            className={`${PRIMARY_BTN} mt-4`}
          >
            Try again
          </button>
        </CeremonyCard>
      </CeremonyStage>
    );
  }

  if (campaigns === null) {
    return (
      <CeremonyStage layout="page">
        <CeremonyCard className="flex items-center justify-center px-6 py-10">
          <Spinner variant="inline" />
        </CeremonyCard>
      </CeremonyStage>
    );
  }

  const chosenCampaign = campaigns.find((c) => c.id === choice);

  function handleContinue() {
    onResolved({
      campaignId: chosenCampaign ? chosenCampaign.id : null,
      campaignName: chosenCampaign ? chosenCampaign.name : null,
      rulesEdition: chosenCampaign ? chosenCampaign.rulesEdition : soloEdition,
    });
  }

  return (
    <CeremonyStage layout="page">
      <CeremonyCard className="px-5 py-6 sm:px-8">
        <h1 className="font-display text-2xl font-semibold text-parchment-900">Who's this character for?</h1>
        <p className="mt-1 text-sm text-parchment-600">
          Every catalog the forge reads — species, classes, backgrounds, feats, spells — depends on the rules
          edition, so it has to be settled first.
        </p>

        {campaigns.length > 0 && (
          <div className="mt-5">
            <CampaignChoiceCards campaigns={campaigns} choice={choice} onChoose={setChoice} />
          </div>
        )}

        <EditionSection campaign={chosenCampaign} soloEdition={soloEdition} onSoloEditionChange={setSoloEdition} />

        <footer className="mt-6 flex items-center justify-between gap-3 border-t border-parchment-200 pt-4">
          {onCancel ? (
            <button type="button" onClick={onCancel} className={GHOST_BTN}>
              Cancel
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={handleContinue} className={PRIMARY_BTN}>
            Continue ›
          </button>
        </footer>
      </CeremonyCard>
    </CeremonyStage>
  );
}
