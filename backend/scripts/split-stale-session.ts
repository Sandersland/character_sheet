// One-off repair: before SESSION_INACTIVITY_MS existed, a session nobody pressed End on stayed
// active across sittings and absorbed the next sitting's events and journal entries. This splits
// such a session at every idle gap of SESSION_INACTIVITY_MS or more (or at explicit --split-at
// instants) into one ended session per sitting, then recomputes each recap.
//
// Existing sessionEnded events are discarded and rewritten per sitting: an auto-close that fires
// before this runs stamps them with the close time, which would otherwise read as a sitting of
// its own.
//
// Dry run unless --apply. Run with no session id to list sessions that span an idle gap.
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client.js";
import { prisma as defaultPrisma } from "@/lib/core/prisma.js";
import { recomputeSummaries, SESSION_INACTIVITY_MS } from "@/lib/session/sessions.js";

export interface ActivityItem {
  kind: "event" | "journal" | "join";
  id: string;
  characterId: string;
  at: Date;
}

export interface Segment {
  start: Date;
  end: Date;
  items: ActivityItem[];
}

export function planSegments(items: ActivityItem[], splitAt: Date[] = []): Segment[] {
  const sorted = [...items].sort((a, b) => a.at.getTime() - b.at.getTime());
  const boundaries = [...splitAt].sort((a, b) => a.getTime() - b.getTime());
  const groups: ActivityItem[][] = [];
  let groupKey: number | null = null;
  let previous: ActivityItem | null = null;

  for (const item of sorted) {
    const key: number = boundaries.length > 0
      ? boundaries.filter((b) => b.getTime() <= item.at.getTime()).length
      : (groupKey ?? 0) + (previous && item.at.getTime() - previous.at.getTime() >= SESSION_INACTIVITY_MS ? 1 : 0);
    if (key !== groupKey) groups.push([]);
    groups[groups.length - 1].push(item);
    groupKey = key;
    previous = item;
  }

  return groups.map((group) => ({ start: group[0].at, end: group[group.length - 1].at, items: group }));
}

const sessionInclude = {
  participants: { include: { character: { select: { id: true, name: true } } } },
} as const;

async function loadSession(db: PrismaClient, sessionId: string) {
  const session = await db.session.findUniqueOrThrow({ where: { id: sessionId }, include: sessionInclude });
  const [events, journal] = await Promise.all([
    db.characterEvent.findMany({
      where: { sessionId, type: { not: "sessionEnded" } },
      select: { id: true, characterId: true, createdAt: true },
    }),
    db.journalEntry.findMany({ where: { sessionId }, select: { id: true, characterId: true, createdAt: true } }),
  ]);
  const items: ActivityItem[] = [
    ...events.map((e) => ({ kind: "event" as const, id: e.id, characterId: e.characterId, at: e.createdAt })),
    ...journal.map((j) => ({ kind: "journal" as const, id: j.id, characterId: j.characterId, at: j.createdAt })),
    ...session.participants.map((p) => ({ kind: "join" as const, id: p.id, characterId: p.characterId, at: p.joinedAt })),
  ];
  return { session, items };
}

type LoadedSession = Awaited<ReturnType<typeof loadSession>>["session"];

function idsOf(segment: Segment, kind: ActivityItem["kind"]): string[] {
  return segment.items.filter((i) => i.kind === kind).map((i) => i.id);
}

function firstActivityByCharacter(segment: Segment, participantIds: Set<string>): Map<string, Date> {
  const first = new Map<string, Date>();
  for (const item of segment.items) {
    if (participantIds.has(item.characterId) && !first.has(item.characterId)) first.set(item.characterId, item.at);
  }
  return first;
}

function leftAtWithin(leftAt: Date | null, segment: Segment): Date | null {
  return leftAt && leftAt >= segment.start && leftAt <= segment.end ? leftAt : null;
}

