import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { SignJWT } from 'jose';
import { createServiceClient, type Db } from '../../apps/control-plane/src/db.js';
import {
  bindVaultToken,
  publishGoldenContract,
  seedOpsBook,
} from '../../scripts/lib/seed-shared.js';
import { gradeCapture, loadBaseline } from './grade.js';
import type {
  CaptureScenario,
  PostureScenario,
  Scenario,
  ScenarioEvidence,
  ScenarioGrade,
  StepEvidence,
} from './types.js';

/**
 * The eval-suite runner: one entrypoint over the tracked scenarios
 * (evals/scenarios/*.json). Capture scenarios run fully automated through the
 * real product path against a FRESH workspace each (no cross-scenario
 * leakage — learned knowledge changes the compiled prefix by design).
 * Posture scenarios check the locked-down profiles via the hermes CLI.
 * Interview scenarios are seeded/gated elsewhere and report MANUAL here; the
 * eval-cycle session plays them (see .claude/skills/eval-cycle/SKILL.md).
 *
 * Usage (stack up; env via `infisical run --env=dev`):
 *   pnpm evals [-- --only id1,id2] [--kind capture|posture|interview] [--lane dev|metered] [--label name]
 *
 * Exit codes: 0 all PASS/MANUAL, 1 any FAIL, 2 infrastructure not up.
 * Artifacts: .jarvis/tmp/notes/eval-runs/<label>-<stamp>/ (gitignored scratch).
 * Baselines: evals/baselines/<id>.json (tracked; compared, never written here).
 */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const repoRoot = new URL('../../', import.meta.url).pathname;
const label = arg('label') ?? 'evals';
const lane = arg('lane') ?? 'dev';
const only = arg('only')?.split(',').map((s) => s.trim());
const kindFilter = arg('kind');

const controlPlane = (process.env.CORMAC_CONTROL_PLANE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const opsGatewayUrl = (process.env.EVAL_OPS_GATEWAY_URL ?? 'http://127.0.0.1:8645').replace(/\/$/, '');
const opsGatewayLog =
  process.env.EVAL_OPS_GATEWAY_LOG ??
  `${homedir()}/.hermes/profiles/cormac-operations/logs/agent.log`;

// --- Load scenarios -----------------------------------------------------------

const scenarioDir = repoRoot + 'evals/scenarios/';
const scenarios: Scenario[] = readdirSync(scenarioDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(scenarioDir + f, 'utf8')) as Scenario)
  .filter((s) => !only || only.includes(s.id))
  .filter((s) => !kindFilter || s.kind === kindFilter);

if (!scenarios.length) {
  console.error('no scenarios matched the filters');
  process.exit(2);
}

// --- Preflight ----------------------------------------------------------------

async function healthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

const needsCapture = scenarios.some((s) => s.kind === 'capture');
const env = process.env;
const infraProblems: string[] = [];
if (needsCapture) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_JWT_SECRET) {
    infraProblems.push('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_JWT_SECRET unset (run under `infisical run --env=dev`)');
  }
  if (!env.CORMAC_OPS_AGENT_TOKEN) {
    infraProblems.push('CORMAC_OPS_AGENT_TOKEN unset — the running ops gateway holds the vault token; the runner must rebind that same value');
  }
  if (!(await healthy(controlPlane))) infraProblems.push(`control plane not up at ${controlPlane}`);
  if (!(await healthy(opsGatewayUrl))) infraProblems.push(`ops gateway not up at ${opsGatewayUrl}`);
}
if (infraProblems.length) {
  console.error('INFRA not ready:\n  - ' + infraProblems.join('\n  - '));
  process.exit(2);
}

// --- Capture-scenario execution -------------------------------------------------

interface SeededEvalWorkspace {
  workspaceId: string;
  userId: string;
  seedIds: Record<string, string>;
}

