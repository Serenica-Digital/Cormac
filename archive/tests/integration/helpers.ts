import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { EXAMPLE_PERSON_CONTRACT } from '@cormac/contract';
import type { Db } from '@cormac/db';

/**
 * The shared Tier-2 (integration) harness. Every DB-backed suite stands up the
 * same shape, gates on the same env, and mints tokens the same way; that lives
 * here once instead of being copied per file. See docs/security/qa-strategy.md.
 */

export interface SupabaseEnv {
  ready: boolean;
  url: string;
  serviceKey: string;
  anonKey: string;
}

let skipWarned = false;

/**
 * The single env gate for integration suites. Returns the Supabase env or
 * `ready: false`, and warns ONCE so a run with Supabase down reads as SKIPPED,
 * never as a silent green pass. Usage: `describe.skipIf(!requireSupabaseEnv().ready)(...)`.
 */
export function requireSupabaseEnv(): SupabaseEnv {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const ready = Boolean(url && serviceKey);
  if (!ready && !skipWarned) {
    skipWarned = true;
    console.warn(
      '\n  ⚠ SKIPPING integration tests: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset.' +
        '\n    Run `pnpm db:start` (needs Docker) to exercise the Tier-2 suite.\n',
    );
  }
  return { ready, url: url ?? '', serviceKey: serviceKey ?? '', anonKey: anonKey ?? '' };
}

/**
 * The one canonical test token: an HS256 JWT signed against SUPABASE_JWT_SECRET
 * with the issuer and `aud=authenticated` that `authenticate` expects. Replaces
 * the three ad-hoc approaches (Supabase sign-in, hand-rolled node:crypto, raw
 * jose) the suites had drifted into. NOTE: this exercises the HS256 verification
 * branch (what local Supabase uses); production verifies ES256 against the JWKS
 * (ADR-020), which is covered manually, not in CI.
 */
export function mintToken(sub: string, opts?: { aud?: string; expiresIn?: string }): Promise<string> {
  const secret = new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET ?? '');
  const issuer = process.env.SUPABASE_AUTH_ISSUER ?? `${process.env.SUPABASE_URL}/auth/v1`;
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setAudience(opts?.aud ?? 'authenticated')
    .setSubject(sub)
    .setExpirationTime(opts?.expiresIn ?? '5m')
    .sign(secret);
}

export interface SeededWorkspace {
  workspaceId: string;
  userId: string;
  ownerEmail: string;
  ownerPassword: string;
  contractVersionId: string;
}

/**
 * Stand up the common core every integration suite needs: a workspace, an owner
 * user (with a known email/password for sign-in), a membership, and an active v1
 * contract. Registers the workspace and user with `resources` for afterAll
 * cleanup. Suites add their own records/learned rows on top of this.
 */
export async function seedWorkspace(
  service: Db,
  resources: TestResources,
  opts?: { namePrefix?: string; role?: string; contract?: typeof EXAMPLE_PERSON_CONTRACT },
): Promise<SeededWorkspace> {
  const prefix = opts?.namePrefix ?? 'ws';
  const suffix = randomUUID();

  const ws = await service.from('workspaces').insert({ name: `${prefix}-${suffix}` }).select('id').single();
  if (ws.error) throw new Error(`seedWorkspace workspace: ${ws.error.message}`);
  const workspaceId = resources.workspace(ws.data!.id as string);

  const ownerEmail = `${prefix}-${suffix}@test.local`;
  const ownerPassword = `pw-${suffix}`;
  const user = await service.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
  });
  if (user.error) throw new Error(`seedWorkspace user: ${user.error.message}`);
  const userId = resources.user(user.data.user!.id);

  const member = await service
    .from('memberships')
    .insert({ workspace_id: workspaceId, user_id: userId, role: opts?.role ?? 'owner' });
  if (member.error) throw new Error(`seedWorkspace membership: ${member.error.message}`);

  const cv = await service
    .from('contract_versions')
    .insert({
      workspace_id: workspaceId,
      version: 1,
      document: opts?.contract ?? EXAMPLE_PERSON_CONTRACT,
      is_active: true,
    })
    .select('id')
    .single();
  if (cv.error) throw new Error(`seedWorkspace contract: ${cv.error.message}`);

  return { workspaceId, userId, ownerEmail, ownerPassword, contractVersionId: cv.data!.id as string };
}

/**
 * Tracks what a test file creates in the shared local database and removes it
 * in afterAll, so test runs stop accumulating residue next to the demo
 * workspace. Workspaces go through the service-role-only purge_workspace path
 * (migration 0005), the one deletion the append-only audit trigger sanctions;
 * auth users are deleted after their workspace rows are gone.
 */
export class TestResources {
  private readonly workspaceIds: string[] = [];
  private readonly userIds: string[] = [];

  workspace(id: string): string {
    this.workspaceIds.push(id);
    return id;
  }

  user(id: string): string {
    this.userIds.push(id);
    return id;
  }

  async cleanup(service: Db): Promise<void> {
    for (const id of this.workspaceIds) {
      const { error } = await service.rpc('purge_workspace', { p_workspace_id: id });
      if (error) console.warn(`test cleanup: purge_workspace(${id}) failed: ${error.message}`);
    }
    for (const id of this.userIds) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) console.warn(`test cleanup: deleteUser(${id}) failed: ${error.message}`);
    }
  }
}
