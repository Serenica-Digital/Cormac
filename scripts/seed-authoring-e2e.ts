import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServiceClient } from '../apps/control-plane/src/db.js';
import { hashAgentToken } from '../apps/control-plane/src/auth.js';

/**
 * Stand up the authoring E2E workspace: a workspace + owner, the
 * relationship-crm fixture uploaded as its workbook snapshot (note/comment
 * meta stripped — fixture hygiene, the agent must not see the planted
 * ambiguities named), and the authoring agent token bound to it.
 *
 * Token handling is vault-first (ADR-0005 as amended): this script runs under
 * `infisical run`, so the slot's CORMAC_AGENT_TOKEN is already in the process
 * env. If present, its hash is (re)bound to the new workspace — the raw value
 * never changes, so a running gateway keeps working with no restart. Only if
 * the slot has no token yet does the script mint one and write it to
 * Infisical (that first time, relaunch the gateway).
 *
 * Usage: pnpm seed:authoring-e2e   (INFISICAL_ENV selects the slot, default dev)
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CORMAC_AGENT_TOKEN (optional).
 */

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset; run under `infisical run`.');
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

// Authoring agent token: vault-first.
let raw = process.env.CORMAC_AGENT_TOKEN;
let minted = false;
if (!raw) {
  raw = randomBytes(32).toString('hex');
  const slot = process.env.INFISICAL_ENV ?? 'dev';
  const inf = spawnSync('infisical', ['secrets', 'set', `CORMAC_AGENT_TOKEN=${raw}`, `--env=${slot}`], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (inf.status !== 0) {
    console.error(`could not write CORMAC_AGENT_TOKEN to Infisical ${slot}; aborting before any DB token row.`);
    process.exit(1);
  }
  minted = true;
}

// (Re)bind the token's hash to this workspace. token_hash is unique, so an
// upsert moves the binding from any prior seed's workspace — the raw value
// (and therefore the running gateway's env) stays stable.
const tok = await db
  .from('agent_tokens')
  .upsert(
    { workspace_id: workspaceId, agent: 'authoring', token_hash: hashAgentToken(raw), revoked_at: null },
    { onConflict: 'token_hash' },
  )
  .select('id')
  .single();
if (tok.error) throw new Error(tok.error.message);

console.log(
  JSON.stringify(
    {
      workspaceId,
      userId,
      ownerEmail: email,
      snapshotId: snap.data.id,
      tokenId: tok.data.id,
      tokenMinted: minted,
      next: minted
        ? 'token newly minted into Infisical — (re)launch the gateway (pnpm agent:hub run), then drive /api/workspaces/:id/authoring/turn'
        : 'existing vault token rebound to this workspace — no gateway restart needed; drive /api/workspaces/:id/authoring/turn',
    },
    null,
    2,
  ),
);