async function seedWorkspace(db: Db, id: string): Promise<SeededEvalWorkspace> {
  const stamp = Date.now().toString(36);
  const ws = await db
    .from('workspaces')
    .insert({ name: `eval-${id}-${stamp}` })
    .select('id')
    .single();
  if (ws.error) throw new Error(`workspace: ${ws.error.message}`);
  const workspaceId = ws.data.id as string;

  const user = await db.auth.admin.createUser({
    email: `eval-${id}-${stamp}@test.local`,
    password: `pw-${stamp}-${Math.random().toString(36).slice(2)}`,
    email_confirm: true,
  });
  if (user.error) throw new Error(`user: ${user.error.message}`);
  const userId = user.data.user!.id;

  const member = await db
    .from('memberships')
    .insert({ workspace_id: workspaceId, user_id: userId, role: 'owner' });
  if (member.error) throw new Error(`membership: ${member.error.message}`);

  const contractVersionId = await publishGoldenContract(db, workspaceId, userId);
  const book = await seedOpsBook(db, { workspaceId, contractVersionId, createdBy: userId });
  await bindVaultToken(db, {
    workspaceId,
    agent: 'operations',
    vaultName: 'CORMAC_OPS_AGENT_TOKEN',
  });

  return { workspaceId, userId, seedIds: { ...book.organizations, ...book.contacts } };
}

async function cleanupWorkspace(db: Db, seeded: SeededEvalWorkspace): Promise<void> {
  await db.rpc('purge_workspace', { p_workspace_id: seeded.workspaceId });
  await db.auth.admin.deleteUser(seeded.userId);
}

async function mintJwt(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(env.SUPABASE_AUTH_ISSUER ?? `${env.SUPABASE_URL}/auth/v1`)
    .setAudience('authenticated')
    .setSubject(userId)
    .setExpirationTime('2h')
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET));
}

function gatewayLogSize(): number {
  try {
    return statSync(opsGatewayLog).size;
  } catch {
    return 0;
  }
}

const KNOWN_TOOLS = ['search_records', 'get_record', 'submit_proposal', 'propose_learning', 'search_history'];

function parseGatewaySlice(fromByte: number): ScenarioEvidence['gateway'] {
  let slice = '';
  try {
    const full = readFileSync(opsGatewayLog, 'utf8');
    slice = full.slice(fromByte);
  } catch {
    return { cacheRatio: null, toolCalls: {} };
  }
  const cachePairs = [...slice.matchAll(/cache=(\d+)\/(\d+)/g)];
  const read = cachePairs.reduce((a, m) => a + Number(m[1]), 0);
  const total = cachePairs.reduce((a, m) => a + Number(m[2]), 0);
  const toolCalls: Record<string, number> = {};
  for (const tool of KNOWN_TOOLS) {
    const n = slice.split(tool).length - 1;
    if (n > 0) toolCalls[tool] = n;
  }
  return { cacheRatio: total > 0 ? read / total : null, toolCalls };
}

