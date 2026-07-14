import Card from "@/components/ui/Card";
import { ENTITY_TYPE_OPTIONS } from "@/lib/mentions";
import type { EntityType } from "@/types/character";

const inputCls =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
const labelCls = "block text-xs font-semibold text-parchment-700";

interface EntityForm {
  type: EntityType;
  setType: (v: EntityType) => void;
  name: string;
  setName: (v: string) => void;
  aliases: string;
  setAliases: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
}

// The article's inline edit state (#842) — swaps in for the header + lead.
export default function EntityEditForm({
  form,
  busy,
  onSave,
  onCancel,
}: {
  form: EntityForm;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <Card title="Edit entry" headingLevel={2}>
      <div className="flex flex-col gap-3 p-4">
        <div>
          <label className={labelCls} htmlFor="entity-name">
            Name *
          </label>
          <input
            id="entity-name"
            className={inputCls}
            value={form.name}
            onChange={(e) => form.setName(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="entity-type">
            Type
          </label>
          <select
            id="entity-type"
            className={inputCls}
            value={form.type}
            onChange={(e) => form.setType(e.target.value as EntityType)}
          >
            {ENTITY_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="entity-aliases">
            Aliases (comma-separated)
          </label>
          <input
            id="entity-aliases"
            className={inputCls}
            value={form.aliases}
            onChange={(e) => form.setAliases(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="entity-notes">
            Notes
          </label>
          <textarea
            id="entity-notes"
            rows={4}
            className={`${inputCls} resize-y`}
            value={form.notes}
            onChange={(e) => form.setNotes(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || form.name.trim() === ""}
            onClick={onSave}
            className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </Card>
  );
}
