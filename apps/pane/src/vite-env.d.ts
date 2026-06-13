/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Entra app (client) id for Lanes A/B. Unset means the Microsoft lanes are
   * offered as unavailable until the sign-in-only app registration exists. */
  readonly VITE_ENTRA_CLIENT_ID?: string;
  /** Entra authority; defaults to the common multi-tenant endpoint. */
  readonly VITE_ENTRA_AUTHORITY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
