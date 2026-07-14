// The chronicle "spine" (#864): the desktop left pane and the mobile chapters
// list. Chapters are the campaign's sessions (title, or "Session N"); with arcs
// they nest under collapsible PART headers (frame A′), and without arcs they render
// as a flat list (frame A). A client-side title filter sits at the top; the
// pure grouping/filtering lives in chronicle.ts.

import { ChevronDown, ChevronRight } from "@/components/ui/icons";
import {
  filterSpine,
  partIdForChapter,
  type ChronicleChapter,
  type ChroniclePart,
  type ChronicleSpine as Spine,
} from "@/features/journal/chronicle";
import { formatJournalDate } from "@/lib/formatJournalDate";

interface ChronicleSpineProps {
  spine: Spine;
  selectedId: string | null;
  onSelect: (chapterId: string) => void;
  filter: string;
  onFilterChange: (value: string) => void;
}

export default function ChronicleSpine({
  spine,
  selectedId,
  onSelect,
  filter,
  onFilterChange,
}: ChronicleSpineProps) {
  const filtering = filter.trim() !== "";
  const view = filterSpine(spine, filter);
  const openPartId = partIdForChapter(view, selectedId);

  return (
    <nav aria-label="Chronicle" className="flex flex-col gap-1.5">
      <input
        type="search"
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        placeholder="Find a chapter…"
        aria-label="Find a chapter"
        className="mb-1 w-full rounded-control border border-parchment-200 bg-parchment-50 px-3 py-2 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none"
      />

      {view.between && (
        <ChapterRow
          chapter={view.between}
          selected={selectedId === view.between.id}
          onSelect={onSelect}
        />
      )}

      {view.hasParts ? (
        view.parts.map((part) => (
          <PartGroup
            key={part.id}
            part={part}
            expanded={filtering || part.id === openPartId}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))
      ) : (
        view.chapters.map((chapter) => (
          <ChapterRow
            key={chapter.id}
            chapter={chapter}
            selected={selectedId === chapter.id}
            onSelect={onSelect}
          />
        ))
      )}

      {view.chapterCount === 0 && !view.between && (
        <p className="px-3 py-2 text-xs text-parchment-500">
          {filtering ? "No chapters match." : "No chapters yet."}
        </p>
      )}

      <p className="mt-3 px-2.5 text-[11px] text-parchment-400">
        {spine.chapterCount} {spine.chapterCount === 1 ? "chapter" : "chapters"} · {spine.totalNotes}{" "}
        {spine.totalNotes === 1 ? "note" : "notes"}
      </p>
    </nav>
  );
}

// A collapsible part: header (roman numeral + name + session range) plus, when
// expanded, its chapter rows. Clicking a collapsed header navigates to the part's
// newest chapter (which expands it).
function PartGroup({
  part,
  expanded,
  selectedId,
  onSelect,
}: {
  part: ChroniclePart;
  expanded: boolean;
  selectedId: string | null;
  onSelect: (chapterId: string) => void;
}) {
  const heading = part.numeral ? `Part ${part.numeral} — ${part.name}` : part.name;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (part.chapters.length > 0) onSelect(part.chapters[0].id);
        }}
        aria-expanded={expanded}
        className="flex w-full items-baseline gap-2 px-1.5 py-2 text-left"
      >
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-gold-700">
          {heading}
        </span>
        {part.range && <span className="text-[11px] text-parchment-500">{part.range}</span>}
        <span className="ml-auto text-parchment-400">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </span>
      </button>
      {expanded &&
        part.chapters.map((chapter) => (
          <ChapterRow
            key={chapter.id}
            chapter={chapter}
            selected={selectedId === chapter.id}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

// One chapter row: gold session number, serif title + note count, short date, and
// a gold diamond marking the current selection.
function ChapterRow({
  chapter,
  selected,
  onSelect,
}: {
  chapter: ChronicleChapter;
  selected: boolean;
  onSelect: (chapterId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(chapter.id)}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left ${
        selected ? "bg-parchment-50 shadow-card" : "hover:bg-parchment-50/60"
      }`}
    >
      <span className="w-6 shrink-0 text-center font-display text-sm font-semibold text-gold-700">
        {chapter.sessionNumber ?? "·"}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate font-display text-sm font-semibold ${
            selected ? "text-parchment-900" : "text-parchment-700"
          }`}
        >
          {chapter.title}
        </span>
        <span className="block text-[11.5px] text-parchment-500">
          {chapter.noteCount} {chapter.noteCount === 1 ? "note" : "notes"}
        </span>
      </span>
      {chapter.startedAt && (
        <span className="shrink-0 whitespace-nowrap text-[11px] text-parchment-400">
          {formatJournalDate(chapter.startedAt)}
        </span>
      )}
      {selected && <span className="h-[7px] w-[7px] shrink-0 rotate-45 bg-gold-600" />}
    </button>
  );
}
