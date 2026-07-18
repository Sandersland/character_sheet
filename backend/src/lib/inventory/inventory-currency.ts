import { Prisma } from "@/generated/prisma/client.js";

// Same {cp,sp,gp,pp} shape as Character.currency and Item/InventoryItem.cost.
// The index signature is just to satisfy Prisma's InputJsonObject structural
// requirement when this gets written to a Json column — every real field is
// still named and typed above it.
export interface Currency {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
  [key: string]: number;
}

export class InsufficientCurrencyError extends Error {}
export class InvalidInventoryOperationError extends Error {}
// Attunement cap breach — carries an explicit 409 (conflict) so the transactions
// endpoint surfaces it distinctly from a plain 400 validation error.
export class AttunementLimitError extends InvalidInventoryOperationError {
  status = 409;
}

function applyCurrencyDelta(current: Currency, delta: Currency, sign: 1 | -1): Currency {
  const next: Currency = {
    cp: current.cp + sign * delta.cp,
    sp: current.sp + sign * delta.sp,
    gp: current.gp + sign * delta.gp,
    pp: current.pp + sign * delta.pp,
  };
  if (next.cp < 0 || next.sp < 0 || next.gp < 0 || next.pp < 0) {
    throw new InsufficientCurrencyError("Not enough currency for this transaction");
  }
  return next;
}

// No cross-denomination "making change" — the frontend always edits the
// same 4 fields it prefilled from the catalog's `cost`, so a debit/credit
// is applied per-denomination, not as a single fungible total.
export function currencyDebit(current: Currency, amount: Currency): Currency {
  return applyCurrencyDelta(current, amount, -1);
}

export function currencyCredit(current: Currency, amount: Currency): Currency {
  return applyCurrencyDelta(current, amount, 1);
}

export function hasNonzeroCurrency(currency: Currency | undefined): currency is Currency {
  if (!currency) return false;
  return currency.cp !== 0 || currency.sp !== 0 || currency.gp !== 0 || currency.pp !== 0;
}

export function negate(currency: Currency): Currency {
  return { cp: -currency.cp, sp: -currency.sp, gp: -currency.gp, pp: -currency.pp };
}

export function asCurrency(json: Prisma.JsonValue | null): Currency | null {
  return json as Currency | null;
}

export function toJsonInput(value: Currency | null | undefined): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
  return value ?? Prisma.JsonNull;
}

export async function getCharacterCurrency(tx: Prisma.TransactionClient, characterId: string): Promise<Currency> {
  const character = await tx.character.findUnique({ where: { id: characterId }, select: { currency: true } });
  if (!character) {
    throw new InvalidInventoryOperationError(`Character not found: ${characterId}`);
  }
  return asCurrency(character.currency) ?? { cp: 0, sp: 0, gp: 0, pp: 0 };
}

export async function setCharacterCurrency(tx: Prisma.TransactionClient, characterId: string, currency: Currency) {
  await tx.character.update({ where: { id: characterId }, data: { currency } });
}

/** Formats a currency delta as "+7 gp" / "−5 gp 2 sp" for event summaries. */
export function formatCurrencyForSummary(delta: Currency | null | undefined): string | null {
  if (!delta) return null;
  const parts: string[] = [];
  const sign = (delta.pp > 0 || delta.gp > 0 || delta.sp > 0 || delta.cp > 0) ? "+" : "−";
  if (delta.pp !== 0) parts.push(`${Math.abs(delta.pp)} pp`);
  if (delta.gp !== 0) parts.push(`${Math.abs(delta.gp)} gp`);
  if (delta.sp !== 0) parts.push(`${Math.abs(delta.sp)} sp`);
  if (delta.cp !== 0) parts.push(`${Math.abs(delta.cp)} cp`);
  if (parts.length === 0) return null;
  return `${sign}${parts.join(" ")}`;
}
