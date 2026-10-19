/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_POSTHOG_ENABLE_DEV?: string;
  readonly VITE_POSTHOG_ERROR_TRACKING?: string;
  readonly VITE_POSTHOG_WEB_VITALS?: string;
  readonly VITE_POSTHOG_TRAFFIC_TYPE?: 'external' | 'internal' | 'test';
  readonly VITE_POSTHOG_CAMPAIGNS?: string;
}
