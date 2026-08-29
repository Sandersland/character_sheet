// The backend stores the picked day at UTC midnight, so this MUST format in UTC — local time would shift the day backwards for timezones behind UTC.
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

// Calendar-day diff, not elapsed time — dates are UTC-midnight (see formatJournalDate).
export function formatRelativeDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = Math.floor(Date.now() / DAY_MS) - Math.floor(d.getTime() / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 30) return `${days} days ago`;
  return formatJournalDate(iso);
}

export function formatJournalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
