import { z } from 'zod';
import { DEV_JWT_SECRET, isProdLike, resolveAppEnv, type AppEnv } from './appEnv.js';
import { ENV, schemaFor, Z, type EnvName, type Workload } from './manifest.js';

/** Thrown when a process is misconfigured; both the parse failure and the prod rules use it. */
export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvError';
  }
}

export function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
}

/**
 * The fail-closed posture (ADR-034). In `dev`/`prod` a process refuses to boot
 * if a credential is missing or, worse, left at a public default. Rules are
 * driven by the `prod` flag on each manifest entry, so adding a rule is a
 * one-line metadata change, not scattered logic. Pass the RAW env (not the
 * parsed object) so presence vs. defaulted-value can be told apart.
 */
export function enforceProdRules(
  workload: Workload,
  rawEnv: Record<string, string | undefined>,
  appEnv: AppEnv,
): void {
  if (!isProdLike(appEnv)) return;
  const problems: string[] = [];
  for (const e of ENV) {
    if (!e.prod || !e.workloads.includes(workload)) continue;
    const value = rawEnv[e.name];
    if (e.prod === 'no-dev-default') {
      if (value && value === DEV_JWT_SECRET) {
        problems.push(
          `${e.name}: refuse the public dev secret in ${appEnv}. Unset it (prod verifies ES256 against the JWKS, ADR-020) or set a real secret.`,
        );
      }
    } else if (e.prod === 'required-if-hermes') {
      const usingHermes = (rawEnv.RUNTIME_KIND ?? 'hermes') !== 'stub';
      if (usingHermes && !value) {
        problems.push(`${e.name}: required in ${appEnv} when RUNTIME_KIND=hermes.`);
      }
    } else if (e.prod === 'required') {
      if (!value) problems.push(`${e.name}: required in ${appEnv}.`);
    }
  }
  if (problems.length > 0) {
    throw new EnvError(`Refusing to boot in ${appEnv} (fail-closed, ADR-034):\n${problems.join('\n')}`);
  }
}

/**
 * Validate and return a workload's server-scope environment. The api builds its
 * own strongly-typed schema in apps/api/src/config.ts (and a test binds it to the
 * manifest); this generic loader serves the worker, the runtime stub, and the
 * scripts, where rich static typing is not needed.
 */
export function loadServerEnv(
  workload: Workload,
  env: Record<string, string | undefined> = process.env,
): Record<string, unknown> {
  const schema = schemaFor((e) => e.scope === 'server' && e.workloads.includes(workload));
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new EnvError(`Invalid ${workload} configuration:\n${formatZodIssues(parsed.error)}`);
  }
  enforceProdRules(workload, env, resolveAppEnv(env.APP_ENV));
  return parsed.data;
}

/**
 * Validate and return a single variable against its manifest rule (applying any
 * default). For heterogeneous consumers (seed, evals) that need one or two vars
 * and should not be forced to satisfy a whole workload's schema.
 */
export function readEnv<K extends EnvName>(
  name: K,
  env: Record<string, string | undefined> = process.env,
): z.infer<(typeof Z)[K]> {
  const parsed = Z[name].safeParse(env[name]);
  if (!parsed.success) {
    throw new EnvError(`Invalid ${name}:\n${formatZodIssues(parsed.error)}`);
  }
  return parsed.data as z.infer<(typeof Z)[K]>;
}
