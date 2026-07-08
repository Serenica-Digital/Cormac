/**
 * Fail-fast env validation (the v0 pattern). Values are defined at dev-server
 * startup from `infisical run`-injected process env (see vite.config.ts);
 * a blank slot means the server was started outside that path.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is empty. Start the dev server through infisical: pnpm web:dev (repo root).`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  apiUrl: required('VITE_API_URL', import.meta.env.VITE_API_URL),
};
