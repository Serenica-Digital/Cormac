import type { Db } from '../../apps/control-plane/src/db.js';
import { bindVaultToken, loadDetectedFixture, publishGoldenContract, seedOpsBook } from './seed-shared.js';

/**
 * The demo seed: two named workspaces and six memorable personas, idempotent
 * by construction so `pnpm seed:demo` can run any number of times against the
 * local stack. "Demo — Getting started" sits in the setup stage (workbook
 * snapshot, no contract); "Demo — Live book" has the golden contract and the
 * ops record book. Namespacing exists for the idempotency test, which runs a
 * throwaway namespace against the same database; only the real `demo`
 * namespace may touch Infisical-backed agent tokens.
 */

export const DEMO_PASSWORD = 'cormac-demo';

export interface DemoSeedOptions {
  namespace?: string;
  /** Purge and recreate both demo workspaces first (auth users are kept). */
  reset?: boolean;
  /** Rebind the dev vault agent tokens to the demo workspaces. */
  bindTokens?: boolean;
}

export interface DemoPersona {
  email: string;
  userId: string;
  memberships: Array<{ workspace: string; role: string }>;
  platformAdmin: boolean;
}

export interface DemoSeedResult {
  namespace: string;
  workspaces: {
    gettingStarted: { id: string; name: string };
    liveBook: { id: string; name: string };
  };
  personas: DemoPersona[];
  password: string;
  tokens: {
    authoring: { tokenId: string; minted: boolean };
    operations: { tokenId: string; minted: boolean };
  } | null;
}

/**
 * The hard guard: the demo seed writes fixed, guessable credentials, so it
 * refuses anything that is not the local stack. Called by the CLI before it
 * builds a client; the test harness targets local Supabase by construction.
 */
export function assertLocalDemoTarget(env: NodeJS.ProcessEnv = process.env): void {
  const appEnv = env.APP_ENV;
  if (appEnv && appEnv !== 'development' && appEnv !== 'test') {
    throw new Error(`seed:demo refuses APP_ENV=${appEnv}: demo credentials are local-only.`);
  }
  const url = env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL unset; run under `infisical run`.');
  const host = new URL(url).hostname;
  if (host !== '127.0.0.1' && host !== 'localhost') {
    throw new Error(`seed:demo refuses SUPABASE_URL host ${host}: demo credentials are local-only.`);
  }
}

export function demoWorkspaceNames(namespace: string): { gettingStarted: string; liveBook: string } {
  const label = namespace === 'demo' ? 'Demo' : `Demo (${namespace})`;
  return { gettingStarted: `${label} — Getting started`, liveBook: `${label} — Live book` };
}

async function ensureWorkspace(db: Db, name: string): Promise<string> {
  const found = await db.from('workspaces').select('id').eq('name', name);
  if (found.error) throw new Error(`ensureWorkspace(${name}): ${found.error.message}`);
  if ((found.data ?? []).length > 1) {
    throw new Error(`ensureWorkspace: ${found.data!.length} workspaces named "${name}"; rerun with --reset.`);
  }
  if (found.data?.length === 1) return found.data[0]!.id as string;
  const created = await db.from('workspaces').insert({ name }).select('id').single();
  if (created.error) throw new Error(`ensureWorkspace(${name}): ${created.error.message}`);
  return created.data.id as string;
}

/**
 * Resolve or create the persona's auth user, and re-set the fixed password
 * either way: a rerun always leaves every persona signable-in, whatever state
 * a previous run or manual fiddling left behind.
 */
async function ensureUser(db: Db, email: string): Promise<string> {
  const created = await db.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (!created.error) return created.data.user!.id;
  const code = (created.error as { code?: string }).code;
  if (code !== 'email_exists' && code !== 'user_already_exists') {
    throw new Error(`ensureUser(${email}): ${created.error.message}`);
  }
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const res = await db.auth.admin.listUsers({ page, perPage });
    if (res.error) throw new Error(`ensureUser listUsers: ${res.error.message}`);
    const hit = res.data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) {
      const updated = await db.auth.admin.updateUserById(hit.id, { password: DEMO_PASSWORD });
      if (updated.error) throw new Error(`ensureUser reset password: ${updated.error.message}`);
      return hit.id;
    }
    if (res.data.users.length < perPage) break;
  }
  throw new Error(`ensureUser(${email}): user exists but scan did not find it`);
}

