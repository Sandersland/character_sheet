// Design-system barrel for design-sync. Re-exports the domain-agnostic UI
// primitives (frontend/src/components/ui) as named exports so the converter
// can bundle them into window.CharacterSheetDS. Not imported by the app.
export { default as Badge } from "./src/components/ui/Badge";
export { default as Card } from "./src/components/ui/Card";
export { default as MeterBar } from "./src/components/ui/MeterBar";
export { default as Modal } from "./src/components/ui/Modal";
export { default as Tabs } from "./src/components/ui/Tabs";
