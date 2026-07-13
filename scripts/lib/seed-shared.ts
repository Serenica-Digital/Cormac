import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { parseContract, type Contract } from '@cormac/contract';
import type { Db } from '../../apps/control-plane/src/db.js';
import { hashAgentToken } from '../../apps/control-plane/src/auth.js';

/**
 * The pieces the seed scripts share: fixture loading with meta stripping, the
 * golden-contract publish through the real RPC, the ops record book with its
 * planted cases, and vault-first agent-token binding (ADR-0005 as amended).
 * Extracted from seed-authoring-e2e.ts and seed-ops-e2e.ts when the demo seed
 * became a third consumer.
 */

/**
 * Strip note/comment meta from a fixture (the read_workbook fixture-mode
 * rule, applied at seed time for the DB-served path): the agent must not see
 * the planted ambiguities named.
 */
export function stripMeta(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripMeta);
  if (node && typeof node === 'object') {
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([k]) => k !== 'note' && k !== 'comment')
        .map(([k, v]) => [k, stripMeta(v)]),
    );
  }
  return node;
}

/** The relationship-crm detection profile, meta-stripped, ready to snapshot. */
export function loadDetectedFixture(): Record<string, unknown> {
  const fixturePath = new URL(
    '../../evals/workbook-authoring/fixture/relationship-crm.detected.json',
    import.meta.url,
  ).pathname;
  return stripMeta(JSON.parse(readFileSync(fixturePath, 'utf8'))) as Record<string, unknown>;
}

/** The golden relationship-crm contract, parsed (defaults materialized). */
export function loadGoldenContract(): Contract {
  const goldenPath = new URL(
    '../../evals/workbook-authoring/golden/relationship-crm.contract.json',
    import.meta.url,
  ).pathname;
  return parseContract(JSON.parse(readFileSync(goldenPath, 'utf8')));
}

/**
 * Publish the golden contract through the real gate (the publish_contract
 * RPC), exactly as the control plane would. Returns the contract version id.
 */
export async function publishGoldenContract(
  db: Db,
  workspaceId: string,
  actorId: string,
): Promise<string> {
  const contract = loadGoldenContract();
  const pub = await db.rpc('publish_contract', {
    p_workspace_id: workspaceId,
    p_document: contract,
    p_actor_id: actorId,
  });
  if (pub.error) throw new Error(`publish_contract: ${pub.error.message}`);
  return (pub.data as { contract_version_id: string }).contract_version_id;
}

/**
 * The ops record book: 8 organizations, 12 contacts, with the utterance
 * protocol's planted cases:
 *   - two contacts answering to "Morgan" (ambiguity case)
 *   - James Carter at Bluewater Holdings (update + create-colleague case)
 *   - Stonebridge Group active (alias + enum flip case)
 *   - "Crestline Wealth" deliberately NOT seeded (clean-create case)
 */
export async function seedOpsBook(
  db: Db,
  input: { workspaceId: string; contractVersionId: string; createdBy: string },
): Promise<{ organizations: Record<string, string>; contacts: Record<string, string> }> {
  async function insertRecord(
    objectApiName: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    const { data: row, error } = await db
      .from('business_records')
      .insert({
        workspace_id: input.workspaceId,
        object_api_name: objectApiName,
        contract_version_id: input.contractVersionId,
        data,
        created_by: input.createdBy,
      })
      .select('id')
      .single();
    if (error) throw new Error(`insert ${objectApiName}: ${error.message}`);
    return row.id as string;
  }

  const organizations: Record<string, string> = {};
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
    organizations[name] = await insertRecord('organization', {
      name,
      status,
      ...(notes ? { notes } : {}),
    });
  }

  const contacts: Record<string, string> = {};
  for (const [full_name, org, extra] of [
    ['Morgan Ellis', 'Hartwell Capital', { coverage_area: 'Southeast', opportunities_shown: 3, date_last_contacted: '2026-06-24' }],
    ['Dana Morgan', 'Meridian Sports Group', { sport: 'Baseball', date_last_contacted: '2026-06-30' }],
    ['James Carter', 'Bluewater Holdings', { coverage_area: 'Northeast', opportunities_shown: 5, date_last_contacted: '2026-07-01', notes: 'Negotiating the marina package.' }],
    ['Priya Shah', 'Ashford & Gray', { coverage_area: 'Mid-Atlantic', date_last_contacted: '2026-06-18', follow_up_date: '2026-07-11' }],
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
      organization: organizations[org],
      ...extra,
    });
  }

  return { organizations, contacts };
}

/**
 * Vault-first agent-token binding (ADR-0005 as amended): the raw token lives
 * in Infisical under `vaultName` and is already in the process env when the
 * caller runs under `infisical run`. If present, its hash is (re)bound to the
 * workspace: token_hash is unique, so the upsert moves the binding from any
 * prior seed's workspace while the raw value (and the running gateway's env)
 * stays stable. Only if the slot is empty does this mint a token and write it
 * to Infisical; that first time, relaunch the gateway.
 */
export async function bindVaultToken(
  db: Db,
  input: { workspaceId: string; agent: 'authoring' | 'operations'; vaultName: string },
): Promise<{ tokenId: string; minted: boolean }> {
  let raw = process.env[input.vaultName];
  let minted = false;
  if (!raw) {
    raw = randomBytes(32).toString('hex');
    const slot = process.env.INFISICAL_ENV ?? 'dev';
    const inf = spawnSync(
      'infisical',
      ['secrets', 'set', `${input.vaultName}=${raw}`, `--env=${slot}`],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    if (inf.status !== 0) {
      throw new Error(
        `could not write ${input.vaultName} to Infisical ${slot}; aborting before any DB token row.`,
      );
    }
    minted = true;
  }

  const tok = await db
    .from('agent_tokens')
    .upsert(
      {
        workspace_id: input.workspaceId,
        agent: input.agent,
        token_hash: hashAgentToken(raw),
        revoked_at: null,
      },
      { onConflict: 'token_hash' },
    )
    .select('id')
    .single();
  if (tok.error) throw new Error(`bindVaultToken: ${tok.error.message}`);
  return { tokenId: tok.data.id as string, minted };
}
