import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { GiKnapsack } from "@/components/ui/icons";
import {
  awardCampaignItem,
  createCampaignItem,
  deleteCampaignItem,
  fetchCampaignItems,
  fetchItems,
  revokeCampaignItem,
  updateCampaignItem,
  updateEntity,
} from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import { ITEM_CATEGORY_OPTIONS, itemCategoryLabel } from "@/lib/items";
import type {
  ArmorCategory,
  CampaignItem,
  CampaignItemInput,
  Item,
  ItemCategory,
} from "@/types/character";

interface CampaignItemsPanelProps {
  campaignId: string;
  /** Member characters, so the DM can pick an award target. */
  characters: { id: string; name: string; ownerId: string }[];
}

const inputCls =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
const labelCls = "block text-xs font-semibold text-parchment-700";

interface FormState {
  name: string;
  category: ItemCategory;
  rarity: string;
  requiresAttunement: boolean;
  isUnique: boolean;
  weight: string;
  costGp: string;
  description: string;
  dmNotes: string;
  // weapon
  damageDiceCount: string;
  damageDiceFaces: string;
  damageType: string;
  // armor
  armorCategory: string;
  baseArmorClass: string;
  stealthDisadvantage: boolean;
  // consumable
  effectDiceCount: string;
  effectDiceFaces: string;
  effectModifier: string;
  effectDescription: string;
}

const emptyForm: FormState = {
  name: "",
  category: "weapon",
  rarity: "",
  requiresAttunement: false,
  isUnique: false,
  weight: "",
  costGp: "",
  description: "",
  dmNotes: "",
  damageDiceCount: "1",
  damageDiceFaces: "6",
  damageType: "bludgeoning",
  armorCategory: "light",
  baseArmorClass: "",
  stealthDisadvantage: false,
  effectDiceCount: "",
  effectDiceFaces: "",
  effectModifier: "",
  effectDescription: "",
};

const num = (s: string): number | undefined => {
  const n = Number(s);
  return s.trim() === "" || Number.isNaN(n) ? undefined : n;
};

// Prefill the from-scratch form from a chosen catalog Item (clone path):
// category/weight/cost/description + the matching detail block.
function formFromCatalog(item: Item): FormState {
  return {
    ...emptyForm,
    name: item.name,
    category: item.category,
    weight: item.weight?.toString() ?? "",
    costGp: item.cost?.gp?.toString() ?? "",
    description: item.description ?? "",
    damageDiceCount: item.weapon?.damageDiceCount?.toString() ?? emptyForm.damageDiceCount,
    damageDiceFaces: item.weapon?.damageDiceFaces?.toString() ?? emptyForm.damageDiceFaces,
    damageType: item.weapon?.damageType ?? emptyForm.damageType,
    armorCategory: item.armor?.armorCategory ?? emptyForm.armorCategory,
    baseArmorClass: item.armor?.baseArmorClass?.toString() ?? "",
    stealthDisadvantage: item.armor?.stealthDisadvantage ?? false,
    effectDiceCount: item.consumable?.effectDiceCount?.toString() ?? "",
    effectDiceFaces: item.consumable?.effectDiceFaces?.toString() ?? "",
    effectModifier: item.consumable?.effectModifier?.toString() ?? "",
    effectDescription: item.consumable?.effectDescription ?? "",
  };
}

// Prefill the shared form from an existing campaign item (edit path):
// every base field + the matching detail block, so a save re-sends the full item.
function formFromItem(item: CampaignItem): FormState {
  return {
    ...emptyForm,
    name: item.name,
    category: item.category,
    rarity: item.rarity ?? "",
    requiresAttunement: item.requiresAttunement,
    isUnique: item.isUnique,
    weight: item.weight?.toString() ?? "",
    costGp: item.cost?.gp?.toString() ?? "",
    description: item.description ?? "",
    dmNotes: item.dmNotes ?? "",
    damageDiceCount: item.weapon?.damageDiceCount?.toString() ?? emptyForm.damageDiceCount,
    damageDiceFaces: item.weapon?.damageDiceFaces?.toString() ?? emptyForm.damageDiceFaces,
    damageType: item.weapon?.damageType ?? emptyForm.damageType,
    armorCategory: item.armor?.armorCategory ?? emptyForm.armorCategory,
    baseArmorClass: item.armor?.baseArmorClass?.toString() ?? "",
    stealthDisadvantage: item.armor?.stealthDisadvantage ?? false,
    effectDiceCount: item.consumable?.effectDiceCount?.toString() ?? "",
    effectDiceFaces: item.consumable?.effectDiceFaces?.toString() ?? "",
    effectModifier: item.consumable?.effectModifier?.toString() ?? "",
    effectDescription: item.consumable?.effectDescription ?? "",
  };
}

