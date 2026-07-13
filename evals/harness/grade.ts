import { readFileSync } from 'node:fs';
import type {
  Assertion,
  Baseline,
  Budget,
  CaptureScenario,
  ChangeExpectation,
  GradeStatus,
  ScenarioEvidence,
  ScenarioGrade,
  ValueExpectation,
} from './types.js';

/**
 * The machine grader: declarative assertions + budgets over a scenario's
 * evidence bundle, compared against the tracked baseline. Deterministic —
 * soft criteria (wording quality, consultative feel) belong to the
 * eval-cycle session's judge pass, never here.
 */

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

/**
 * $today / $yesterday resolve at grade time (the agent resolves them at run
 * time); $seed:<Name> resolves to the seeded record's id.
 */
function resolveExpectation(
  value: ValueExpectation,
  seedIds: Record<string, string>,
): ValueExpectation {
  if (value === '$today') return isoDate(0);
  if (value === '$yesterday') return isoDate(1);
  if (typeof value === 'string' && value.startsWith('$seed:')) {
    return seedIds[value.slice('$seed:'.length)] ?? value;
  }
  return value;
}

interface ProposalChangeView {
  objectApiName: string;
  op: string;
  recordId?: string;
  values: Record<string, unknown>;
}

function proposalChanges(evidence: ScenarioEvidence, step: number): ProposalChangeView[] {
  const proposal = evidence.steps[step]?.proposal as
    | { changes?: ProposalChangeView[] }
    | undefined;
  return proposal?.changes ?? [];
}

function changeMatches(
  change: ProposalChangeView,
  expect: ChangeExpectation,
  seedIds: Record<string, string>,
): string | null {
  if (change.op !== expect.op) return `op ${change.op} != ${expect.op}`;
  if (change.objectApiName !== expect.objectApiName) {
    return `object ${change.objectApiName} != ${expect.objectApiName}`;
  }
  if (expect.targetSeed) {
    const id = seedIds[expect.targetSeed];
    if (!id) return `unknown seed name "${expect.targetSeed}"`;
    if (change.recordId !== id) return `targets ${change.recordId}, expected ${expect.targetSeed} (${id})`;
  }
  for (const [key, raw] of Object.entries(expect.valuesInclude ?? {})) {
    const want = resolveExpectation(raw, seedIds);
    const got = change.values[key];
    if (got !== want) return `values.${key} = ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`;
  }
  for (const key of expect.valuesHaveKeys ?? []) {
    if (!(key in change.values)) return `values missing key "${key}"`;
  }
  for (const key of expect.valuesExcludeKeys ?? []) {
    if (key in change.values) return `values must not contain "${key}"`;
  }
  return null;
}

