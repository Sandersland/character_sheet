/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API (defaults to http://localhost:4000/api when unset). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Vite resolves imported font assets to a hashed, same-origin URL string.
// (vite/client doesn't declare these in this version.) Used to hand troika a
// local font so it never fetches the unicode-font-resolver CDN (#408). troika's
// bundled parser supports woff (v1) but not woff2, so the dice font is woff.
declare module "*.woff" {
  const src: string;
  export default src;
}
