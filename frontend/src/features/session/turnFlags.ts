// Feature flags for turn-UI surfaces that depend on systems not yet built (#737).
// Both default OFF so the UI degrades to today's reality:
//   - showInitiative: there is no server-side initiative / turn-order model yet
//     (epic #728, Decision #1). The rail is decorative scaffolding until that
//     system lands; flip this on to preview it.
//   - showMovement: speed / difficult-terrain tracking is a future feature.
export const showInitiative = false;
export const showMovement = false;
