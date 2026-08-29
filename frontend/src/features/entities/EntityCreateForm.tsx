import { useEffect, useState } from "react";

import EntityPortraitField from "@/features/entities/EntityPortraitField";
import { useEntityCreate } from "@/features/entities/useEntityCreate";
import { ENTITY_TYPE_OPTIONS } from "@/lib/mentions";
import type { EntityType } from "@/types/character";

interface EntityCreateFormProps {
  campaignId: string;
  isOwner: boolean;
  onClose: () => void;
}

const inputCls =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
const labelCls = "block text-xs font-semibold text-parchment-700";

export default function EntityCreateForm({ campaignId, isOwner, onClose }: EntityCreateFormProps) {
  const [type, setType] = useState<EntityType>("NPC");
  const [name, setName] = useState("");
  const [aliases, setAliases] = useState("");
  const [notes, setNotes] = useState("");
  const [startHidden, setStartHidden] = useState(false);
  // Portrait staging and create/upload sequencing live in useEntityCreate; portrait writes are a campaign-OWNER act.
  const { busy, formError, portraitFile, setPortraitFile, createdEntity, submit } = useEntityCreate(
    campaignId,
    isOwner,
    onClose,
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function handleCreate() {
    if (!createdEntity && name.trim() === "") return;
    void submit({ type, name, aliases, notes, startHidden });
  }

  return (
    <div className="flex flex-col gap-3 rounded-control border border-parchment-200 bg-parchment-100 p-3">
      {formError && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
          {formError}
        </p>
      )}
      <div>
        <label className={labelCls} htmlFor="codex-entity-name">
          Name *
        </label>
        <input
          id="codex-entity-name"
          className={inputCls}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="codex-entity-type">
          Type
        </label>
        <select
          id="codex-entity-type"
          className={inputCls}
          value={type}
          onChange={(e) => setType(e.target.value as EntityType)}
        >
          {ENTITY_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls} htmlFor="codex-entity-aliases">
          Aliases (comma-separated)
        </label>
        <input
          id="codex-entity-aliases"
          className={inputCls}
          value={aliases}
          onChange={(e) => setAliases(e.target.value)}
        />
      </div>
      {isOwner && (
        <EntityPortraitField
          file={portraitFile}
          pending={busy}
          onSelect={setPortraitFile}
          onRemove={() => setPortraitFile(null)}
        />
      )}
      <div>
        <label className={labelCls} htmlFor="codex-entity-notes">
          Notes
        </label>
        <textarea
          id="codex-entity-notes"
          rows={3}
          className={`${inputCls} resize-y`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      {isOwner && (
        <label className="flex items-center gap-2 text-xs font-semibold text-parchment-700">
          <input
            type="checkbox"
            checked={startHidden}
            onChange={(e) => setStartHidden(e.target.checked)}
          />
          Start hidden from players
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || (!createdEntity && name.trim() === "")}
          onClick={handleCreate}
          className="rounded-control bg-garnet-soft-surface px-3 py-1.5 text-xs font-semibold text-garnet-on-surface hover:bg-garnet-soft-surface-hover disabled:opacity-40"
        >
          {busy ? "Creating…" : createdEntity ? "Retry upload" : "Create entity"}
        </button>
      </div>
    </div>
  );
}
