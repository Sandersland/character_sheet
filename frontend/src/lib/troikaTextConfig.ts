import { configureTextBuilder } from "troika-three-text";

/**
 * Force `troika-three-text` (used by every `@react-three/drei` `<Text>`, e.g. the
 * 3D dice face numbers) to typeset on the main thread instead of in a Web Worker.
 *
 * Why (#408): troika's default worker is created from a `blob:` URL and then calls
 * `importScripts(blob:…)` to rehydrate its module. `importScripts` is governed by the
 * CSP `script-src` directive — NOT `worker-src` — and our single-origin CSP
 * deliberately keeps `blob:` out of `script-src` (see backend/src/lib/security.ts +
 * security.test.ts, #150/#151). So the worker fails ("worker module init function
 * failed to rehydrate"), `<Text>` suspends forever, and any scene relying on it
 * (the ability-score dice roller) never completes. Running text on the main thread
 * removes the only worker/`importScripts` path — no CSP loosening required.
 *
 * `configureTextBuilder` mutates a module-level singleton and is a no-op once the
 * first font has been requested, so this MUST run at app bootstrap, before anything
 * renders a `<Text>`.
 */
export function configureDiceText(): void {
  configureTextBuilder({ useWorker: false });
}
