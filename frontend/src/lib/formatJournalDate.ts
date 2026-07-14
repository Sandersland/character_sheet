/**
 * Format an ISO date string for display, e.g. "Jun 22, 2026". Journal dates are
 * calendar dates with no meaningful time-of-day: the backend stores the picked
 * day at UTC midnight, so we MUST format in UTC. Formatting in local time would
 * shift the day backwards for timezones behind UTC (e.g. "Jun 22" → "Jun 21").
 *
 * An unparseable input is returned verbatim rather than rendered as "Invalid Date".
 */
export function formatJournalDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const DAY_MS = 86_400_000;

// "today"/"yesterday"/"N days ago" by UTC calendar-day diff (mention dates are
// UTC-midnight, see above); absolute date past 30 days, verbatim on parse failure.
export function formatRelativeDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = Math.floor(Date.now() / DAY_MS) - Math.floor(d.getTime() / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 30) return `${days} days ago`;
  return formatJournalDate(iso);
}

// Format a capture timestamp as local time-of-day ("3:45 PM"); returns verbatim on parse failure.
export function formatJournalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