function buildInput(f: FormState): CampaignItemInput {
  const gp = num(f.costGp);
  const base: CampaignItemInput = {
    name: f.name.trim(),
    category: f.category,
    rarity: f.rarity.trim() || undefined,
    requiresAttunement: f.requiresAttunement,
    isUnique: f.isUnique,
    weight: num(f.weight),
    cost: gp !== undefined ? { cp: 0, sp: 0, gp, pp: 0 } : undefined,
    description: f.description.trim() || undefined,
    dmNotes: f.dmNotes.trim() || undefined,
  };
  if (f.category === "weapon") {
    base.weapon = {
      damageDiceCount: num(f.damageDiceCount) ?? 1,
      damageDiceFaces: num(f.damageDiceFaces) ?? 6,
      damageType: f.damageType.trim() || "bludgeoning",
    };
  } else if (f.category === "armor") {
    base.armor = {
      armorCategory: f.armorCategory as ArmorCategory,
      baseArmorClass: num(f.baseArmorClass) ?? 10,
      stealthDisadvantage: f.stealthDisadvantage,
    };
  } else if (f.category === "consumable") {
    const effect = {
      effectDiceCount: num(f.effectDiceCount),
      effectDiceFaces: num(f.effectDiceFaces),
      effectModifier: num(f.effectModifier),
      effectDescription: f.effectDescription.trim() || undefined,
    };
    if (Object.values(effect).some((v) => v !== undefined)) base.consumable = effect;
  }
  return base;
}

