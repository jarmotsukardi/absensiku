/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  readonly VITE_SENTRY_REPLAYS_SESSION_SAMPLE_RATE?: string;
  readonly VITE_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_ENV?: string;
  readonly VITE_PRODUCTION_SUPABASE_PROJECT_REF?: string;
  readonly VITE_ALLOW_LOCALHOST_PROD_WRITE?: string;
  readonly VITE_SUPABASE_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
