// The frontend's only import path for backend calls (#1270): every component
// imports from "@/api/client", never a domain module directly — that's what
// keeps `vi.mock("@/api/client")` full-factory replacement working across the
// ~85 test files that use it. `export *` (not a named list) so adding an
// endpoint to a domain module never touches this file — the merge-conflict
// convergence point this split exists to kill.
export { setUnauthorizedHandler } from "@/api/http";
export * from "@/api/auth";
export * from "@/api/catalog";
export * from "@/api/spells";
export * from "@/api/inventory";
export * from "@/api/abilities";
export * from "@/api/disciplines";
export * from "@/api/weapon-bond";
export * from "@/api/characters";
export * from "@/api/combat";
export * from "@/api/leveling";
export * from "@/api/campaign";
export * from "@/api/entities";
export * from "@/api/inbox";
export * from "@/api/journal";
export * from "@/api/session";
export * from "@/api/preferences";
