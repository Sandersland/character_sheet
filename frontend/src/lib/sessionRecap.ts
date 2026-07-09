import type { ParticipantSummary, SessionParticipant } from "@/types/character";

// A participant carrying a computed summary (post-end participants always do).
export type SummarizedParticipant = SessionParticipant & { summary: ParticipantSummary };

export function formatDuration(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} hr`;
  return `${hours} hr ${minutes} min`;
}

export function formatTimeRange(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  const dateFmt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const timeFmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleDateString(undefined, dateFmt)}, ${start.toLocaleTimeString(
    undefined,
    timeFmt,
  )} – ${end.toLocaleTimeString(undefined, timeFmt)}`;
}

// Slots spent as [level, count] pairs, dropping zero counts, ascending by level.
export function sortSlotsSpent(slotsSpent: Record<string, number>): [string, number][] {
  return Object.entries(slotsSpent)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => Number(a) - Number(b));
}

export function withSummary(participants: SessionParticipant[]): SummarizedParticipant[] {
  return participants.filter((p): p is SummarizedParticipant => Boolean(p.summary));
}