function checkAssertion(
  assertion: Assertion,
  evidence: ScenarioEvidence,
  seedIds: Record<string, string>,
): string | null {
  if ('anyOf' in assertion) {
    const reasons = assertion.anyOf.map((a) => checkAssertion(a, evidence, seedIds));
    return reasons.some((r) => r === null)
      ? null
      : `none of the alternatives held: ${reasons.join(' | ')}`;
  }
  if ('outcome' in assertion) {
    const cap = evidence.steps[assertion.step]?.capture;
    if (!cap) return `step ${assertion.step}: no capture evidence`;
    const got = cap.proposalId ? 'proposal' : 'no_proposal';
    return got === assertion.outcome
      ? null
      : `step ${assertion.step}: outcome ${got}, expected ${assertion.outcome}`;
  }
  if ('changeCount' in assertion) {
    const cap = evidence.steps[assertion.step]?.capture;
    return cap?.changeCount === assertion.changeCount
      ? null
      : `step ${assertion.step}: changeCount ${cap?.changeCount}, expected ${assertion.changeCount}`;
  }
  if ('uncertain' in assertion) {
    const cap = evidence.steps[assertion.step]?.capture;
    return cap?.uncertain === assertion.uncertain
      ? null
      : `step ${assertion.step}: uncertain ${cap?.uncertain}, expected ${assertion.uncertain}`;
  }
  if ('change' in assertion) {
    const changes = proposalChanges(evidence, assertion.step);
    if (!changes.length) return `step ${assertion.step}: no proposal changes to match`;
    if (assertion.index !== undefined) {
      const change = changes[assertion.index];
      if (!change) return `step ${assertion.step}: no change at index ${assertion.index}`;
      const why = changeMatches(change, assertion.change, seedIds);
      return why ? `step ${assertion.step} change[${assertion.index}]: ${why}` : null;
    }
    const reasons = changes.map((c) => changeMatches(c, assertion.change, seedIds));
    return reasons.some((r) => r === null)
      ? null
      : `step ${assertion.step}: no change matched (${reasons.join(' | ')})`;
  }
  if ('agentNoteContains' in assertion) {
    const note = evidence.steps[assertion.step]?.capture?.agentNote ?? '';
    return note.toLowerCase().includes(assertion.agentNoteContains.toLowerCase())
      ? null
      : `step ${assertion.step}: agentNote does not contain "${assertion.agentNoteContains}"`;
  }
  if ('learning' in assertion) {
    const want = assertion.learning;
    const rows = evidence.learning as Array<Record<string, unknown>>;
    const hit = rows.find(
      (r) =>
        r.kind === want.kind &&
        r.status === want.status &&
        (want.variant === undefined ||
          String(r.variant ?? '').toLowerCase() === want.variant.toLowerCase()) &&
        (want.synonym === undefined ||
          String(r.synonym ?? '').toLowerCase() === want.synonym.toLowerCase()) &&
        (want.canonicalOption === undefined || r.canonical_option === want.canonicalOption) &&
        (want.targetSeed === undefined || r.record_id === seedIds[want.targetSeed]),
    );
    return hit ? null : `no ${want.status} ${want.kind} learning row matching ${JSON.stringify(want)}`;
  }
  if ('learningCount' in assertion) {
    const rows = evidence.learning as Array<Record<string, unknown>>;
    const n = rows.filter((r) => r.status === assertion.learningCount.status).length;
    return n === assertion.learningCount.equals
      ? null
      : `${n} ${assertion.learningCount.status} learning rows, expected ${assertion.learningCount.equals}`;
  }
  if ('audit' in assertion) {
    const n = evidence.auditActions.filter((a) => a === assertion.audit.action).length;
    if (assertion.audit.count !== undefined) {
      return n === assertion.audit.count
        ? null
        : `${n} "${assertion.audit.action}" audit events, expected ${assertion.audit.count}`;
    }
    return n > 0 ? null : `no "${assertion.audit.action}" audit event`;
  }
  return `unrecognized assertion ${JSON.stringify(assertion)}`;
}

function checkBudget(budget: Budget | undefined, evidence: ScenarioEvidence, lane: string): string[] {
  if (!budget) return [];
  const bounds =
    lane === 'metered' && budget.metered
      ? { maxStepWallMs: budget.metered.maxStepWallMs, minCacheRatio: budget.metered.minCacheRatio }
      : { maxStepWallMs: budget.maxStepWallMs, minCacheRatio: budget.minCacheRatio };
  const breaches: string[] = [];
  if (bounds.maxStepWallMs) {
    for (const [i, step] of evidence.steps.entries()) {
      if (step.action.do === 'capture' && step.wallMs > bounds.maxStepWallMs) {
        breaches.push(`step ${i} wall ${step.wallMs}ms > budget ${bounds.maxStepWallMs}ms`);
      }
    }
  }
  if (bounds.minCacheRatio != null && evidence.gateway.cacheRatio != null) {
    if (evidence.gateway.cacheRatio < bounds.minCacheRatio) {
      breaches.push(
        `cache ratio ${evidence.gateway.cacheRatio.toFixed(2)} < budget ${bounds.minCacheRatio}`,
      );
    }
  }
  return breaches;
}

export function loadBaseline(path: string): Baseline | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Baseline;
  } catch {
    return null;
  }
}

export function gradeCapture(
  scenario: CaptureScenario,
  evidence: ScenarioEvidence,
  seedIds: Record<string, string>,
  baseline: Baseline | null,
  lane: string,
): ScenarioGrade {
  const stepErrors = evidence.steps
    .map((s, i) => (s.error ? `step ${i}: ${s.error}` : null))
    .filter((e): e is string => e !== null);
  const failures = [
    ...stepErrors,
    ...scenario.assertions
      .map((a) => checkAssertion(a, evidence, seedIds))
      .filter((f): f is string => f !== null),
  ];
  const budgetBreaches = checkBudget(scenario.budget, evidence, lane);
  const status: GradeStatus = failures.length || budgetBreaches.length ? 'FAIL' : 'PASS';
  return {
    scenarioId: scenario.id,
    status,
    failures,
    budgetBreaches,
    vsBaseline: !baseline
      ? 'new'
      : baseline.status === status
        ? 'steady'
        : status === 'PASS'
          ? 'improvement'
          : 'regression',
    judgePending: Boolean(scenario.judge?.length),
  };
}
