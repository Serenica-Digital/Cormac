import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Office sideloading requires HTTPS on a trusted localhost cert. `pnpm certs`
 * (office-addin-dev-certs) installs one at this path; if it is not there yet the
 * dev server falls back to HTTP and the sideload runbook flags it. We never bake
 * a cert into the image: production serves the pane as static assets behind real
 * TLS (deployment-setup.md, Juno onboarding question 12).
 */
function devCerts(): { cert: Buffer; key: Buffer } | undefined {
  const dir = resolve(homedir(), '.office-addin-dev-certs');
  const cert = resolve(dir, 'localhost.crt');
  const key = resolve(dir, 'localhost.key');
  if (existsSync(cert) && existsSync(key)) {
    return { cert: readFileSync(cert), key: readFileSync(key) };
  }
  return undefined;
}

// envDir points at the repo root so the single root .env supplies VITE_* vars,
// exactly as apps/web does.
export default defineConfig({
  plugins: [react()],
  envDir: '../..',
  // host: true binds all interfaces (Docker/CI parity with apps/web); Office
  // still loads https://localhost:5175. https is on only when the dev certs
  // exist, so the container serves plain HTTP for its healthcheck.
  server: { port: 5175, host: true, https: devCerts() },
  preview: { port: 5175, host: true, https: devCerts() },
  build: {
    // Three entry pages: the task pane itself, plus the Lane B dialog relay and
    // OAuth callback. relay and callback share the dialog's origin so the PKCE
    // verifier persists between them; tokens cross to the pane via messageParent,
    // never through shared storage.
    rollupOptions: {
      input: {
        taskpane: resolve(__dirname, 'index.html'),
        relay: resolve(__dirname, 'relay.html'),
        callback: resolve(__dirname, 'callback.html'),
      },
    },
  },
});
