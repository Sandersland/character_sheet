/**
 * JournalSection — interactive campaign-journal orchestrator. Owns its Card and
 * local UI state (add/edit/delete rows); the busy/error pair and the plain-REST
 * journal CRUD calls live in the shared useJournalMutations hook (also used by
 * CapturePalette), mirroring how InventoryList/SpellsSection own their surface.
 * Journal entries carry no mechanical effect, so there's no transaction/audit
 * pattern here — each call returns the full updated Character via onUpdate.
 *
 * Edit and delete are inline (an expand-in-place panel / an inline confirm row),
 * never a Modal — see CLAUDE.md on the inline-vs-Modal rule.
 */

import { useState } from "react";

import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { GiQuillInk, Lock } from "@/components/ui/icons";
import JournalEntryPanel, {
  type JournalEntryDraft,
} from "@/features/character-meta/JournalEntryPanel";
import MentionText from "@/features/journal/MentionText";
import { useJournalMutations } from "@/features/journal/useJournalMutations";
import { useCampaignEntities } from "@/hooks/useCampaignEntities";
import { formatJournalDate } from "@/lib/formatJournalDate";
import type { Character } from "@/types/character";

interface JournalSectionProps {
  character: Character;
  onUpdate: (character: Character) => void;
  /** Active session to stamp new notes with, when one is live. */
  sessionId?: string;
}

export default function JournalSection({ character, onUpdate, sessionId }: JournalSectionProps) {
  const entries = character.journal;
  const { byId } = useCampaignEntities(character.campaignId);

  const { busy, error, create, update, remove } = useJournalMutations(character.id, onUpdate);
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Render newest-first by the user-entered date. The API already orders by
  // date desc, but sort again defensively so an optimistic re-order can't
  // surprise the view.
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  async function handleAdd(draft: JournalEntryDraft) {
    if (await create({ ...draft, sessionId })) setAddPanelOpen(false);
  }

  async function handleEdit(entryId: string, draft: JournalEntryDraft) {
    if (await update(entryId, { body: draft.body, visibility: draft.visibility }))
      setEditingId(null);
  }

  async function handleDelete(entryId: string) {
    if (await remove(entryId)) setConfirmDeleteId(null);
  }

  return (
    <Card
      title="Journal"
      titleAccessory={
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setConfirmDeleteId(null);
            setAddPanelOpen((open) => !open);
          }}
          className="text-xs font-semibold text-garnet-700 hover:underline"
        >
          {addPanelOpen ? "Cancel" : "+ Add entry"}
        </button>
      }
      className="p-4"
    >
      <div className="flex flex-col gap-3">
        {error && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
            {error}
          </p>
        )}

        {addPanelOpen && (
          <JournalEntryPanel
            mode="add"
            busy={busy}
            campaignId={character.campaignId}
            onSubmit={handleAdd}
            onClose={() => setAddPanelOpen(false)}
          />
        )}

        {sortedEntries.length === 0 && !addPanelOpen ? (
          <EmptyState
            icon={<GiQuillInk />}
            title="Your journal is empty"
            description="Notes from your sessions will show up here."
            action={{ label: "+ Add entry", onClick: () => setAddPanelOpen(true) }}
          />
        ) : (
          <ul className="flex flex-col divide-y divide-parchment-200">
            {sortedEntries.map((entry) =>
              editingId === entry.id ? (
                <li key={entry.id} className="py-3">
                  <JournalEntryPanel
                    mode="edit"
                    initial={entry}
                    busy={busy}
                    campaignId={character.campaignId}
                    onSubmit={(draft) => handleEdit(entry.id, draft)}
                    onClose={() => setEditingId(null)}
                  />
                </li>
              ) : (
                <li key={entry.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <MentionText
                      body={entry.body}
                      entities={byId}
                      campaignId={character.campaignId}
                      className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-parchment-800"
                    />
                    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-parchment-600">
                      {entry.visibility === "PRIVATE" && (
                        <Lock
                          role="img"
                          aria-label="Private note"
                          className="h-3.5 w-3.5 text-parchment-500"
                        />
                      )}
                      {formatJournalDate(entry.date)}
                    </span>
                  </div>

                  {confirmDeleteId === entry.id ? (
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      <span className="text-garnet-700">Delete this entry?</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(entry.id)}
                        className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="font-semibold text-parchment-600 hover:underline"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="mt-2 flex gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setAddPanelOpen(false);
                          setConfirmDeleteId(null);
                          setEditingId(entry.id);
                        }}
                        className="font-semibold text-garnet-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setConfirmDeleteId(entry.id);
                        }}
                        className="font-semibold text-parchment-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </Card>
  );
}
