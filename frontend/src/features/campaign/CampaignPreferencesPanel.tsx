import { useState } from "react";

import { updateCampaignPreferences } from "@/api/client";
import Card from "@/components/ui/Card";
import type { CampaignPreferences, Character } from "@/types/character";

interface CampaignPreferencesPanelProps {
  character: Character;
  onUpdate: (c: Character) => void;
}

// One labeled toggle row. Container + read/write wiring only — the underlying
// behaviors (DM sharing #116; party-target healing consent #462) live elsewhere.
interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

function ToggleRow({ label, hint, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-parchment-800">{label}</span>
        <span className="text-xs text-parchment-600">{hint}</span>
      </span>
      <input
        type="checkbox"
        aria-label={label}
        className="mt-1 size-4 accent-arcane-600"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

// Campaign-scoped play preferences (#537). Rendered only when the character is
// attached to a campaign (the caller gates on character.campaignId). Reads the
// serialized prefs and writes each flag through the api/client helper.
export default function CampaignPreferencesPanel({
  character,
  onUpdate,
}: CampaignPreferencesPanelProps) {
  const prefs: CampaignPreferences = character.campaignPreferences ?? {
    shareWithDm: false,
    autoFriendlyHealing: false,
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Partial<CampaignPreferences>) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCampaignPreferences(character.id, patch);
      onUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update preferences");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Campaign preferences" className="p-0">
      <div className="divide-y divide-parchment-200">
        <ToggleRow
          label="Share sheet with DM"
          hint="Let your campaign's DM view this character's sheet."
          checked={prefs.shareWithDm}
          disabled={saving}
          onChange={(next) => save({ shareWithDm: next })}
        />
        <ToggleRow
          label="Allow party members to heal my sheet"
          hint="Let allies in this campaign apply healing spells to your sheet during a session."
          checked={prefs.autoFriendlyHealing}
          disabled={saving}
          onChange={(next) => save({ autoFriendlyHealing: next })}
        />
      </div>
      {error && <p className="px-4 pb-3 text-xs text-garnet-700">{error}</p>}
    </Card>
  );
}
