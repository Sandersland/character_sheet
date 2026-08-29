/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API (defaults to http://localhost:4000/api when unset). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// troika's bundled parser supports woff (v1) but not woff2, so the dice font is served as woff to avoid the unicode-font-resolver CDN fetch.
declare module "*.woff" {
  const src: string;
  export default src;
}