async function applySplit(db: PrismaClient, session: LoadedSession, segments: Segment[]): Promise<string[]> {
  const participantIds = new Set(session.participants.map((p) => p.characterId));
  const leftAtByCharacter = new Map(session.participants.map((p) => [p.characterId, p.leftAt]));

  return db.$transaction(async (tx) => {
    await tx.characterEvent.deleteMany({ where: { sessionId: session.id, type: "sessionEnded" } });
    const sessionIds: string[] = [];

    for (const [index, segment] of segments.entries()) {
      const present = firstActivityByCharacter(segment, participantIds);
      let sessionId = session.id;

      if (index === 0) {
        await tx.session.update({
          where: { id: session.id },
          data: { status: "ended", endedAt: segment.end, combatActive: false, round: 0 },
        });
        await tx.sessionParticipant.deleteMany({ where: { sessionId, characterId: { notIn: [...present.keys()] } } });
        for (const p of session.participants.filter((p) => present.has(p.characterId))) {
          await tx.sessionParticipant.update({ where: { id: p.id }, data: { leftAt: leftAtWithin(p.leftAt, segment) } });
        }
      } else {
        const created = await tx.session.create({
          data: {
            campaignId: session.campaignId,
            arcId: session.arcId,
            title: session.title,
            status: "ended",
            startedAt: segment.start,
            endedAt: segment.end,
            participants: {
              create: [...present].map(([characterId, joinedAt]) => ({
                characterId,
                joinedAt,
                leftAt: leftAtWithin(leftAtByCharacter.get(characterId) ?? null, segment),
              })),
            },
          },
        });
        sessionId = created.id;
        await tx.characterEvent.updateMany({ where: { id: { in: idsOf(segment, "event") } }, data: { sessionId } });
        await tx.journalEntry.updateMany({ where: { id: { in: idsOf(segment, "journal") } }, data: { sessionId } });
      }

      const batchId = randomUUID();
      for (const characterId of present.keys()) {
        await tx.characterEvent.create({
          data: { characterId, category: "session", type: "sessionEnded", summary: "Session ended", batchId, sessionId, createdAt: segment.end },
        });
      }
      const refreshed = await tx.session.findUniqueOrThrow({ where: { id: sessionId }, include: sessionInclude });
      await recomputeSummaries(tx, refreshed);
      sessionIds.push(sessionId);
    }
    return sessionIds;
  });
}

export async function splitSession(
  sessionId: string,
  options: { apply: boolean; splitAt?: Date[] },
  db: PrismaClient = defaultPrisma,
): Promise<{ segments: Segment[]; sessionIds: string[] }> {
  const { session, items } = await loadSession(db, sessionId);
  const segments = planSegments(items, options.splitAt);
  const lastActivity = segments.at(-1)?.end;
  if (session.status === "active" && lastActivity && Date.now() - lastActivity.getTime() < SESSION_INACTIVITY_MS) {
    throw new Error(`Session ${sessionId} had activity in the last 12h; it may still be in play.`);
  }
  if (!options.apply || segments.length < 2) return { segments, sessionIds: [] };
  return { segments, sessionIds: await applySplit(db, session, segments) };
}

export async function findSplitCandidates(db: PrismaClient = defaultPrisma) {
  const sessions = await db.session.findMany({
    select: { id: true, title: true, status: true, campaign: { select: { name: true } } },
    orderBy: { startedAt: "asc" },
  });
  const candidates = [];
  for (const s of sessions) {
    const { items } = await loadSession(db, s.id);
    const segments = planSegments(items);
    if (segments.length > 1) candidates.push({ ...s, segments });
  }
  return candidates;
}

function describeSegments(segments: Segment[]): string {
  return segments
    .map((s, i) => {
      const count = (kind: ActivityItem["kind"]) => s.items.filter((item) => item.kind === kind).length;
      const characters = new Set(s.items.map((item) => item.characterId)).size;
      return `  sitting ${i + 1}: ${s.start.toISOString()} → ${s.end.toISOString()}  events=${count("event")} journal=${count("journal")} characters=${characters}`;
    })
    .join("\n");
}

function parseArgs(argv: string[]) {
  const splitAt = argv.flatMap((arg, i) => (argv[i - 1] === "--split-at" ? [new Date(arg)] : []));
  if (splitAt.some((d) => Number.isNaN(d.getTime()))) throw new Error("--split-at needs an ISO timestamp");
  const sessionId = argv.find((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--split-at");
  return { sessionId, splitAt, apply: argv.includes("--apply") };
}

async function main(argv: string[]): Promise<void> {
  const { sessionId, splitAt, apply } = parseArgs(argv);
  if (!sessionId) {
    const candidates = await findSplitCandidates();
    if (candidates.length === 0) console.log("No session spans an idle gap.");
    for (const c of candidates) {
      console.log(`${c.id}  [${c.status}] ${c.campaign?.name ?? "(solo)"} — ${c.title ?? "untitled"}\n${describeSegments(c.segments)}`);
    }
    return;
  }
  const { segments, sessionIds } = await splitSession(sessionId, { apply, splitAt });
  console.log(`Session ${sessionId} → ${segments.length} sitting(s):\n${describeSegments(segments)}`);
  if (segments.length < 2) console.log("Nothing to split.");
  else if (!apply) console.log("Dry run — rerun with --apply to write.");
  else console.log(`Applied. Sessions: ${sessionIds.join(", ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2))
    .then(() => defaultPrisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await defaultPrisma.$disconnect();
      process.exit(1);
    });
}
