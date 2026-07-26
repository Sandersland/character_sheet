// One-time migration (#1030): Session.round/combatActive are new authoritative
// columns (see the Session model's why-comment). Sessions created before the
// migration have round=0/combatActive=false by column default regardless of
// how far combat actually got, so this seeds both from each session's combat
// event history via latestCombatRound/latestCombatActive — reused, not
// re-derived, so the backfill has one source for "what combat looked like
// last" rather than two divergent queries.
//
// A session whose events say it's still mid-combat but never logged a
// combatRoundAdvanced (started, never advanced past round 1) backfills to
// round 1 — combatActive=true always implies round>=1 in the live model
// (startCombat sets both together), so this keeps the backfilled state
// internally consistent with a normally-started encounter.
//
// Idempotent: only touches sessions whose round is still the column default
// (0), and only writes when the event history resolves to something other
// than the defaults (round 0, inactive); a second run is a no-op over
// already-backfilled sessions.
//
// Imports only lib/ rule functions + prisma (no route/serialize code), per
// the migration-script pattern the sibling scripts in this directory follow.
import type { PrismaClient } from "@/generated/prisma/client.js";
import { prisma as defaultPrisma } from "@/lib/core/prisma.js";
import { latestCombatRound, latestCombatActive } from "@/lib/session/doorway.js";

export async function backfillSessionCombatRound(
  prisma: PrismaClient = defaultPrisma,
): Promise<{ scannedSessions: number; changedSessions: string[] }> {
  const candidates = await prisma.session.findMany({
    where: { round: 0 },
    select: { id: true },
  });

  const changedSessions: string[] = [];
  for (const { id } of candidates) {
    const [round, active] = await Promise.all([latestCombatRound(id), latestCombatActive(id)]);
    const resolvedRound = round ?? (active ? 1 : 0);
    if (resolvedRound === 0 && !active) continue;
    await prisma.session.update({ where: { id }, data: { round: resolvedRound, combatActive: active } });
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
