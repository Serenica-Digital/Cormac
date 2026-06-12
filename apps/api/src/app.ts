import { createServiceClient, type Db } from '@cormac/db';
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
  hsSecret: Uint8Array;
}

export function buildAppContext(config: Config): AppContext {
  const db = createServiceClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  // Supabase signs user tokens asymmetrically (ES256) and publishes the public
  // keys at this JWKS. Verifying against it is the production-correct path; the
  // HS256 shared secret remains as a fallback for older projects (ADR-011).
  const jwks = createRemoteJWKSet(
    new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
  );
  const hsSecret = new TextEncoder().encode(config.SUPABASE_JWT_SECRET);
  return { config, db, jwks, hsSecret };
}
