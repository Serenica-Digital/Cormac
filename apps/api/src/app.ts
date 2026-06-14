import { createServiceClient, type Db } from '@cormac/db';
import { isProdLike } from '@cormac/config';
import { createRemoteJWKSet } from 'jose';
import type { Config } from './config.js';

export type JwksResolver = ReturnType<typeof createRemoteJWKSet>;

/**
 * Process-wide dependencies, built once at boot and decorated onto the Fastify
 * instance. `db` is the service-role client: the only database handle in the
 * system that can write business records (ADR-005).
 */
export interface AppContext {
  config: Config;
  db: Db;
  jwks: JwksResolver;
  /**
   * The HS256 shared secret, or `null` in prod-like environments where only the
   * JWKS path is accepted. `null` is the security control: it makes the public
   * dev secret unusable for forging tokens in production (auth.ts, ADR-020/034).
   */
  hsSecret: Uint8Array | null;
}

export function buildAppContext(config: Config): AppContext {
  const db = createServiceClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  // Supabase signs user tokens asymmetrically (ES256) and publishes the public
  // keys at this JWKS. Verifying against it is the production-correct path; the
  // HS256 shared secret remains as a fallback for local/legacy projects (ADR-011),
  // and is disabled entirely in prod-like environments (ADR-020/034).
  const jwks = createRemoteJWKSet(
    new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
  );
  const hsSecret = isProdLike(config.APP_ENV)
    ? null
    : new TextEncoder().encode(config.SUPABASE_JWT_SECRET);
  return { config, db, jwks, hsSecret };
}
