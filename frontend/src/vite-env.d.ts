/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the backend API (defaults to http://localhost:4000/api when unset). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
