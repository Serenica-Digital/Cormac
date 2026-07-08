import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseContract } from '@cormac/contract';
import { createServiceClient } from '../apps/control-plane/src/db.js';
import { hashAgentToken } from '../apps/control-plane/src/auth.js';

/**
 * Stand up the ops-capture E2E workspace (#66 phase 6): a workspace + owner,
 * the golden relationship-crm contract published through the real RPC, a
 * seeded book of ~20 records with the protocol's planted cases, and the
 * OPERATIONS agent token bound to it.
 *
 * Token handling mirrors seed-authoring-e2e.ts (vault-first, ADR-0005 as
 * amended) with one deliberate difference: the vault name is
 * CORMAC_OPS_AGENT_TOKEN, distinct from the authoring token, so the two
 * gateways never share or clobber a credential. The ops hub maps it to the
 * plugin's CORMAC_AGENT_TOKEN at launch.
 *
 * Planted cases the utterance protocol depends on:
 *   - two contacts answering to "Morgan" (ambiguity case)
 *   - James Carter at Bluewater Holdings (update + create-colleague case)
 *   - Stonebridge Group active (alias + enum flip case)
 *   - "Crestline Wealth" deliberately NOT seeded (clean-create case)
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

// Publish the golden contract through the real gate. parseContract first:
// publishing materializes the schema defaults (glossary, editability flags),
// which the pipeline reads back without re-parsing.
const goldenPath = new URL(
  '../evals/workbook-authoring/golden/relationship-crm.contract.json',
  import.meta.url,
).pathname;
const contract = parseContract(JSON.parse(readFileSync(goldenPath, 'utf8')));
const pub = await db.rpc('publish_contract', {
  p_workspace_id: workspaceId,
  p_document: contract,
  p_actor_id: userId,
});
if (pub.error) throw new Error(`publish_contract: ${pub.error.message}`);
const contractVersionId = (pub.data as { contract_version_id: string }).contract_version_id;

// The book: 8 organizations, 12 contacts.
async function insertRecord(
  objectApiName: string,
  data: Record<string, unknown>,
): Promise<string> {
  const { data: row, error } = await db
    .from('business_records')
    .insert({
      workspace_id: workspaceId,
      object_api_name: objectApiName,
      contract_version_id: contractVersionId,
      data,
      created_by: userId,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insert ${objectApiName}: ${error.message}`);
  return row.id as string;
}

const orgs: Record<string, string> = {};
for (const [name, status, notes] of [
  ['Hartwell Capital', 'active', 'Long-standing lender relationship.'],
  ['Meridian Sports Group', 'active', 'Operator group, two stadium deals.'],
  ['Beacon Point Advisors', 'active', ''],
  ['Summit Ridge Partners', 'former', 'Went quiet in 2025.'],
  ['Ashford & Gray', 'active', ''],
  ['Bluewater Holdings', 'active', 'Carter deal in progress.'],
  ['Stonebridge Group', 'active', ''],
  ['Northgate Banking', 'active', ''],
] as const) {
  orgs[name] = await insertRecord('organization', { name, status, ...(notes ? { notes } : {}) });
}

const contacts: Record<string, string> = {};
for (const [full_name, org, extra] of [
  ['Morgan Ellis', 'Hartwell Capital', { coverage_area: 'Southeast', opportunities_shown: 3, date_last_contacted: '2026-06-24' }],
  ['Dana Morgan', 'Meridian Sports Group', { sport: 'Baseball', date_last_contacted: '2026-06-30' }],
  ['James Carter', 'Bluewater Holdings', { coverage_area: 'Northeast', opportunities_shown: 5, date_last_contacted: '2026-07-01', notes: 'Negotiating the marina package.' }],
  ['Priya Shah', 'Ashford & Gray', { coverage_area: 'Mid-Atlantic', date_last_contacted: '2026-06-18' }],
  ['Tom Okafor', 'Beacon Point Advisors', { date_last_contacted: '2026-05-29' }],
  ['Elaine Fischer', 'Northgate Banking', { coverage_area: 'Pacific Northwest' }],
  ['Ruth Calloway', 'Summit Ridge Partners', { notes: 'Left the firm? Bounced email 2026-05.' }],
  ['Victor Ramos', 'Meridian Sports Group', { sport: 'Soccer', opportunities_shown: 1 }],
  ['Grace Lindqvist', 'Stonebridge Group', { date_last_contacted: '2026-06-10' }],
  ['Sam Whitaker', 'Hartwell Capital', { coverage_area: 'Texas' }],
  ['Nina Petrov', 'Northgate Banking', { date_last_contacted: '2026-07-03' }],
  ['Owen Gallagher', 'Beacon Point Advisors', { follow_up_date: '2026-07-20' }],
] as [string, string, Record<string, unknown>][]) {
  contacts[full_name] = await insertRecord('contact', {
    full_name,
    organization: orgs[org],
    ...extra,
  });
}

// Operations agent token: vault-first, distinct vault name from authoring.
let raw = process.env.CORMAC_OPS_AGENT_TOKEN;
let minted = false;
if (!raw) {
  raw = randomBytes(32).toString('hex');
  const slot = process.env.INFISICAL_ENV ?? 'dev';
  const inf = spawnSync(
    'infisical',
    ['secrets', 'set', `CORMAC_OPS_AGENT_TOKEN=${raw}`, `--env=${slot}`],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  if (inf.status !== 0) {
    console.error(
      `could not write CORMAC_OPS_AGENT_TOKEN to Infisical ${slot}; aborting before any DB token row.`,
    );
    process.exit(1);
  }
  minted = true;
}

const tok = await db
  .from('agent_tokens')
  .upsert(
    { workspace_id: workspaceId, agent: 'operations', token_hash: hashAgentToken(raw), revoked_at: null },
    { onConflict: 'token_hash' },
  )
  .select('id')
  .single();
if (tok.error) throw new Error(tok.error.message);

// Manifest for the batch harness and for judgment (name -> id).
const manifest = {
  workspaceId,
  userId,
  ownerEmail: email,
  contractVersionId,
  organizations: orgs,
  contacts,
  tokenId: tok.data.id,
  tokenMinted: minted,
  seededAt: new Date().toISOString(),
};
const outDir = new URL('../.jarvis/tmp/notes/ops-runs/', import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
writeFileSync(outDir + 'seed.json', JSON.stringify(manifest, null, 2));

console.log(
  JSON.stringify(
    {
      workspaceId,
      records: { organizations: Object.keys(orgs).length, contacts: Object.keys(contacts).length },
      tokenMinted: minted,
      manifest: '.jarvis/tmp/notes/ops-runs/seed.json',
      next: minted
        ? 'token newly minted into Infisical — (re)launch the gateway (pnpm ops:hub run), then pnpm ops:batch'
        : 'existing vault token rebound to this workspace — no gateway restart needed; pnpm ops:batch',
    },
    null,
    2,
  ),
);
