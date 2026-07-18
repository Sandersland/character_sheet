// Feature flags for turn-UI surfaces that depend on systems not yet built (#737).
// Defaults OFF so the UI degrades to today's reality:
//   - showMovement: speed / difficult-terrain tracking is a future feature.
//   - showInitiative: the mobile turn-order strip (#1023 Phase B–D). Markup may
//     land, but the app doesn't model enemies/turn-order yet, so it stays OFF.
export const showMovement = false;
export const showInitiative = false;
