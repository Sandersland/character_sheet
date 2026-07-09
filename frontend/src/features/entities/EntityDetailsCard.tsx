import Card from "@/components/ui/Card";
import { ENTITY_TYPE_OPTIONS } from "@/lib/mentions";
import type { CampaignEntity, CampaignRole, EntityType } from "@/types/character";

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

function EditForm({
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
  );
}

function ReadView({
  entity,
  role,
  busy,
  onToggleVisibility,
  onDelete,
}: {
  entity: CampaignEntity;
  role?: CampaignRole;
  busy: boolean;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      {entity.aliases.length > 0 && (
        <div>
          <p className={labelCls}>Also known as</p>
          <p className="text-sm text-parchment-800">{entity.aliases.join(", ")}</p>
        </div>
      )}
      <div>
        <p className={labelCls}>Notes</p>
        <p className="whitespace-pre-wrap text-sm text-parchment-800">
          {entity.notes?.trim() ? entity.notes : "No notes yet."}
        </p>
      </div>
      {role === "OWNER" && (
        <div className="flex items-center gap-4 border-t border-parchment-200 pt-3">
          <button
            type="button"
            disabled={busy}
            onClick={onToggleVisibility}
            className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
          >
            {entity.visibility === "HIDDEN" ? "Reveal to players" : "Hide from players"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
          >
            Delete entity
          </button>
        </div>
      )}
    </div>
  );
}

export default function EntityDetailsCard({
  entity,
  role,
  editing,
  busy,
  form,
  onEdit,
  onCancel,
  onSave,
  onToggleVisibility,
  onDelete,
}: {
  entity: CampaignEntity;
  role?: CampaignRole;
  editing: boolean;
  busy: boolean;
  form: EntityForm;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  return (
    <Card
      title="Details"
      headingLevel={2}
      titleAccessory={
        !editing ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-semibold text-garnet-700 hover:underline"
          >
            Edit
          </button>
        ) : null
      }
      className="p-4"
    >
      {editing ? (
        <EditForm form={form} busy={busy} onSave={onSave} onCancel={onCancel} />
      ) : (
        <ReadView
          entity={entity}
          role={role}
          busy={busy}
          onToggleVisibility={onToggleVisibility}
          onDelete={onDelete}
        />
      )}
    </Card>
  );
}
