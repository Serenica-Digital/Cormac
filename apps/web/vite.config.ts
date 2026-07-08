import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Env reaches the client through `infisical run` (the only lookup path,
// ADR-0005/0006): the dev server maps the injected server-side names onto the
// import.meta.env slots at startup. The anon key and local URL are public
// values; nothing secret is ever defined here.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 5175 to stay clear of the default 5173 (occupied by other tooling on the
  // dev machine); strictPort so a port collision fails loudly instead of
  // hopping somewhere CORS_ORIGINS does not allow.
  server: { port: 5175, strictPort: true },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL ?? ''),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY ?? ''),
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.CORMAC_API_URL ?? 'http://localhost:8080',
    ),
  },
});
