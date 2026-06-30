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

/**
 * Format a capture timestamp as a local time-of-day, e.g. "3:45 PM". Unlike
 * `date`, `loggedAt` is a precise instant, so it's formatted in local time.
 * An unparseable input is returned verbatim.
 */
export function formatJournalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
