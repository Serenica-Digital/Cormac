import { createRemoteJWKSet } from 'jose';
import { createServiceClient, type Db } from './db.js';
import { isProdLike, type Config } from './config.js';
import type { RuntimeLanes } from './runtime/types.js';

export type JwksResolver = ReturnType<typeof createRemoteJWKSet>;

/**
 * Process-wide dependencies, built once at boot and decorated onto the Fastify
 * instance. `db` is the service-role client: the only database handle in the
 * system that can write business records.
 */
export interface AppContext {
  config: Config;
  db: Db;
  jwks: JwksResolver;
  /**
   * The HS256 shared secret, or `null` in prod-like environments where only the
   * JWKS path is accepted. `null` is the security control: it makes the public
   * dev secret unusable for forging tokens in production.
   */
  hsSecret: Uint8Array | null;
  /**
   * The Hermes transport lanes (ADR-0001), injectable so tests fake them. A
   * null lane means that agent runtime is not configured; its route refuses
   * with 503 instead of half-working, and the other lane is unaffected.
   */
  runtimes: RuntimeLanes;
}

export function buildAppContext(config: Config, runtimes?: Partial<RuntimeLanes> | null): AppContext {
  const db = createServiceClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  // Supabase signs user tokens asymmetrically (ES256) and publishes the public
  // keys at this JWKS. Verifying against it is the production-correct path; the
  // HS256 shared secret remains as the local-stack fallback and is disabled
  // entirely in prod-like environments.
  const jwks = createRemoteJWKSet(new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  const hsSecret =
    isProdLike(config.APP_ENV) || !config.SUPABASE_JWT_SECRET
      ? null
      : new TextEncoder().encode(config.SUPABASE_JWT_SECRET);
  return {
    config,
    db,
    jwks,
    hsSecret,
    runtimes: { authoring: runtimes?.authoring ?? null, operations: runtimes?.operations ?? null },
  };
}