export async function runDemoSeed(db: Db, opts: DemoSeedOptions = {}): Promise<DemoSeedResult> {
  const namespace = opts.namespace ?? 'demo';
  // Tokens are Infisical-backed; a throwaway namespace must never touch them.
  const bindTokens = (opts.bindTokens ?? true) && namespace === 'demo';
  const names = demoWorkspaceNames(namespace);

  if (opts.reset) {
    for (const name of Object.values(names)) {
      const found = await db.from('workspaces').select('id').eq('name', name);
      if (found.error) throw new Error(`reset lookup(${name}): ${found.error.message}`);
      for (const row of found.data ?? []) {
        const purged = await db.rpc('purge_workspace', { p_workspace_id: row.id });
        if (purged.error) throw new Error(`purge_workspace(${row.id}): ${purged.error.message}`);
      }
    }
  }

  const gettingStartedId = await ensureWorkspace(db, names.gettingStarted);
  const liveBookId = await ensureWorkspace(db, names.liveBook);

  // Personas: memorable, one per role story. operator holds no memberships at
  // all; the operator surface is a separate tier, and the seed keeps it that way.
  const personaPlan: Array<{
    local: string;
    memberships: Array<{ workspaceId: string; workspace: string; role: string }>;
    platformAdmin: boolean;
  }> = [
    {
      local: 'owner',
      memberships: [
        { workspaceId: gettingStartedId, workspace: names.gettingStarted, role: 'owner' },
        { workspaceId: liveBookId, workspace: names.liveBook, role: 'owner' },
      ],
      platformAdmin: false,
    },
    {
      local: 'admin',
      memberships: [
        { workspaceId: gettingStartedId, workspace: names.gettingStarted, role: 'agent_admin' },
        { workspaceId: liveBookId, workspace: names.liveBook, role: 'agent_admin' },
      ],
      platformAdmin: false,
    },
    {
      local: 'manager',
      memberships: [{ workspaceId: liveBookId, workspace: names.liveBook, role: 'manager' }],
      platformAdmin: false,
    },
    {
      local: 'member',
      memberships: [{ workspaceId: liveBookId, workspace: names.liveBook, role: 'member' }],
      platformAdmin: false,
    },
    {
      local: 'viewer',
      memberships: [{ workspaceId: liveBookId, workspace: names.liveBook, role: 'read_only' }],
      platformAdmin: false,
    },
    { local: 'operator', memberships: [], platformAdmin: true },
  ];

  const personas: DemoPersona[] = [];
  let ownerId = '';
  for (const plan of personaPlan) {
    const email = `${plan.local}@${namespace}.test`;
    const userId = await ensureUser(db, email);
    if (plan.local === 'owner') ownerId = userId;

    for (const m of plan.memberships) {
      const up = await db
        .from('memberships')
        .upsert(
          { workspace_id: m.workspaceId, user_id: userId, role: m.role },
          { onConflict: 'workspace_id,user_id' },
        );
      if (up.error) throw new Error(`membership(${email}, ${m.workspace}): ${up.error.message}`);
    }
    if (plan.platformAdmin) {
      const up = await db
        .from('platform_admins')
        .upsert({ user_id: userId, note: `${namespace} seed operator persona` });
      if (up.error) throw new Error(`platform_admins(${email}): ${up.error.message}`);
    }

    personas.push({
      email,
      userId,
      memberships: plan.memberships.map(({ workspace, role }) => ({ workspace, role })),
      platformAdmin: plan.platformAdmin,
    });
  }

  // Getting started: the setup stage. A workbook snapshot and no contract.
  const snap = await db
    .from('workbook_snapshots')
    .select('id')
    .eq('workspace_id', gettingStartedId)
    .eq('name', 'relationship-crm')
    .limit(1)
    .maybeSingle();
  if (snap.error) throw new Error(`snapshot lookup: ${snap.error.message}`);
  if (!snap.data) {
    const inserted = await db.from('workbook_snapshots').insert({
      workspace_id: gettingStartedId,
      name: 'relationship-crm',
      profile: loadDetectedFixture(),
      created_by: ownerId,
    });
    if (inserted.error) throw new Error(`snapshot insert: ${inserted.error.message}`);
  }

  // Live book: golden contract + the ops record book, each only if absent.
  const active = await db
    .from('contract_versions')
    .select('id')
    .eq('workspace_id', liveBookId)
    .eq('is_active', true)
    .maybeSingle();
  if (active.error) throw new Error(`contract lookup: ${active.error.message}`);
  const contractVersionId = active.data
    ? (active.data.id as string)
    : await publishGoldenContract(db, liveBookId, ownerId);

  const records = await db
    .from('business_records')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', liveBookId);
  if (records.error) throw new Error(`record count: ${records.error.message}`);
  if ((records.count ?? 0) === 0) {
    await seedOpsBook(db, { workspaceId: liveBookId, contractVersionId, createdBy: ownerId });
  }

  // Token rebinding steals the e2e seeds' binding by design: one live binding
  // per agent kind. Reseed the e2e workspace to point it back.
  const tokens = bindTokens
    ? {
        authoring: await bindVaultToken(db, {
          workspaceId: gettingStartedId,
          agent: 'authoring' as const,
          vaultName: 'CORMAC_AGENT_TOKEN',
        }),
        operations: await bindVaultToken(db, {
          workspaceId: liveBookId,
          agent: 'operations' as const,
          vaultName: 'CORMAC_OPS_AGENT_TOKEN',
        }),
      }
    : null;

  return {
    namespace,
    workspaces: {
      gettingStarted: { id: gettingStartedId, name: names.gettingStarted },
      liveBook: { id: liveBookId, name: names.liveBook },
    },
    personas,
    password: DEMO_PASSWORD,
    tokens,
  };
}
