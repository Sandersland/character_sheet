/**
 * SessionLog — BG3-style chat feed for a single play session (#1237).
 *
 * Fetches all CharacterEvents whose sessionId matches the current session and
 * renders them as one sentence per event, newest at the BOTTOM (chat
 * convention), opening scrolled to the latest. Re-fetches on every mount; a
 * caller that keeps the log mounted across live mutations can pass the
 * optional `refreshKey` prop (the character object or a version counter) to
 * trigger additional re-fetches.
 *
 * All the event → sentence/tone/drill-in logic is pure and lives in
 * `lib/sessionLogFeed.ts` — this component only maps that data onto markup.
 *
 * Intentionally read-only — no undo here. Use ActivityModal on the character
 * sheet for the full undo-capable history.
 */

import { Fragment, useEffect, useRef, useState } from "react";

import { fetchSession } from "@/api/client";
import { ChevronRight } from "@/components/ui/icons";
import Spinner from "@/components/ui/Spinner";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { damageTypeTone, logToneClass } from "@/lib/events";
import {
  buildFeedItems,
  type DrillInRow,
  type FeedItem,
  type FeedRow,
  type LogSegment,
} from "@/lib/sessionLogFeed";
import type { CharacterEvent } from "@/types/character";

interface SessionLogProps {
  characterId: string;
  sessionId: string;
  /**
   * Changing this value re-fetches the event list. Both live-Combat call sites
   * (the desktop right rail and the mobile Turn/Log panel, #964) stay mounted, so
   * they pass the shared `logRefresh` counter to pick up new events. Optional —
   * a caller that fully unmounts/remounts per view refetches on mount anyway.
   */
  refreshKey?: unknown;
}

function segmentClass(seg: LogSegment, row: FeedRow): string {
  const tone =
    seg.damageType !== undefined
      ? (damageTypeTone(seg.damageType) ?? logToneClass(row.tone))
      : logToneClass(seg.tone ?? row.tone);
  const italic = (seg.italic ?? row.italic) ? "italic" : "";
  const weight = seg.bold ? "font-semibold" : "";
  return [tone, weight, italic].filter(Boolean).join(" ");
}

function Sentence({ row }: { row: FeedRow }) {
  return (
    <>
      {row.segments.map((seg, i) => (
        <span key={i} className={segmentClass(seg, row)}>
          {seg.text}
        </span>
      ))}
    </>
  );
}

function DrillInLine({ d }: { d: DrillInRow }) {
  if (d.formula === undefined) {
    // Standalone italic aside (e.g. "Called a miss — no damage rolled.").
    return d.note ? <p className="text-[12.5px] italic text-parchment-500">{d.note}</p> : null;
  }
  return (
    <div className="flex gap-2 text-[12.5px]">
      <span className="w-[52px] shrink-0 text-[10.5px] font-bold uppercase tracking-wide text-parchment-400">
        {d.label}
      </span>
      <span className="tabular-nums text-parchment-700">
        {d.formula} = <b className="text-parchment-900">{d.total}</b>
        {d.note && <span className="ml-1 italic text-parchment-500">· {d.note}</span>}
      </span>
    </div>
  );
}

// A plain event line — no drill-in, e.g. "Session started.", "Healed 6 HP."
function PlainRow({ row }: { row: FeedRow }) {
  return (
    <li className="rounded-control px-3 py-1.5 text-sm leading-relaxed">
      <Sentence row={row} />
    </li>
  );
}

// A roll-category line — `<details>` so the summary hover/tap reveals the
// decomposed breakdown (#1235). Chevron stays dimly visible at rest so touch
// users see the affordance without relying on hover.
function RollRow({ row }: { row: FeedRow }) {
  return (
    <li>
      <details className="group rounded-control px-3 py-1.5 text-sm leading-relaxed">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <Sentence row={row} />
          </span>
          <ChevronRight
            aria-hidden="true"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-parchment-400 transition-transform group-open:rotate-90 group-open:text-parchment-700"
          />
        </summary>
        <div className="mt-1 space-y-1 border-l-2 border-parchment-200 pl-3.5">
          {(row.drillIn ?? []).map((d, i) => (
            <DrillInLine key={i} d={d} />
          ))}
        </div>
      </details>
    </li>
  );
}