// Owner-only Manage-tab panel (#380): authors DM campaign items via two paths —
// clone-from-SRD-catalog (pre-fills the form from a chosen Item) and from-scratch
// with category-conditional detail fields. The same form re-opens pre-filled to
// edit an existing item (#505). Each create auto-registers a HIDDEN ITEM entity;
// reveal/edit/delete here keep the shared Codex cache in sync.
export default function CampaignItemsPanel({ campaignId, characters }: CampaignItemsPanelProps) {
  const { entities } = useCampaignEntities(campaignId);
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [creating, setCreating] = useState(false);
  // Non-null while editing an existing item; drives the shared form's mode.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-item chosen award target (character id).
  const [awardTarget, setAwardTarget] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    fetchCampaignItems(campaignId)
      .then((list) => active && setItems(list))
      .catch(() => active && setError("Failed to load campaign items."));
    fetchItems()
      .then((list) => active && setCatalog(list))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [campaignId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function revealInCache(entityId: string, visibility: "HIDDEN" | "REVEALED") {
    const target = entities.find((e) => e.id === entityId);
    if (target) {
      primeCampaignEntities(
        campaignId,
        entities.map((e) => (e.id === entityId ? { ...e, visibility } : e)),
      );
    }
  }

  // Mirror a saved rename onto the fronting entity in the shared Codex cache.
  function renameInCache(entityId: string, name: string) {
    const target = entities.find((e) => e.id === entityId);
    if (target) {
      primeCampaignEntities(
        campaignId,
        entities.map((e) => (e.id === entityId ? { ...e, name } : e)),
      );
    }
  }

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setCreating((c) => !c);
  }

  function startEdit(item: CampaignItem) {
    setEditingId(item.id);
    setForm(formFromItem(item));
    setCreating(false);
    setError(null);
  }

  function cancelForm() {
    setCreating(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit() {
    if (form.name.trim() === "") return;
    const editing = editingId !== null;
    setBusyId(editing ? editingId : "new");
    setError(null);
    try {
      if (editing) {
        const updated = await updateCampaignItem(campaignId, editingId, buildInput(form));
        setItems((prev) =>
          prev
            .map((i) => (i.id === updated.id ? { ...updated, holders: i.holders ?? [] } : i))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        if (updated.entity) renameInCache(updated.entity.id, updated.entity.name);
      } else {
        const created = await createCampaignItem(campaignId, buildInput(form));
        setItems((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        if (created.entity) primeCampaignEntities(campaignId, [...entities, { id: created.entity.id, campaignId, type: "ITEM", name: created.entity.name, aliases: [], notes: null, visibility: created.entity.visibility, createdAt: created.createdAt, updatedAt: created.updatedAt }]);
      }
      setForm(emptyForm);
      setCreating(false);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : editing ? "Failed to update item." : "Failed to create item.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleReveal(item: CampaignItem) {
    if (!item.entity) return;
    setBusyId(item.id);
    setError(null);
    try {
      const next = item.entity.visibility === "HIDDEN" ? "REVEALED" : "HIDDEN";
      const updated = await updateEntity(campaignId, item.entity.id, { visibility: next });
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id && i.entity ? { ...i, entity: { ...i.entity, visibility: updated.visibility } } : i,
        ),
      );
      revealInCache(item.entity.id, updated.visibility);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change visibility.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: CampaignItem) {
    setBusyId(item.id);
    setError(null);
    try {
      await deleteCampaignItem(campaignId, item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (item.entity) {
        primeCampaignEntities(campaignId, entities.filter((e) => e.id !== item.entity!.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAward(item: CampaignItem) {
    // The Award button is disabled until a recipient is picked, so awardTarget
    // is always set here; the guard is a defensive backstop, not a fallback.
    const characterId = awardTarget[item.id];
    if (!characterId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const { holders } = await awardCampaignItem(campaignId, item.id, { characterId });
      // Award reveals the fronting entity — reflect it locally + in the cache.
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, holders, entity: i.entity ? { ...i.entity, visibility: "REVEALED" } : i.entity }
            : i,
        ),
      );
      if (item.entity) revealInCache(item.entity.id, "REVEALED");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to award item.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(item: CampaignItem, characterId: string) {
    setBusyId(item.id);
    setError(null);
    try {
      const { holders } = await revokeCampaignItem(campaignId, item.id, { characterId });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, holders } : i)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke item.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title="Campaign items"
      headingLevel={2}
      titleAccessory={
        <button
          type="button"
          aria-expanded={creating}
          onClick={startCreate}
          className="text-xs font-semibold text-garnet-700 hover:underline"
        >
          ➕ New item
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

        {(creating || editingId !== null) && (
          <div className="flex flex-col gap-3 rounded-control border border-parchment-200 bg-parchment-100 p-3">
            {editingId === null && (
              <div>
                <label className={labelCls} htmlFor="item-clone">
                  Clone from catalog (optional)
                </label>
                <select
                  id="item-clone"
                  className={inputCls}
                  value=""
                  onChange={(e) => {
                    const chosen = catalog.find((c) => c.id === e.target.value);
                    if (chosen) setForm(formFromCatalog(chosen));
                  }}
                >
                  <option value="">Start from scratch…</option>
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={labelCls} htmlFor="item-name">
                Name *
              </label>
              <input
                id="item-name"
                className={inputCls}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="item-category">
                  Category
                </label>
                <select
                  id="item-category"
                  className={inputCls}
                  value={form.category}
                  onChange={(e) => set("category", e.target.value as ItemCategory)}
                >
                  {ITEM_CATEGORY_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="item-rarity">
                  Rarity
                </label>
                <input
                  id="item-rarity"
                  className={inputCls}
                  placeholder="e.g. rare"
                  value={form.rarity}
                  onChange={(e) => set("rarity", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="item-weight">
                  Weight (lb)
                </label>
                <input
                  id="item-weight"
                  type="number"
                  className={inputCls}
                  value={form.weight}
                  onChange={(e) => set("weight", e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="item-cost">
                  Value (gp)
                </label>
                <input
                  id="item-cost"
                  type="number"
                  className={inputCls}
                  value={form.costGp}
                  onChange={(e) => set("costGp", e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-parchment-700">
                <input
                  type="checkbox"
                  checked={form.requiresAttunement}
                  onChange={(e) => set("requiresAttunement", e.target.checked)}
                />
                Requires attunement
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-parchment-700">
                <input
                  type="checkbox"
                  checked={form.isUnique}
                  onChange={(e) => set("isUnique", e.target.checked)}
                />
                Unique
              </label>
            </div>

            {form.category === "weapon" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls} htmlFor="item-dice-count">
                    Dice count
                  </label>
                  <input
                    id="item-dice-count"
                    type="number"
                    className={inputCls}
                    value={form.damageDiceCount}
                    onChange={(e) => set("damageDiceCount", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="item-dice-faces">
                    Dice faces
                  </label>
                  <input
                    id="item-dice-faces"
                    type="number"
                    className={inputCls}
                    value={form.damageDiceFaces}
                    onChange={(e) => set("damageDiceFaces", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="item-damage-type">
                    Damage type
                  </label>
                  <input
                    id="item-damage-type"
                    className={inputCls}
                    value={form.damageType}
                    onChange={(e) => set("damageType", e.target.value)}
                  />
                </div>
              </div>
            )}

            {form.category === "armor" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="item-armor-category">
                    Armor type
                  </label>
                  <select
                    id="item-armor-category"
                    className={inputCls}
                    value={form.armorCategory}
                    onChange={(e) => set("armorCategory", e.target.value)}
                  >
                    <option value="light">Light</option>
                    <option value="medium">Medium</option>
                    <option value="heavy">Heavy</option>
                    <option value="shield">Shield</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="item-base-ac">
                    Base AC
                  </label>
                  <input
                    id="item-base-ac"
                    type="number"
                    className={inputCls}
                    value={form.baseArmorClass}
                    onChange={(e) => set("baseArmorClass", e.target.value)}
                  />
                </div>
                <label className="col-span-2 flex items-center gap-2 text-xs font-semibold text-parchment-700">
                  <input
                    type="checkbox"
                    checked={form.stealthDisadvantage}
                    onChange={(e) => set("stealthDisadvantage", e.target.checked)}
                  />
                  Stealth disadvantage
                </label>
              </div>
            )}

            {form.category === "consumable" && (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls} htmlFor="item-effect-count">
                    Effect dice
                  </label>
                  <input
                    id="item-effect-count"
                    type="number"
                    className={inputCls}
                    value={form.effectDiceCount}
                    onChange={(e) => set("effectDiceCount", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="item-effect-faces">
                    Effect faces
                  </label>
                  <input
                    id="item-effect-faces"
                    type="number"
                    className={inputCls}
                    value={form.effectDiceFaces}
                    onChange={(e) => set("effectDiceFaces", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="item-effect-mod">
                    Modifier
                  </label>
                  <input
                    id="item-effect-mod"
                    type="number"
                    className={inputCls}
                    value={form.effectModifier}
                    onChange={(e) => set("effectModifier", e.target.value)}
                  />
                </div>
                <div className="col-span-3">
                  <label className={labelCls} htmlFor="item-effect-desc">
                    Effect description
                  </label>
                  <input
                    id="item-effect-desc"
                    className={inputCls}
                    value={form.effectDescription}
                    onChange={(e) => set("effectDescription", e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <label className={labelCls} htmlFor="item-description">
                Description
              </label>
              <textarea
                id="item-description"
                rows={2}
                className={`${inputCls} resize-y`}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="item-dmnotes">
                DM notes (hidden from players)
              </label>
              <textarea
                id="item-dmnotes"
                rows={2}
                className={`${inputCls} resize-y`}
                value={form.dmNotes}
                onChange={(e) => set("dmNotes", e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelForm}
                className="rounded-control border border-parchment-300 px-3 py-1.5 text-xs font-semibold text-parchment-700 hover:bg-parchment-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId !== null || form.name.trim() === ""}
                onClick={handleSubmit}
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
        )}

        {items.length === 0 ? (
          <EmptyState
            icon={<GiKnapsack />}
            title="No campaign items yet"
            description="Author magic items and loot here. Each starts hidden — reveal it to drop it into your players' Codex."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-parchment-200">
            {items.map((item) => {
              const hidden = item.entity?.visibility === "HIDDEN";
              const holders = item.holders ?? [];
              const held = item.isUnique && holders.length > 0;
              return (
                <li key={item.id} className="flex flex-col gap-2 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.entity ? (
                      <Link
                        to={`/campaigns/${campaignId}/entities/${item.entity.id}`}
                        className="text-sm font-semibold text-parchment-900 hover:underline"
                      >
                        {item.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-parchment-900">{item.name}</span>
                    )}
                    <Badge tone="gold">{itemCategoryLabel(item.category)}</Badge>
                    {item.rarity && <Badge tone="arcane">{item.rarity}</Badge>}
                    {item.isUnique && <Badge tone="arcane">Unique</Badge>}
                    {hidden && <Badge tone="neutral">🔒 Hidden</Badge>}
                    <span className="ml-auto flex items-center gap-3">
                      <button
                        type="button"
                        disabled={busyId === item.id || !item.entity}
                        onClick={() => toggleReveal(item)}
                        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        {hidden ? "Reveal" : "Hide"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => startEdit(item)}
                        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => handleDelete(item)}
                        className="text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </span>
                  </div>

                  {holders.length > 0 && (
                    <ul className="flex flex-col gap-1 pl-1 text-xs text-parchment-700">
                      {holders.map((h) => (
                        <li key={h.characterId} className="flex items-center gap-2">
                          <span>
                            Held by <span className="font-semibold">{h.characterName}</span>
                            {h.quantity > 1 ? ` ×${h.quantity}` : ""}
                          </span>
                          <button
                            type="button"
                            disabled={busyId === item.id}
                            onClick={() => handleRevoke(item, h.characterId)}
                            className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
                          >
                            Revoke
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {characters.length > 0 && !held && (
                    <div className="flex items-center gap-2 pl-1">
                      <label htmlFor={`award-${item.id}`} className="text-xs text-parchment-600">
                        Award to
                      </label>
                      <select
                        id={`award-${item.id}`}
                        className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-xs text-parchment-900"
                        value={awardTarget[item.id] ?? ""}
                        onChange={(e) =>
                          setAwardTarget((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                      >
                        <option value="">Choose character…</option>
                        {characters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busyId === item.id || !(awardTarget[item.id] ?? "")}
                        onClick={() => handleAward(item)}
                        className="rounded-control bg-garnet-600 px-2 py-1 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
                      >
                        Award
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
