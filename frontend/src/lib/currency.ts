/**
 * Pure currency math for the inventory bulk-sell flow (issue #103).
 *
 * All arithmetic is done in copper — the smallest denomination — to dodge
 * floating-point and mixed-denomination rounding. The 5e exchange is
 * cp=1, sp=10, gp=100, pp=1000.
 */

import type { Currency } from "@/types/character";

/** Total value of a Currency expressed in copper pieces. */
export function toCopper(c: Currency): number {
  return c.cp + c.sp * 10 + c.gp * 100 + c.pp * 1000;
}

/**
 * Greedy decomposition of a copper total back into a Currency, using the
 * largest denominations first (pp → gp → sp → cp). Round-trips with
 * `toCopper` for any non-negative integer.
 */
export function fromCopper(total: number): Currency {
  let remaining = Math.max(0, Math.floor(total));
  const pp = Math.floor(remaining / 1000);
  remaining -= pp * 1000;
  const gp = Math.floor(remaining / 100);
  remaining -= gp * 100;
  const sp = Math.floor(remaining / 10);
  remaining -= sp * 10;
  const cp = remaining;
  return { cp, sp, gp, pp };
}

/**
 * Field-wise sum of two Currency values — adds each denomination on its own
 * and does NOT carry up (so 8 gp + 7 gp stays "15 gp", never "1 pp 5 gp").
 * Use this to keep a summary faithful to the denominations actually
 * transacted; use `toCopper`/`fromCopper` when a normalized minimal
 * representation is wanted instead.
 */
export function addCurrency(a: Currency, b: Currency): Currency {
  return { cp: a.cp + b.cp, sp: a.sp + b.sp, gp: a.gp + b.gp, pp: a.pp + b.pp };
}

/**
 * Render a Currency as an UNSIGNED, human-readable amount: only nonzero
 * denominations, largest-first (pp → gp → sp → cp), joined by a space —
 * e.g. `{gp:45}` → "45 gp", `{pp:1,gp:2}` → "1 pp 2 gp". An all-zero amount
 * renders as "0 gp" so a free/zero-value line still reads naturally.
 *
 * (This is the plain-magnitude formatter; signed deltas — "+5 gp" / "-2 sp"
 * — are rendered where activity-log deltas are shown.)
 */
export function formatCurrency(c: Currency): string {
  const parts: string[] = [];
  if (c.pp) parts.push(`${c.pp} pp`);
  if (c.gp) parts.push(`${c.gp} gp`);
  if (c.sp) parts.push(`${c.sp} sp`);
  if (c.cp) parts.push(`${c.cp} cp`);
  return parts.length > 0 ? parts.join(" ") : "0 gp";
}

/**
 * Split a lump-sum payment evenly across `n` lines so the lines sum EXACTLY
 * to the original total (no copper lost to rounding). Working in copper, each
 * line gets the base share `floor(total/n)`; the leftover copper (`total % n`)
 * is handed out one extra per line to the EARLIEST lines. Every line is then
 * decomposed via `fromCopper`. `n = 1` returns `[total]` in canonical form.
 */
export function splitLumpSum(total: Currency, n: number): Currency[] {
  const lines = Math.max(1, Math.floor(n));
  const totalCopper = toCopper(total);
  const base = Math.floor(totalCopper / lines);
  const remainder = totalCopper - base * lines;
  return Array.from({ length: lines }, (_, i) =>
    fromCopper(base + (i < remainder ? 1 : 0))
  );
}
