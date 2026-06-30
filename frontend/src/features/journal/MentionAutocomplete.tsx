// A textarea wrapper that drives an @-tag autocomplete popover (#248). It owns
// the textarea so it can intercept Up/Down/Enter/Esc while the popover is open
// (and only then) and insert an @[<uuid>] token at the trigger position on
// select. Drop-in for the journal NOTE/ENTRY composers; threads campaignId so a
// player not in a campaign gets a "create or join" CTA instead of matches.

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link } from "react-router-dom";

import { createEntity, fetchEntities } from "@/api/client";
import Badge from "@/components/ui/Badge";
import { ENTITY_TYPE_LABELS, matchEntities, parseTrigger } from "@/lib/mentions";
import type { CampaignEntity, EntityType } from "@/types/character";

interface MentionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  campaignId?: string | null;
  rows?: number;
  className?: string;
  placeholder?: string;
  id?: string;
  required?: boolean;
  "aria-label"?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}

const TYPE_TONE: Record<EntityType, "garnet" | "arcane" | "gold" | "vitality" | "neutral"> = {
  NPC: "garnet",
  LOCATION: "vitality",
  FACTION: "arcane",
  ITEM: "gold",
  PC: "garnet",
  OTHER: "neutral",
};

const MAX_MATCHES = 6;

const MentionAutocomplete = forwardRef<HTMLTextAreaElement, MentionAutocompleteProps>(
  function MentionAutocomplete(
    { value, onChange, campaignId, rows = 2, className = "", placeholder, id, required, onKeyDown, ...rest },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const listboxId = useId();
    const [entities, setEntities] = useState<CampaignEntity[]>([]);
    const [trigger, setTrigger] = useState<ReturnType<typeof parseTrigger>>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ariaLabel = rest["aria-label"];

    // Load the campaign's entity list once per campaign (small, campaign-scoped).
    useEffect(() => {
      if (!campaignId) {
        setEntities([]);
        return;
      }
      let active = true;
      fetchEntities(campaignId)
        .then((list) => active && setEntities(list))
        .catch(() => active && setEntities([]));
      return () => {
        active = false;
      };
    }, [campaignId]);

    function setRef(el: HTMLTextAreaElement | null) {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    }

    function syncTrigger() {
      const el = innerRef.current;
      if (!el) return;
      const caret = el.selectionStart ?? el.value.length;
      const next = parseTrigger(el.value.slice(0, caret));
      setTrigger(next);
      setActiveIndex(0);
    }

    const matches = (() => {
      if (!trigger || !campaignId) return [] as CampaignEntity[];
      const scoped = trigger.typeFilter
        ? entities.filter((e) => e.type === trigger.typeFilter)
        : entities;
      return matchEntities(scoped, trigger.query).slice(0, MAX_MATCHES);
    })();

    const createName = trigger?.query.trim() ?? "";
    const showCreate = Boolean(campaignId && trigger && createName !== "");
    const createType: EntityType = trigger?.typeFilter ?? "NPC";
    const totalItems = matches.length + (showCreate ? 1 : 0);
    const popoverOpen = Boolean(trigger) && (campaignId ? totalItems > 0 : true);

    function insertToken(entityId: string) {
      const el = innerRef.current;
      if (!el || !trigger) return;
      const caret = el.selectionStart ?? el.value.length;
      const before = el.value.slice(0, trigger.triggerStart);
      const after = el.value.slice(caret);
      const token = `@[${entityId}]`;
      const nextValue = `${before}${token} ${after}`;
      onChange(nextValue);
      setTrigger(null);
      const pos = before.length + token.length + 1;
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    }

    async function handleCreate() {
      if (!campaignId || !createName) return;
      setCreating(true);
      setError(null);
      try {
        const created = await createEntity(campaignId, { type: createType, name: createName });
        setEntities((prev) => [...prev, created]);
        insertToken(created.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create entity.");
      } finally {
        setCreating(false);
      }
    }

    function commitActive() {
      if (activeIndex < matches.length) insertToken(matches[activeIndex].id);
      else if (showCreate) void handleCreate();
    }

    function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
      if (popoverOpen && campaignId && totalItems > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((i) => (i + 1) % totalItems);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((i) => (i - 1 + totalItems) % totalItems);
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          commitActive();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setTrigger(null);
          return;
        }
      }
      onKeyDown?.(event);
    }

    return (
      <div className="relative">
        <textarea
          ref={setRef}
          id={id}
          required={required}
          rows={rows}
          aria-label={ariaLabel}
          className={className}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            syncTrigger();
          }}
          onKeyUp={syncTrigger}
          onClick={syncTrigger}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setTrigger(null), 120)}
        />

        {popoverOpen && !campaignId && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-card border border-parchment-200 bg-parchment-50 p-3 text-xs text-parchment-700 shadow-raised">
            <Link to="/campaigns" className="font-semibold text-garnet-700 hover:underline">
              Create or join a campaign
            </Link>{" "}
            to tag people, places and things.
          </div>
        )}

        {popoverOpen && campaignId && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Tag suggestions"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-card border border-parchment-200 bg-parchment-50 py-1 shadow-raised"
          >
            {matches.map((entity, index) => (
              <li
                key={entity.id}
                role="option"
                aria-selected={index === activeIndex}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm ${
                  index === activeIndex ? "bg-garnet-50 text-garnet-900" : "text-parchment-800"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertToken(entity.id);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="min-w-0 truncate">{entity.name}</span>
                <Badge tone={TYPE_TONE[entity.type]}>{ENTITY_TYPE_LABELS[entity.type]}</Badge>
              </li>
            ))}
            {showCreate && (
              <li
                role="option"
                aria-selected={activeIndex === matches.length}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                  activeIndex === matches.length ? "bg-garnet-50 text-garnet-900" : "text-parchment-700"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void handleCreate();
                }}
                onMouseEnter={() => setActiveIndex(matches.length)}
              >
                {creating ? "Creating…" : `➕ Create ${ENTITY_TYPE_LABELS[createType]} “${createName}”`}
              </li>
            )}
          </ul>
        )}

        {error && <p className="mt-1 text-xs font-semibold text-garnet-700">{error}</p>}
      </div>
    );
  },
);

export default MentionAutocomplete;
