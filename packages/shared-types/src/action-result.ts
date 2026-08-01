// executeAction transaction result wire type (#1528) — de-duplicates the
// declaration that was hand-mirrored between the backend's actions route and
// frontend/src/types/character/actions.ts (the exact #1369/#1370 duplicate
// those packages exist to prevent). Mirrors `ManeuverCastResult`'s shape
// (maneuvers.ts / frontend classes.ts): a row-driven cast-core op (e.g.
// Second Wind) rolls its effect server-side and reports the roll here so the
// client can fold it into a dice animation without re-deriving the number.
// Index-aligned 1:1 with the request's `operations`; every other op reports `{}`.
export interface ExecuteActionResult {
  roll?: number;
}
