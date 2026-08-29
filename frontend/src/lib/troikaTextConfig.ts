import { configureTextBuilder } from "troika-three-text";

// Forces troika-three-text onto the main thread (#408) — its Worker rehydrates
// via importScripts(blob:), which our single-origin CSP's script-src blocks;
// must run at bootstrap since configureTextBuilder is a one-shot no-op after
// the first font request.
export function configureDiceText(): void {
  configureTextBuilder({ useWorker: false });
}