async function api(
  jwt: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${controlPlane}${path}`, {
    method,
    headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(600_000),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

async function runCaptureScenario(
  db: Db,
  scenario: CaptureScenario,
): Promise<{ evidence: ScenarioEvidence; seedIds: Record<string, string> }> {
  const seeded = await seedWorkspace(db, scenario.id);
  const jwt = await mintJwt(seeded.userId);
  const ws = `/api/workspaces/${seeded.workspaceId}`;
  const logStart = gatewayLogSize();
  const steps: StepEvidence[] = [];

  try {
    for (const action of scenario.steps) {
      const started = Date.now();
      const step: StepEvidence = { action, wallMs: 0, httpStatus: 0 };
      try {
        if (action.do === 'capture') {
          const res = await api(jwt, 'POST', `${ws}/capture`, { text: action.utterance });
          step.httpStatus = res.status;
          if (res.status === 200) {
            step.capture = {
              status: String(res.body.status),
              proposalId: (res.body.proposalId as string | null) ?? null,
              changeCount: Number(res.body.changeCount ?? 0),
              uncertain: Boolean(res.body.uncertain),
              agentNote: res.body.agentNote as string | undefined,
            };
            if (step.capture.proposalId) {
              const list = await api(jwt, 'GET', `${ws}/proposals?status=pending`);
              step.proposal = (list.body.proposals as Array<{ id: string }> | undefined)?.find(
                (p) => p.id === step.capture!.proposalId,
              );
            }
          } else {
            step.error = `capture HTTP ${res.status}: ${JSON.stringify(res.body).slice(0, 300)}`;
          }
        } else if (action.do === 'decide_learning') {
          const pending = await api(jwt, 'GET', `${ws}/learning?status=pending`);
          const rows = (pending.body.learning as Array<{ id: string }> | undefined) ?? [];
          if (rows.length !== 1) {
            step.httpStatus = pending.status;
            step.error = `decide_learning expects exactly 1 pending row, found ${rows.length}`;
          } else {
            const res = await api(jwt, 'POST', `${ws}/learning/${rows[0]!.id}/decision`, {
              decision: action.decision,
            });
            step.httpStatus = res.status;
            if (res.status === 200) {
              step.learningDecision = { learningId: rows[0]!.id, status: String(res.body.status) };
            } else {
              step.error = `learning decision HTTP ${res.status}`;
            }
          }
        } else if (action.do === 'decide_proposal') {
          const proposalId = steps[action.fromStep]?.capture?.proposalId;
          if (!proposalId) {
            step.error = `decide_proposal: step ${action.fromStep} holds no proposal`;
          } else {
            const res = await api(jwt, 'POST', `${ws}/proposals/${proposalId}/decision`, {
              decision: action.decision,
            });
            step.httpStatus = res.status;
            if (res.status !== 200) step.error = `proposal decision HTTP ${res.status}`;
          }
        }
      } catch (err) {
        step.error = err instanceof Error ? err.message : String(err);
      }
      step.wallMs = Date.now() - started;
      steps.push(step);
      process.stderr.write(
        `   [${scenario.id}] ${action.do} ${step.error ? 'ERROR' : 'ok'} in ${(step.wallMs / 1000).toFixed(1)}s\n`,
      );
    }

    const learning = await api(jwt, 'GET', `${ws}/learning`);
    const { data: audit } = await db
      .from('audit_events')
      .select('action')
      .eq('workspace_id', seeded.workspaceId);

    const evidence: ScenarioEvidence = {
      scenarioId: scenario.id,
      workspaceId: seeded.workspaceId,
      startedAt: new Date().toISOString(),
      steps,
      learning: (learning.body.learning as unknown[]) ?? [],
      auditActions: ((audit as Array<{ action: string }> | null) ?? []).map((a) => a.action),
      gateway: parseGatewaySlice(logStart),
    };
    return { evidence, seedIds: seeded.seedIds };
  } finally {
    await cleanupWorkspace(db, seeded).catch((err) => {
      process.stderr.write(`   [${scenario.id}] cleanup failed: ${err}\n`);
    });
  }
}

// --- Posture-scenario execution -------------------------------------------------

function runPostureScenario(scenario: PostureScenario): ScenarioGrade {
  const failures: string[] = [];
  try {
    if (scenario.exactTools) {
      const out = execFileSync(
        'hermes',
        ['-p', scenario.profile, 'tools', 'list', '--platform', 'api_server'],
        { encoding: 'utf8', timeout: 30_000 },
      );
      // Enabled lines read "✓ enabled  <name>"; collect individual tool names
      // from the plugin toolset section and any enabled default toolsets.
      const enabledToolsets = [...out.matchAll(/✓ enabled\s+(\S+)/g)].map((m) => m[1]!);
      const unexpected = enabledToolsets.filter((t) => !scenario.exactTools!.includes(t));
      const missing = scenario.exactTools.filter((t) => !enabledToolsets.includes(t));
      if (unexpected.length) failures.push(`unexpected enabled toolsets: ${unexpected.join(', ')}`);
      if (missing.length) failures.push(`missing enabled toolsets: ${missing.join(', ')}`);
    }
    for (const [key, want] of Object.entries(scenario.config ?? {})) {
      const out = execFileSync('hermes', ['-p', scenario.profile, 'config', 'get', key], {
        encoding: 'utf8',
        timeout: 30_000,
      }).trim();
      // `config get` prints the value (sometimes as `key: value`); accept either.
      const got = out.includes(':') ? out.split(':').pop()!.trim() : out;
      if (got.toLowerCase() !== want.toLowerCase()) {
        failures.push(`config ${key} = "${got}", expected "${want}"`);
      }
    }
  } catch (err) {
    return {
      scenarioId: scenario.id,
      status: 'INFRA',
      failures: [`hermes CLI failed: ${err instanceof Error ? err.message : String(err)}`],
      budgetBreaches: [],
      vsBaseline: 'new',
      judgePending: false,
    };
  }
  const baseline = loadBaseline(repoRoot + `evals/baselines/${scenario.id}.json`);
  const status = failures.length ? 'FAIL' : 'PASS';
  return {
    scenarioId: scenario.id,
    status,
    failures,
    budgetBreaches: [],
    vsBaseline: !baseline ? 'new' : baseline.status === status ? 'steady' : status === 'PASS' ? 'improvement' : 'regression',
    judgePending: false,
  };
}

// --- Run everything -------------------------------------------------------------

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = repoRoot + `.jarvis/tmp/notes/eval-runs/${label}-${stamp}/`;
mkdirSync(outDir, { recursive: true });

const db = needsCapture ? createServiceClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!) : (null as unknown as Db);
const grades: ScenarioGrade[] = [];

for (const scenario of scenarios) {
  process.stderr.write(`\n== ${scenario.id} (${scenario.kind}) ==\n`);
  if (scenario.kind === 'capture') {
    try {
      const { evidence, seedIds } = await runCaptureScenario(db, scenario);
      writeFileSync(`${outDir}${scenario.id}.evidence.json`, JSON.stringify(evidence, null, 2));
      const baseline = loadBaseline(repoRoot + `evals/baselines/${scenario.id}.json`);
      grades.push(gradeCapture(scenario, evidence, seedIds, baseline, lane));
    } catch (err) {
      grades.push({
        scenarioId: scenario.id,
        status: 'INFRA',
        failures: [err instanceof Error ? err.message : String(err)],
        budgetBreaches: [],
        vsBaseline: 'new',
        judgePending: false,
      });
    }
  } else if (scenario.kind === 'posture') {
    grades.push(runPostureScenario(scenario));
  } else {
    grades.push({
      scenarioId: scenario.id,
      status: 'MANUAL',
      failures: [],
      budgetBreaches: [],
      vsBaseline: 'steady',
      judgePending: true,
    });
  }
  const g = grades[grades.length - 1]!;
  process.stderr.write(
    `   -> ${g.status}${g.failures.length ? `\n      ${g.failures.join('\n      ')}` : ''}${
      g.budgetBreaches.length ? `\n      budget: ${g.budgetBreaches.join('; ')}` : ''
    }\n`,
  );
}

const report = {
  label,
  lane,
  stamp,
  controlPlane,
  summary: {
    pass: grades.filter((g) => g.status === 'PASS').length,
    fail: grades.filter((g) => g.status === 'FAIL').length,
    manual: grades.filter((g) => g.status === 'MANUAL').length,
    infra: grades.filter((g) => g.status === 'INFRA').length,
    regressions: grades.filter((g) => g.vsBaseline === 'regression').map((g) => g.scenarioId),
  },
  grades,
};
writeFileSync(`${outDir}report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.log(`report: ${outDir}report.json`);

process.exit(report.summary.infra ? 2 : report.summary.fail ? 1 : 0);
