import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServiceClient } from '../apps/control-plane/src/db.js';
import { bindVaultToken, publishGoldenContract, seedOpsBook } from './lib/seed-shared.js';

/**
 * Stand up the ops-capture E2E workspace (#66 phase 6): a workspace + owner,
 * the golden relationship-crm contract published through the real RPC, a
 * seeded book of ~20 records with the protocol's planted cases (see
 * seedOpsBook), and the OPERATIONS agent token bound to it.
 *
 * Token handling mirrors seed-authoring-e2e.ts (vault-first, ADR-0005 as
 * amended) with one deliberate difference: the vault name is
 * CORMAC_OPS_AGENT_TOKEN, distinct from the authoring token, so the two
 * gateways never share or clobber a credential. The ops hub maps it to the
 * plugin's CORMAC_AGENT_TOKEN at launch.
 *
 * Usage: pnpm seed:ops-e2e   (INFISICAL_ENV selects the slot, default dev)
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CORMAC_OPS_AGENT_TOKEN (optional).
 * Writes a seed manifest for the batch harness to .jarvis/tmp/notes/ops-runs/seed.json.
 */

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset; run under `infisical run`.');
  process.exit(2);
}
const db = createServiceClient(url, serviceKey);

// Workspace + owner + membership.
const suffix = randomUUID().slice(0, 8);
const ws = await db.from('workspaces').insert({ name: `ops-e2e-${suffix}` }).select('id').single();
if (ws.error) throw new Error(ws.error.message);
const workspaceId = ws.data.id as string;

const email = `owner-ops-${suffix}@test.local`;
const password = `pw-${randomUUID()}`;
const user = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (user.error) throw new Error(user.error.message);
const userId = user.data.user!.id;
await db.from('memberships').insert({ workspace_id: workspaceId, user_id: userId, role: 'owner' });

const contractVersionId = await publishGoldenContract(db, workspaceId, userId);
const { organizations, contacts } = await seedOpsBook(db, {
  workspaceId,
  contractVersionId,
  createdBy: userId,
});

const token = await bindVaultToken(db, {
  workspaceId,
  agent: 'operations',
  vaultName: 'CORMAC_OPS_AGENT_TOKEN',
});

// Manifest for the batch harness and for judgment (name -> id).
const manifest = {
  workspaceId,
  userId,
  ownerEmail: email,
  contractVersionId,
  organizations,
  contacts,
  tokenId: token.tokenId,
  tokenMinted: token.minted,
  seededAt: new Date().toISOString(),
};
const outDir = new URL('../.jarvis/tmp/notes/ops-runs/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
writeFileSync(outDir + 'seed.json', JSON.stringify(manifest, null, 2));

console.log(
  JSON.stringify(
    {
      workspaceId,
      records: {
        organizations: Object.keys(organizations).length,
        contacts: Object.keys(contacts).length,
      },
      tokenMinted: token.minted,
      manifest: '.jarvis/tmp/notes/ops-runs/seed.json',
      next: token.minted
        ? 'token newly minted into Infisical — (re)launch the gateway (pnpm ops:hub run), then pnpm ops:batch'
        : 'existing vault token rebound to this workspace — no gateway restart needed; pnpm ops:batch',
    },
    null,
    2,
  ),
);
