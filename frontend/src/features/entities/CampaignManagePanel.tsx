import { useMemo, useState } from "react";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { VenetianMask } from "@/components/ui/icons";
import { executeEntityMerge, prepareEntityMerge, unmergeEntityMerge } from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import { primeCampaignMerges, useCampaignMerges } from "@/hooks/useCampaignMerges";
import type { CampaignEntity, CampaignEntityMerge } from "@/types/character";

interface CampaignManagePanelProps {
  campaignId: string;
}

const inputCls =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
const labelCls = "block text-xs font-semibold text-parchment-700";

// Owner-only Manage tab (#379): the DM's identity-merge administration. The
// entity list + create/reveal/hide/delete now live solely in the Codex (#523);
// this panel keeps only the secret identity-merge workflow.
export default function CampaignManagePanel({ campaignId }: CampaignManagePanelProps) {
  const { entities } = useCampaignEntities(campaignId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { merges } = useCampaignMerges(campaignId);
  const [mergingOpen, setMergingOpen] = useState(false);
  const [mergedId, setMergedId] = useState("");
  const [survivorId, setSurvivorId] = useState("");
  const [mergeNote, setMergeNote] = useState("");

  const nameById = useMemo(() => new Map(entities.map((e) => [e.id, e.name])), [entities]);
  const sortedMerges = useMemo(
    () => [...merges].sort((a, b) => a.preparedAt.localeCompare(b.preparedAt)),
    [merges],
  );

  function replaceEntity(updated: CampaignEntity) {
    primeCampaignEntities(
      campaignId,
      entities.map((e) => (e.id === updated.id ? updated : e)),
    );
  }

  async function handlePrepareMerge() {
    if (!mergedId || !survivorId || mergedId === survivorId) return;
    setBusyId("merge-new");
    setError(null);
    try {
      const created = await prepareEntityMerge(campaignId, {
        mergedEntityId: mergedId,
        survivorEntityId: survivorId,
        note: mergeNote.trim() || undefined,
      });
      primeCampaignMerges(campaignId, [...merges, created]);
      setMergedId("");
      setSurvivorId("");
      setMergeNote("");
      setMergingOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to prepare merge.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleExecuteMerge(m: CampaignEntityMerge) {
    const mergedName = nameById.get(m.mergedEntityId) ?? "this identity";
    const survivorName = nameById.get(m.survivorEntityId) ?? "the survivor";
    if (
      !window.confirm(
        `Reveal ${mergedName} to be ${survivorName}? This publishes the link to all players and reveals ${survivorName} if it is hidden.`,
      )
    ) {
      return;
    }
    setBusyId(m.id);
    setError(null);
    try {
      const updated = await executeEntityMerge(campaignId, m.id);
      primeCampaignMerges(
        campaignId,
        merges.map((x) => (x.id === m.id ? updated : x)),
      );
      // The survivor may have been auto-revealed — reflect it in the entity list.
      const survivor = entities.find((e) => e.id === m.survivorEntityId);
      if (survivor && survivor.visibility === "HIDDEN") {
        replaceEntity({ ...survivor, visibility: "REVEALED" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute merge.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnmerge(m: CampaignEntityMerge) {
    const mergedName = nameById.get(m.mergedEntityId) ?? "this identity";
    const survivorName = nameById.get(m.survivorEntityId) ?? "the survivor";
    if (!window.confirm(`Unmerge ${mergedName} from ${survivorName}? They become independent again.`)) {
      return;
    }
    setBusyId(m.id);
    setError(null);
    try {
      await unmergeEntityMerge(campaignId, m.id);
      primeCampaignMerges(
        campaignId,
        merges.filter((x) => x.id !== m.id),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unmerge.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title="Identity merges"
      headingLevel={2}
      titleAccessory={
        <button
          type="button"
          aria-label="Open prepare merge form"
          aria-expanded={mergingOpen}
          disabled={entities.length < 2}
          onClick={() => setMergingOpen((o) => !o)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
        >
          <VenetianMask aria-hidden="true" className="h-3.5 w-3.5" />
          Prepare merge
        </button>
      }
      className="p-4"
    >
      <div className="flex flex-col gap-3 p-4">
        {error && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
            {error}
          </p>
        )}

        <p className="text-xs text-parchment-600">
          Secretly link an old identity to its true self, then reveal it when the time is right.
        </p>

        {mergingOpen && (
          <div className="flex flex-col gap-2 rounded-control border border-parchment-200 bg-parchment-100 p-3">
            <div>
              <label className={labelCls} htmlFor="merge-old">
                Old identity *
              </label>
              <select
                id="merge-old"
                className={inputCls}
                value={mergedId}
                onChange={(e) => setMergedId(e.target.value)}
              >
                <option value="">Select…</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="merge-survivor">
                Revealed to be *
              </label>
              <select
                id="merge-survivor"
                className={inputCls}
                value={survivorId}
                onChange={(e) => setSurvivorId(e.target.value)}
              >
                <option value="">Select…</option>
                {entities
                  .filter((e) => e.id !== mergedId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="merge-note">
                Note
              </label>
              <input
                id="merge-note"
                className={inputCls}
                value={mergeNote}
                onChange={(e) => setMergeNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busyId === "merge-new" || !mergedId || !survivorId || mergedId === survivorId}
                onClick={handlePrepareMerge}
                className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
              >
                {busyId === "merge-new" ? "Preparing…" : "Prepare merge"}
              </button>
            </div>
          </div>
        )}

        {sortedMerges.length > 0 && (
          <ul className="flex flex-col divide-y divide-parchment-200">
            {sortedMerges.map((m) => {
              const prepared = m.status === "PREPARED";
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-sm text-parchment-900">
                    {nameById.get(m.mergedEntityId) ?? "Unknown"}{" "}
                    <span className="text-parchment-500">→</span>{" "}
                    {nameById.get(m.survivorEntityId) ?? "Unknown"}
                  </span>
                  <Badge tone="neutral">
                    {prepared ? (
                      <>
                        <VenetianMask aria-hidden="true" className="h-3 w-3" />
                        Secret
                      </>
                    ) : (
                      "✓ Revealed"
                    )}
                  </Badge>
                  <span className="ml-auto flex items-center gap-3">
                    {prepared && (
                      <button
                        type="button"
                        disabled={busyId === m.id}
                        onClick={() => handleExecuteMerge(m)}
                        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        Execute reveal
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => handleUnmerge(m)}
                      className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                    >
                      {prepared ? "Cancel" : "Unmerge"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
