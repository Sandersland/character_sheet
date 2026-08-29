import type { Request, Response } from "express";

// Optional ?class= (#1377): absent is success (unfiltered catalog); lowercased to match SpellClass.className's stored casing. An unknown class name just answers with an empty list, not an error.
export function parseClassFilterOr400(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; className?: string } | { ok: false } {
  const raw = req.query.class;
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string" || raw.trim() === "") {
    res.status(400).json({ error: "Invalid class: must be a non-empty class name" });
    return { ok: false };
  }
  return { ok: true, className: raw.trim().toLowerCase() };
}

// Optional ?subclassId= (#1631): absent is success (no widening); an unresolved id just adds no extra spells, not an error.
export function parseSubclassIdParam(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; subclassId?: string } | { ok: false } {
  const raw = req.query.subclassId;
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string" || raw.trim() === "") {
    res.status(400).json({ error: "Invalid subclassId: must be a non-empty id" });
    return { ok: false };
  }
  return { ok: true, subclassId: raw.trim() };
}

// Optional ?classes= (#1495), comma-separated class names gating the offered Fighting Style set; absent is success. Unlike parseClassFilterOr400, no lowercasing happens here — Feat.classes matching is already case-insensitive downstream.
export function parseClassesParam(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; classNames?: string[] } | { ok: false } {
  const raw = req.query.classes;
  if (raw === undefined) return { ok: true };
  // A repeated ?classes= key parses as an array under Express's extended query parser, not a string.
  if (Array.isArray(raw)) {
    res.status(400).json({ error: "Invalid classes: expected a single comma-separated string, not a repeated/array query value" });
    return { ok: false };
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    res.status(400).json({ error: "Invalid classes: must be a non-empty comma-separated class name list" });
    return { ok: false };
  }
  const classNames = raw.split(",").map((c) => c.trim()).filter((c) => c.length > 0);
  if (classNames.length === 0) {
    res.status(400).json({ error: "Invalid classes: must be a non-empty comma-separated class name list" });
    return { ok: false };
  }
  return { ok: true, classNames };
}

// Optional ?characterId= (#1811): absent is success. Ownership is NOT checked here — that stays assertCharacterAccess's job at the route, so 404-vs-403 resolves against real character data.
export function parseCharacterIdParam(
  req: Pick<Request, "query">,
  res: Response,
): { ok: true; characterId?: string } | { ok: false } {
  const raw = req.query.characterId;
  if (raw === undefined) return { ok: true };
  if (typeof raw !== "string" || raw.trim() === "") {
    res.status(400).json({ error: "Invalid characterId: must be a non-empty id" });
    return { ok: false };
  }
  return { ok: true, characterId: raw.trim() };
}
