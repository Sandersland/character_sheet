// Feature flags for turn-UI surfaces that depend on systems not yet built (#737).
// Defaults OFF so the UI degrades to today's reality:
//   - showMovement: speed / difficult-terrain tracking is a future feature.
// (An initiative rail flag once lived here too; it was dropped because the app
//  doesn't model enemies, so there's no turn-order to render.)
export const showMovement = false;
