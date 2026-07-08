import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServiceClient } from '../apps/control-plane/src/db.js';
import { hashAgentToken } from '../apps/control-plane/src/auth.js';
import { AGENT_KINDS, type AgentKind } from '../apps/control-plane/src/shared.js';

/**
 * Mint a workspace-scoped agent token (ADR-0005). The raw token is generated
 * once, its SHA-256 hash lands in agent_tokens, and the raw value is delivered
 * to its two sanctioned homes: Infisical (the authority copy) and, when
 * --profile is given, the Hermes profile .env (the derived copy Hermes
 * requires). The raw token is never written to a repo file and never printed
 * in the clear.
 *
 * Usage (env via infisical run):
 *   pnpm mint:agent-token -- --workspace <uuid> --agent authoring [--profile cormac-authoring]
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const workspaceId = arg('workspace');
const agent = arg('agent') as AgentKind | undefined;
const profile = arg('profile');

if (!workspaceId || !agent || !(AGENT_KINDS as readonly string[]).includes(agent)) {
  console.error(
    'usage: mint-agent-token.ts --workspace <uuid> --agent <authoring|operations> [--profile <hermes profile>]',
  );
  process.exit(2);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset; run under `infisical run`.');
  process.exit(2);
}

const raw = randomBytes(32).toString('hex');
const db = createServiceClient(url, serviceKey);

const { data, error } = await db
  .from('agent_tokens')
  .insert({ workspace_id: workspaceId, agent, token_hash: hashAgentToken(raw) })
  .select('id')
  .single();
if (error) {
  console.error(`mint failed: ${error.message}`);
  process.exit(1);
}

// Authority copy: Infisical dev. Secret name is stable per (workspace, agent).
const secretName = `CORMAC_AGENT_TOKEN_${agent.toUpperCase()}_${workspaceId.slice(0, 8)}`;
const inf = spawnSync('infisical', ['secrets', 'set', `${secretName}=${raw}`, '--env=dev'], {
  stdio: ['ignore', 'ignore', 'inherit'],
});
if (inf.status !== 0) {
  console.error(
    `WARNING: could not write ${secretName} to Infisical (not logged in?). ` +
      'The token row exists; revoke it and re-mint after `infisical login`, or set the secret manually.',
  );
}

// Derived copy: the Hermes profile .env (Hermes owns that file's format; we
// only upsert the one key). chmod stays whatever the profile setup made it.
if (profile) {
  const envPath = `${process.env.HOME}/.hermes/profiles/${profile}/.env`;
  if (!existsSync(envPath)) {
    console.error(`WARNING: ${envPath} does not exist; skipped the profile copy.`);
  } else {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    const filtered = lines.filter((l) => !l.startsWith('CORMAC_AGENT_TOKEN='));
    while (filtered.length && filtered[filtered.length - 1] === '') filtered.pop();
    filtered.push(`CORMAC_AGENT_TOKEN=${raw}`, '');
    writeFileSync(envPath, filtered.join('\n'), { mode: 0o600 });
  }
}

console.log(
  `minted ${agent} token ${data.id} for workspace ${workspaceId}; ` +
    `authority copy: Infisical dev/${secretName}${profile ? `; derived copy: profile ${profile} .env` : ''}`,
);
