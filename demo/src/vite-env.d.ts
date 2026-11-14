/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SDK_KEY_DEV?: string;
  readonly VITE_SDK_KEY_PROD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
