import 'dotenv/config';
import { readEnv } from '@cormac/config/server';
import { EXAMPLE_PERSON_CONTRACT } from '@cormac/contract';
import { createServiceClient } from '@cormac/db';

/**
 * Seed the walking-skeleton demo: one workspace, one owner user, the example
 * contract published as the active version, and one existing Person record to
 * update. Run from the repo root with `pnpm seed` after `pnpm db:start`.
 */

const url = readEnv('SUPABASE_URL');
// readEnv throws if the required service-role key is missing or empty.
const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

const OWNER_EMAIL = 'owner@demo.cormac.test';
const OWNER_PASSWORD = 'demo-password-123';

/**
 * Stable across reseeds so env that binds to the demo workspace (the runtime's
 * MCP_WORKSPACE_ID, web bookmarks) survives `pnpm db:reset`. The seed is
 * idempotent: rerunning updates nothing that already exists.
 */
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';

const db = createServiceClient(url, serviceKey);

async function ensureUser(email: string, password: string): Promise<string> {
  const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) return created.data.user.id;

  // Already exists: find the id by paging the user list.
  if (created.error && /already/i.test(created.error.message)) {
    const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
  }
  throw new Error(`could not create or find user ${email}: ${created.error?.message ?? 'unknown'}`);
}

async function main(): Promise<void> {
  const ownerId = await ensureUser(OWNER_EMAIL, OWNER_PASSWORD);

  const { error: wsErr } = await db
    .from('workspaces')
    .upsert(
      { id: WORKSPACE_ID, name: 'Demo Realty', confirmation_mode: 'confirm_each' },
      { onConflict: 'id' },
    );
  if (wsErr) throw new Error(`create workspace: ${wsErr.message}`);
  const workspaceId = WORKSPACE_ID;

  const { data: mem, error: memReadErr } = await db
    .from('memberships')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', ownerId)
    .maybeSingle();
  if (memReadErr) throw new Error(`read membership: ${memReadErr.message}`);
  if (!mem) {
    const { error: memErr } = await db
      .from('memberships')
      .insert({ workspace_id: workspaceId, user_id: ownerId, role: 'owner' });
    if (memErr) throw new Error(`create membership: ${memErr.message}`);
  }

  const { data: activeCv, error: cvReadErr } = await db
    .from('contract_versions')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle();
  if (cvReadErr) throw new Error(`read contract: ${cvReadErr.message}`);
  let contractVersionId = activeCv?.id as string | undefined;
  if (!contractVersionId) {
    const { data: cv, error: cvErr } = await db
      .from('contract_versions')
      .insert({
        workspace_id: workspaceId,
        version: EXAMPLE_PERSON_CONTRACT.version,
        document: EXAMPLE_PERSON_CONTRACT,
        is_active: true,
        published_by: ownerId,
      })
      .select('id')
      .single();
    if (cvErr) throw new Error(`publish contract: ${cvErr.message}`);
    contractVersionId = cv.id as string;
  }

  const { data: existingRec, error: recReadErr } = await db
    .from('business_records')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('object_api_name', 'person')
    .contains('data', { email: 'john@carterdeals.test' })
    .maybeSingle();
  if (recReadErr) throw new Error(`read record: ${recReadErr.message}`);
  if (!existingRec) {
    const { error: recErr } = await db.from('business_records').insert({
      workspace_id: workspaceId,
      object_api_name: 'person',
      contract_version_id: contractVersionId,
      data: { full_name: 'John Carter', email: 'john@carterdeals.test', status: 'lead' },
      created_by: ownerId,
      updated_by: ownerId,
    });
    if (recErr) throw new Error(`seed record: ${recErr.message}`);
  }

  console.log('Seed complete.');
  console.log(`  workspace_id : ${workspaceId}`);
  console.log(`  login        : ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.log('  seeded record: Person "John Carter" (status: lead)');
  console.log('  try in the web app: "Talked to John about the waterfront deal, he\'s interested."');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
