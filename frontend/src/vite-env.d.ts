/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEFAULT_POD_PROVIDER?: string;
  readonly VITE_FRONTEND_URL?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_KIND_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
