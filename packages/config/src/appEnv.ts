/**
 * The deployment environment a process believes it is running in (ADR-034).
 * `local` is the laptop / CI default and keeps the developer-friendly defaults.
 * `dev` and `prod` are "prod-like": the fail-closed rules in server.ts apply, so
 * a misconfigured deploy refuses to boot instead of running insecurely.
 */
export const APP_ENVS = ['local', 'dev', 'prod'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/**
 * The well-known Supabase local JWT secret. It is published in this repo and in
 * `.env.example`, so it is safe only on a laptop. In any prod-like environment
 * the control plane must refuse it: anyone who reads the repo could otherwise
 * forge an `aud=authenticated` HS256 token (see apps/api/src/auth.ts, ADR-020).
 */
export const DEV_JWT_SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

export function resolveAppEnv(raw: string | undefined): AppEnv {
  return raw === 'dev' || raw === 'prod' ? raw : 'local';
}

/** True for `dev`/`prod`: the fail-closed posture is on. */
export function isProdLike(env: AppEnv): boolean {
  return env !== 'local';
}
