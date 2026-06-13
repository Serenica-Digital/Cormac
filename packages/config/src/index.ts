/**
 * @cormac/config — the single source of truth for environment and secrets (ADR-034).
 *
 * The default entry is isomorphic (no Node imports), so web/pane can bundle it.
 * The Node-only loader lives behind the `@cormac/config/server` subpath.
 */
export * from './appEnv.js';
export * from './manifest.js';
export * from './browser.js';