function FeedRowView({ row }: { row: FeedRow }) {
  return row.drillIn ? <RollRow row={row} /> : <PlainRow row={row} />;
}

// Round separator: centered uppercase label flanked by hairlines (#1237),
// replacing the old per-row R{n} badge.
function RoundSeparator({ round }: { round: number }) {
  return (
    <li aria-hidden="true" className="flex items-center gap-2 px-1 py-1">
      <span className="h-px flex-1 bg-parchment-200" />
      <span className="text-[10.5px] font-bold uppercase tracking-wide text-parchment-400">
        Round {round}
      </span>
      <span className="h-px flex-1 bg-parchment-200" />
    </li>
  );
}

// A collapsed run of same-kind roll rows (#983) — the threshold and how many
// stay visible are RUN_COLLAPSE_THRESHOLD / RUN_VISIBLE_COUNT, not restated
// here. The newest stay visible in place; the disclosure sits above them and
// reveals the rest (oldest-first) when expanded.
function RollRunView({
  item,
  expanded,
  onToggle,
}: {
  item: Extract<FeedItem, { kind: "rollRun" }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <li>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex items-center gap-1 px-3 text-xs font-medium text-parchment-500 hover:text-parchment-700"
        >
          <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
          {expanded ? `Hide ${item.label}` : item.label}
        </button>
      </li>
      {expanded && item.hidden.map((r) => <FeedRowView key={r.id} row={r} />)}
      {item.visible.map((r) => (
        <FeedRowView key={r.id} row={r} />
      ))}
    </>
  );
}

export default function SessionLog({ characterId, sessionId, refreshKey }: SessionLogProps) {
  const [events, setEvents] = useState<CharacterEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const showSpinner = useDelayedFlag(!events && !error);
  const bottomRef = useRef<HTMLLIElement>(null);

  const toggleRun = (id: string) =>
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Reset to the loading state only on a genuine session switch — a live
  // refreshKey bump re-fetches WITHOUT clearing `events` first, or every open
  // <details> (a drill-in) would unmount and re-collapse on every roll (the
  // log bumps its refreshKey on every character write).
  useEffect(() => {
    setEvents(null);
    setError(null);
    // Run ids are event ids, so stale entries never match the new session's
    // feed — cleared so the set can't grow unboundedly across switches.
    setExpandedRuns(new Set());
  }, [characterId, sessionId]);

  useEffect(() => {
    fetchSession(characterId, sessionId)
      .then((data) => {
        setEvents(data.events as CharacterEvent[]);
        setError(null);
      })
      .catch(() => setError("Couldn't load session log — try again."));
  }, [characterId, sessionId, refreshKey]);

  // Open already scrolled to the latest event (chat convention) — instant, not
  // animated, since this fires on load/refresh, not on a user-driven append.
  useEffect(() => {
    if (events) bottomRef.current?.scrollIntoView({ block: "end" });
  }, [events]);

  if (error) {
    return <p className="text-xs font-semibold text-garnet-700">{error}</p>;
  }

  if (!events) {
    return showSpinner ? <Spinner /> : null;
  }

  const items = buildFeedItems(events);

  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-parchment-600">
        No events yet — actions taken during this session will appear here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 px-1.5 pb-3.5 pt-2">
      {items.map((item) => {
        if (item.kind === "separator") return <RoundSeparator key={item.id} round={item.round} />;
        if (item.kind === "row") return <FeedRowView key={item.row.id} row={item.row} />;
        return (
          <Fragment key={item.id}>
            <RollRunView
              item={item}
              expanded={expandedRuns.has(item.id)}
              onToggle={() => toggleRun(item.id)}
            />
          </Fragment>
        );
      })}
      <li ref={bottomRef} aria-hidden="true" />
    </ul>
  );
}
