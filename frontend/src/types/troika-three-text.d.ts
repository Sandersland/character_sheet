// `troika-three-text` ships no type declarations. We only touch its global
// config setter (see @/lib/troikaTextConfig, #408); declare just that surface.
declare module "troika-three-text" {
  export function configureTextBuilder(config: { useWorker?: boolean }): void;
}
