import { prisma } from "@/lib/core/prisma.js";

export interface PinnedEvent {
  category: string;
  type: string;
  summary: string;
  before: unknown;
  after: unknown;
  data: unknown;
}

/**
 * Test-only oracle for "the audit trail one transaction wrote", used to pin the
 * ability endpoints' events before and after the #1275 URL move — a pin captured
 * on the old URL that still passes on the new one is the byte-identity evidence.
 *
 * Events written inside one batch share a createdAt, so rows are sorted by their
 * serialized payload rather than by time: unstable ordering would make the pin
 * flaky without telling us anything about behaviour. Pass `types` only when the
 * test's own setup wrote unrelated events (e.g. learnManeuver before a cast).
 */
export async function readPinnedEvents(characterId: string, types?: string[]): Promise<PinnedEvent[]> {
  const rows = await prisma.characterEvent.findMany({ where: { characterId } });
  return rows
    .filter((row) => !types || types.includes(row.type))
    .map((row) => ({
      category: row.category as string,
      type: row.type as string,
      summary: row.summary,
      before: row.before,
      after: row.after,
      data: row.data,
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
