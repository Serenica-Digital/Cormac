import { randomUUID } from 'node:crypto';
import { createServiceClient } from '../apps/control-plane/src/db.js';
import { bindVaultToken, loadDetectedFixture } from './lib/seed-shared.js';

/**
 * Stand up the authoring E2E workspace: a workspace + owner, the
 * relationship-crm fixture uploaded as its workbook snapshot (note/comment
 * meta stripped — fixture hygiene, the agent must not see the planted
 * ambiguities named), and the authoring agent token bound to it.
 *
 * Token handling is vault-first (ADR-0005 as amended) via bindVaultToken:
 * rebinding an existing vault token needs no gateway restart; a fresh mint
 * does.
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

const profileJson = loadDetectedFixture();

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

const token = await bindVaultToken(db, {
  workspaceId,
  agent: 'authoring',
  vaultName: 'CORMAC_AGENT_TOKEN',
});

console.log(
  JSON.stringify(
    {
      workspaceId,
      userId,
      ownerEmail: email,
      snapshotId: snap.data.id,
      tokenId: token.tokenId,
      tokenMinted: token.minted,
      next: token.minted
        ? 'token newly minted into Infisical — (re)launch the gateway (pnpm agent:hub run), then drive /api/workspaces/:id/authoring/turn'
        : 'existing vault token rebound to this workspace — no gateway restart needed; drive /api/workspaces/:id/authoring/turn',
    },
    null,
    2,
  ),
);
