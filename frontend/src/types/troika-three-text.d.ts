// `troika-three-text` ships no type declarations; we only touch its global
// config setter (`configureTextBuilder`), so only that surface is declared (#408).
declare module "troika-three-text" {
  export function configureTextBuilder(config: { useWorker?: boolean }): void;
}
