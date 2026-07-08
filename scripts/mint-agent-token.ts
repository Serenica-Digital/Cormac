import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createServiceClient } from '../apps/control-plane/src/db.js';
import { hashAgentToken } from '../apps/control-plane/src/auth.js';
import { AGENT_KINDS, type AgentKind } from '../apps/control-plane/src/shared.js';

/**
 * Mint a workspace-scoped agent token (ADR-0005). The raw token is generated
 * once, its SHA-256 hash lands in agent_tokens, and the raw value is delivered
 * to exactly one place: Infisical, in the environment this script ran under
 * (ADR-0006 slots; INFISICAL_ENV, default dev). It is never written to any
 * file and never printed in the clear.
 *
 * The gateway receives the token as injected process env at launch
 * (`pnpm agent:hub run`), so a newly minted token takes effect on the next
 * gateway relaunch.
 *
 * Usage (env via infisical run):
 *   pnpm mint:agent-token -- --workspace <uuid> --agent authoring
 *   INFISICAL_ENV=staging pnpm mint:agent-token -- --workspace <uuid> --agent authoring
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const workspaceId = arg('workspace');
const agent = arg('agent') as AgentKind | undefined;

if (!workspaceId || !agent || !(AGENT_KINDS as readonly string[]).includes(agent)) {
  console.error('usage: mint-agent-token.ts --workspace <uuid> --agent <authoring|operations>');
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

// Authority (and only) copy: Infisical, same slot this run was injected from.
const slot = process.env.INFISICAL_ENV ?? 'dev';
const inf = spawnSync('infisical', ['secrets', 'set', `CORMAC_AGENT_TOKEN=${raw}`, `--env=${slot}`], {
  stdio: ['ignore', 'ignore', 'inherit'],
});
if (inf.status !== 0) {
  console.error(
    'WARNING: could not write CORMAC_AGENT_TOKEN to Infisical (not logged in?). ' +
      'The token row exists; revoke it and re-mint after `infisical login`, or set the secret manually.',
  );
  process.exit(1);
}

console.log(
  `minted ${agent} token ${data.id} for workspace ${workspaceId}; ` +
    `authority copy: Infisical ${slot}/CORMAC_AGENT_TOKEN. Relaunch the gateway to pick it up.`,
);
