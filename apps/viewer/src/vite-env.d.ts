/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MULTIBENCH_REPO?: string;
  readonly VITE_MULTIBENCH_REF?: string;
  readonly VITE_SHA_POLL_MS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
