// One-time migration (#1030): Session.round/combatActive are new authoritative
// columns (see schema.prisma's why-comment on Session). Sessions created
// before the migration have round=0 by column default regardless of how far
// combat actually got, so this seeds `round` from each session's latest
// combatRoundAdvanced event via the existing latestCombatRound() rule
// (backend/src/lib/session/doorway.ts) — reused, not re-derived.
//
// Deliberately does NOT infer `combatActive`: the event log has no reliable
// way to tell "combat is still running" from "combat ended" for an old
// session (combatEnded events aren't always logged, e.g. a session left
// active across a server restart pre-#1030). A session that was genuinely
// mid-combat at migration time comes back with combatActive=false and its
// last-known round; a participant must press Start Combat again, which is an
// acceptable one-time reset for a pre-production app (#1030 report).
//
// Idempotent: only touches sessions whose round is still the column default
// (0) and that have at least one combatRoundAdvanced event; a second run is a
// no-op over already-backfilled sessions.
//
// Imports only lib/ rule functions + prisma (no route/serialize code), per
// the migration-script pattern the sibling scripts in this directory follow.
import type { PrismaClient } from "@/generated/prisma/client.js";
import { prisma as defaultPrisma } from "@/lib/core/prisma.js";
import { latestCombatRound } from "@/lib/session/doorway.js";

export async function backfillSessionCombatRound(
  prisma: PrismaClient = defaultPrisma,
): Promise<{ scannedSessions: number; changedSessions: string[] }> {
  const candidates = await prisma.session.findMany({
    where: { round: 0 },
    select: { id: true },
  });

  const changedSessions: string[] = [];
  for (const { id } of candidates) {
    const round = await latestCombatRound(id);
    if (round === null || round === 0) continue;
    await prisma.session.update({ where: { id }, data: { round } });
    changedSessions.push(id);
  }

  return { scannedSessions: candidates.length, changedSessions };
}

// Thin CLI: run the backfill against DATABASE_URL and report the outcome.
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillSessionCombatRound()
    .then((result) => {
      console.log(`Scanned ${result.scannedSessions} session(s) at round 0; backfilled ${result.changedSessions.length}.`);
      return defaultPrisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await defaultPrisma.$disconnect();
      process.exit(1);
    });
}
