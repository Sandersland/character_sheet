// Keys live here so no call site ever string-literals one — a typo'd key is a
// silent cache miss, not a crash. Ids are nullable because a hook with no id
// still needs a stable key while its query is skipped. Campaign-scoped resources
// nest under one prefix so a cross-resource mutation can invalidate a whole
// campaign in one call (#1283).
//
// Namespaces are added incrementally, one per commit, alongside their first
// consumer — an export with no importer yet fails fallow's unused-exports gate.

export const characterKeys = {
  all: ["characters"] as const,
  list: () => [...characterKeys.all, "list"] as const,
  detail: (id: string | null | undefined) => [...characterKeys.all, "detail", id] as const,
};

export const referenceKeys = { all: ["reference"] as const };
