import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// envDir points at the repo root so the single root .env supplies VITE_* vars.
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  server: { port: 5174, host: true },
});
