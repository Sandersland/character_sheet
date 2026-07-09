import type { Dispatch, SetStateAction } from "react";

import {
  CategoryDetailsFieldset,
  CloneFromCatalog,
  DescriptionFieldset,
  IdentityFieldset,
  MagicFieldset,
  ValueWeightFieldset,
} from "@/features/entities/CampaignItemFields";
import { buildFormSetters } from "@/features/entities/campaignItemFormSetters";
import { type FormState } from "@/lib/campaignItemForm";
import type { Item } from "@/types/character";

interface CampaignItemFormProps {
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  editingId: string | null;
  catalog: Item[];
  busyId: string | null;
  onSubmit: () => void;
  onCancel: () => void;
}

export default function CampaignItemForm({
  form,
  setForm,
  editingId,
  catalog,
  busyId,
  onSubmit,
  onCancel,
}: CampaignItemFormProps) {
  const setters = buildFormSetters(setForm);

  return (
    <div className="flex flex-col gap-4 rounded-control border border-parchment-200 bg-parchment-100 p-3">
      {editingId === null && <CloneFromCatalog catalog={catalog} setForm={setForm} />}

      <IdentityFieldset form={form} setters={setters} />
      <CategoryDetailsFieldset form={form} setters={setters} />
      <MagicFieldset form={form} setters={setters} />
      <ValueWeightFieldset form={form} setters={setters} />
      <DescriptionFieldset form={form} setters={setters} />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-control border border-parchment-300 px-3 py-1.5 text-xs font-semibold text-parchment-700 hover:bg-parchment-200"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busyId !== null || form.name.trim() === ""}
          onClick={onSubmit}
          className="rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
        >
          {editingId !== null
            ? busyId === editingId
              ? "Saving…"
              : "Save changes"
            : busyId === "new"
              ? "Creating…"
              : "Create item"}
        </button>
      </div>
    </div>
  );
}
