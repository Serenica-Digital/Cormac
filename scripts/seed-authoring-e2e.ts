import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServiceClient } from '../apps/control-plane/src/db.js';
import { hashAgentToken } from '../apps/control-plane/src/auth.js';

/**
 * Stand up the #66 phase-5 E2E workspace: a workspace + owner, the
 * relationship-crm fixture uploaded as its workbook snapshot (note/comment
 * meta stripped — fixture hygiene, the agent must not see the planted
 * ambiguities named), and an authoring agent token minted into the Hermes
 * profile .env (derived copy; put the authority copy in Infisical when logged
 * in). Prints the workspace id and owner id; never prints the token.
 *
 * Usage: tsx scripts/seed-authoring-e2e.ts [--profile cormac-authoring] [--control-plane-url http://127.0.0.1:8787]
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (via infisical run or the shell).
 */

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const profile = arg('profile', 'cormac-authoring')!;
const controlPlaneUrl = arg('control-plane-url', 'http://127.0.0.1:8787')!;

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset.');
  process.exit(2);
}
const db = createServiceClient(url, serviceKey);

// Fixture, meta-stripped (the read_workbook fixture-mode rule, applied at seed
// time for the DB-served path).
function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([k]) => k !== 'note' && k !== 'comment')
        .map(([k, v]) => [k, strip(v)]),
    );
  }
  return node;
}
const fixturePath = new URL(
  '../evals/workbook-authoring/fixture/relationship-crm.detected.json',
  import.meta.url,
).pathname;
const profileJson = strip(JSON.parse(readFileSync(fixturePath, 'utf8'))) as Record<string, unknown>;

// Workspace + owner + membership.
const suffix = randomUUID().slice(0, 8);
const ws = await db.from('workspaces').insert({ name: `authoring-e2e-${suffix}` }).select('id').single();
if (ws.error) throw new Error(ws.error.message);
const workspaceId = ws.data.id as string;

const email = `owner-e2e-${suffix}@test.local`;
const password = `pw-${randomUUID()}`;
const user = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (user.error) throw new Error(user.error.message);
const userId = user.data.user!.id;
await db.from('memberships').insert({ workspace_id: workspaceId, user_id: userId, role: 'owner' });

// The workbook snapshot (service-role insert; equivalent to the human upload).
const snap = await db
  .from('workbook_snapshots')
  .insert({ workspace_id: workspaceId, name: 'relationship-crm', profile: profileJson, created_by: userId })
  .select('id')
  .single();
if (snap.error) throw new Error(snap.error.message);

// Authoring agent token -> hash in DB, raw into the profile .env only.
const raw = randomBytes(32).toString('hex');
const tok = await db
  .from('agent_tokens')
  .insert({ workspace_id: workspaceId, agent: 'authoring', token_hash: hashAgentToken(raw) })
  .select('id')
  .single();
if (tok.error) throw new Error(tok.error.message);

const envPath = `${process.env.HOME}/.hermes/profiles/${profile}/.env`;
if (!existsSync(envPath)) {
  console.error(`WARNING: ${envPath} missing; token minted but not delivered. Revoke ${tok.data.id} or add the vars manually.`);
} else {
  const lines = readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => !l.startsWith('CORMAC_AGENT_TOKEN=') && !l.startsWith('CORMAC_CONTROL_PLANE_URL='));
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.push(`CORMAC_CONTROL_PLANE_URL=${controlPlaneUrl}`, `CORMAC_AGENT_TOKEN=${raw}`, '');
  writeFileSync(envPath, lines.join('\n'), { mode: 0o600 });
}

console.log(
  JSON.stringify(
    {
      workspaceId,
      userId,
      ownerEmail: email,
      snapshotId: snap.data.id,
      tokenId: tok.data.id,
      profileEnvUpdated: existsSync(envPath),
      next: 'restart the Hermes hub so tool scripts see the new env, then drive /api/workspaces/:id/authoring/turn',
    },
    null,
    2,
  ),
);
