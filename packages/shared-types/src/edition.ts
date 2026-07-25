// Mirrors the Prisma RulesEdition enum (#1285). A string union rather than a
// re-export so the package stays pure types with no dependency on the generated
// client; the backend's editionOf pins the two together.
export type RulesEdition = "EDITION_2014" | "EDITION_2024";
