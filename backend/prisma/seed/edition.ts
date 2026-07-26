// Local mirror of the backend/shared-types RulesEdition union (#1306) — seed
// data modules can't import `@/lib/` or the shared-types package (tsx has no
// alias resolution here, same limitation noted on FeatCategory in feats.ts).
// `undefined`/omitted on a seed row means "shared" (NULL column, valid in both
// editions); only a genuinely diverging row sets this explicitly.
export type SeedEdition = "EDITION_2014" | "EDITION_2024";
