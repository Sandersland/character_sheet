import { prisma } from "@/lib/core/prisma.js";

export interface PinnedEvent {
  category: string;
  type: string;
  summary: string;
  before: unknown;
  after: unknown;
  data: unknown;
}

// Events written inside one batch share a createdAt, so rows are sorted by their serialized payload rather than by time — unstable ordering would make the pin flaky.
// Pass `types` only when the test's own setup wrote unrelated events (e.g. learnManeuver before a cast).
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
