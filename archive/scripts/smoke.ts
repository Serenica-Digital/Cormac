import { createAnonClient, createServiceClient } from '@cormac/db';

/**
 * Live end-to-end smoke test of the walking skeleton (Phase 1 verification).
 * Requires local Supabase up, the seed run, and the runtime-stub + API running.
 * Exercises the whole spine and the human-only gate against the real database.
 */

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const anonKey = process.env.SUPABASE_ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const API = process.env.VITE_API_URL ?? 'http://127.0.0.1:8088';

const EMAIL = 'owner@demo.cormac.test';
const PASSWORD = 'demo-password-123';

let failures = 0;
function check(condition: boolean, label: string): void {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`);
  if (!condition) failures += 1;
}

interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

async function main(): Promise<void> {
  const anon = createAnonClient(url, anonKey);
  const signin = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (!signin.data.session || !signin.data.user) {
    throw new Error(`sign-in failed: ${signin.error?.message}`);
  }
  const token = signin.data.session.access_token;
  const userId = signin.data.user.id;

  const service = createServiceClient(url, serviceKey);
  const membership = await service
    .from('memberships')
    .select('workspace_id')
    .eq('user_id', userId)
    .limit(1)
    .single();
  if (membership.error) throw new Error(`workspace lookup failed: ${membership.error.message}`);
  const ws = membership.data.workspace_id as string;
  console.log(`workspace: ${ws}\n`);

  async function call(path: string, method = 'GET', body?: unknown): Promise<ApiResult> {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, body: json };
  }

  // 1. Capture the golden-path message.
  const cap = await call(
    `/api/workspaces/${ws}/capture`,
    'POST',
    { text: "Talked to John about the waterfront deal, he's interested." },
  );
  check(cap.status === 200 && typeof cap.body.proposalId === 'string', '1. capture held a proposal');
  const proposalId = cap.body.proposalId as string;

  // 2. The review queue shows the matched record with before/after.
  const queue = await call(`/api/workspaces/${ws}/proposals?status=pending`);
  const proposals = (queue.body.proposals as Array<Record<string, unknown>>) ?? [];
  const proposal = proposals.find((p) => p.id === proposalId);
  const change = (proposal?.changes as Array<Record<string, unknown>> | undefined)?.[0];
  const current = change?.current as Record<string, unknown> | undefined;
  const values = change?.values as Record<string, unknown> | undefined;
  check(change?.op === 'update', '2. proposal is an update to the matched record');
  check(current?.full_name === 'John Carter', '   before-state shows John Carter');
  check(values?.status === 'active', '   proposed status -> active');

  // 3. Approve: the only path that writes.
  const decision = await call(
    `/api/workspaces/${ws}/proposals/${proposalId}/decision`,
    'POST',
    { decision: 'approve' },
  );
  check(decision.status === 200 && decision.body.status === 'applied', '3. approve applied the write');

  // 4. The record reflects the write.
  const records = await call(`/api/workspaces/${ws}/records`);
  const recs = (records.body.records as Array<Record<string, unknown>>) ?? [];
  const john = recs.find((r) => (r.data as Record<string, unknown>)?.full_name === 'John Carter');
  const johnData = john?.data as Record<string, unknown> | undefined;
  check(johnData?.status === 'active', '4. John Carter record is now status=active');
  check(typeof johnData?.last_interaction_date === 'string', '   last_interaction_date written');

  // 5. The audit trail captured before/after with a source link.
  const audit = await call(`/api/workspaces/${ws}/audit`);
  const events = (audit.body.events as Array<Record<string, unknown>>) ?? [];
  const updateEvent = events.find((e) => e.action === 'record_updated');
  const before = updateEvent?.before as Record<string, unknown> | undefined;
  const after = updateEvent?.after as Record<string, unknown> | undefined;
  check(!!updateEvent, '5. audit event record_updated exists');
  check(before?.status === 'lead' && after?.status === 'active', '   audit before/after: lead -> active');
  check(!!updateEvent?.source_message_id, '   audit event links the source message');

  // 6. The human-only gate rejects an agent write to internal_rating.
  const overreach = await call(`/api/workspaces/${ws}/capture`, 'POST', {
    text: 'Set rating to 9 for John.',
  });
  check(overreach.status === 422, '6. agent write to human-only field rejected at capture (422)');
  console.log(`   rejection: ${JSON.stringify(overreach.body.detail ?? overreach.body.message)}`);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
