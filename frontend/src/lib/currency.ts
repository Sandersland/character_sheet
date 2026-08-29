import type { Currency } from "@/types/character";

export function toCopper(c: Currency): number {
  return c.cp + c.sp * 10 + c.gp * 100 + c.pp * 1000;
}

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

// Adds each denomination independently; does not carry up (8 gp + 7 gp
// stays 15 gp, never 1 pp 5 gp).
export function addCurrency(a: Currency, b: Currency): Currency {
  return { cp: a.cp + b.cp, sp: a.sp + b.sp, gp: a.gp + b.gp, pp: a.pp + b.pp };
}

export function formatCurrency(c: Currency): string {
  const parts: string[] = [];
  if (c.pp) parts.push(`${c.pp} pp`);
  if (c.gp) parts.push(`${c.gp} gp`);
  if (c.sp) parts.push(`${c.sp} sp`);
  if (c.cp) parts.push(`${c.cp} cp`);
  return parts.length > 0 ? parts.join(" ") : "0 gp";
}

export function splitLumpSum(total: Currency, n: number): Currency[] {
  const lines = Math.max(1, Math.floor(n));
  const totalCopper = toCopper(total);
  const base = Math.floor(totalCopper / lines);
  const remainder = totalCopper - base * lines;
  return Array.from({ length: lines }, (_, i) =>
    fromCopper(base + (i < remainder ? 1 : 0))
  );
}
