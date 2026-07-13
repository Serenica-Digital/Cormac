/**
 * The eval-suite scenario format. Scenarios are tracked JSON under
 * evals/scenarios/; this file is their type and the evidence/grade shapes the
 * runner and grader share. Three scenario kinds:
 *
 * - capture:   drive utterances (and pipeline actions) through the real
 *              product path, then machine-grade the collected evidence.
 * - interview: seeded and gated by the harness, PLAYED by the eval-cycle
 *              session (the client-player); the runner reports them as
 *              MANUAL when run headless.
 * - posture:   CLI assertions on the locked-down profiles. Loop-invariant:
 *              the eval-cycle skill may never "fix" one by relaxing the
 *              posture (see .claude/skills/eval-cycle/SKILL.md).
 *
 * Budgets are dev-lane sanity bounds, not economics evidence (ADR-0007): the
 * dev lane runs a different model. Metered budgets live beside them and are
 * only checked on metered passes.
 */

export type StepAction =
  /** POST /api/.../capture with this utterance. */
  | { do: 'capture'; utterance: string }
  /** Decide the single pending learning row (fails if zero or several). */
  | { do: 'decide_learning'; decision: 'approve' | 'reject' }
  /** Decide the proposal held by an earlier capture step. */
  | { do: 'decide_proposal'; fromStep: number; decision: 'approve' | 'reject' };

/**
 * Value matchers: exact, or a token — `$today`/`$yesterday` (dates resolved
 * at grade time) or `$seed:<Name>` (the seeded record's id, for relationship
 * fields).
 */
export type ValueExpectation = string | number | boolean;

export interface ChangeExpectation {
  op: 'create' | 'update';
  objectApiName: string;
  /** For updates: the seeded record this change must target, by seed-manifest name. */
  targetSeed?: string;
  /** Fields that must be present with these values ($today/$yesterday allowed). */
  valuesInclude?: Record<string, ValueExpectation>;
  /** Field apiNames that must be present, any value. */
  valuesHaveKeys?: string[];
  /** Field apiNames that must NOT appear (e.g. human-only fields). */
  valuesExcludeKeys?: string[];
}

export type Assertion =
  /** At least one of these must hold (e.g. "uncertain:true OR no_proposal"). */
  | { anyOf: Assertion[] }
  /** The step produced a held proposal / no proposal. */
  | { step: number; outcome: 'proposal' | 'no_proposal' }
  | { step: number; changeCount: number }
  | { step: number; uncertain: boolean }
  /** One change in the step's proposal matches (index optional: any change may match). */
  | { step: number; change: ChangeExpectation; index?: number }
  /** The agent's conversational reply contains this (case-insensitive). Use sparingly; wording is judge territory. */
  | { step: number; agentNoteContains: string }
  /** A learned_knowledge row matching this exists after the run. */
  | {
      learning: {
        kind: 'alias' | 'enum_synonym';
        status: 'pending' | 'approved' | 'rejected';
        variant?: string;
        synonym?: string;
        canonicalOption?: string;
        targetSeed?: string;
      };
    }
  /** Exactly this many learning rows with the status exist after the run. */
  | { learningCount: { status: 'pending' | 'approved' | 'rejected'; equals: number } }
  /** An audit event with this action exists (count optional). */
  | { audit: { action: string; count?: number } };

export interface Budget {
  /** Max wall-clock per capture step (ms). Dev-lane sanity bound. */
  maxStepWallMs?: number;
  /** Min prompt-cache hit ratio (0-1) across the scenario's model calls, from the gateway log. */
  minCacheRatio?: number;
  /**
   * Interview scenarios: max client turns to publish, graded by the
   * eval-cycle player. Distinct from the scenario's maxTurns hard cap: the
   * cap aborts the run, the budget fails the grade. A 19-turn interview is
   * an obnoxious client experience even when the contract comes out right.
   */
  maxInterviewTurns?: number;
  /** Metered-lane bounds; only enforced when the runner is told --lane metered. */
  metered?: { maxStepWallMs?: number; minCacheRatio?: number; maxInterviewTurns?: number };
}

export interface CaptureScenario {
  id: string;
  kind: 'capture';
  description: string;
  steps: StepAction[];
  assertions: Assertion[];
  /** Soft criteria for the eval-cycle session to judge from the evidence bundle. */
  judge?: string[];
  budget?: Budget;
}

export interface InterviewScenario {
  id: string;
  kind: 'interview';
  description: string;
  fixture: 'relationship-crm' | 'contacts-deals';
  /** Tracked persona file the client-player follows, repo-relative. */
  persona: string;
  maxTurns: number;
  /** Machine gates the eval-cycle session runs after the interview publishes. */
  gates: { validate: true; stableVsGolden: string };
  judge: string[];
  budget?: Budget;
}

export interface PostureScenario {
  id: string;
  kind: 'posture';
  description: string;
  profile: string;
  /** `hermes -p <profile> tools list --platform api_server` must enable exactly these. */
  exactTools?: string[];
  /** Config keys that must resolve to these values (`hermes config get`). */
  config?: Record<string, string>;
  /** Posture scenarios are loop-invariant by definition. */
  loopInvariant: true;
}

export type Scenario = CaptureScenario | InterviewScenario | PostureScenario;

// --- What the runner collects -------------------------------------------------

export interface StepEvidence {
  action: StepAction;
  wallMs: number;
  httpStatus: number;
  /** Capture steps: the capture response body. */
  capture?: {
    status: string;
    proposalId: string | null;
    changeCount: number;
    uncertain: boolean;
    agentNote?: string;
  };
  /** The held proposal as a reviewer sees it (proposalsView shape). */
  proposal?: unknown;
  /** decide_learning steps: the decided row id + resulting status. */
  learningDecision?: { learningId: string; status: string };
  error?: string;
}

export interface ScenarioEvidence {
  scenarioId: string;
  workspaceId: string;
  startedAt: string;
  steps: StepEvidence[];
  /** Post-run state pulls. */
  learning: unknown[];
  auditActions: string[];
  /** Parsed from the gateway log slice for this scenario's window. */
  gateway: { cacheRatio: number | null; toolCalls: Record<string, number> };
}

export type GradeStatus = 'PASS' | 'FAIL' | 'MANUAL' | 'INFRA';

export interface ScenarioGrade {
  scenarioId: string;
  status: GradeStatus;
  failures: string[];
  /** Budget breaches are failures too, listed separately for the report. */
  budgetBreaches: string[];
  /** vs evals/baselines/<id>.json: 'regression' | 'improvement' | 'steady' | 'new'. */
  vsBaseline: 'regression' | 'improvement' | 'steady' | 'new';
  judgePending: boolean;
}

export interface Baseline {
  scenarioId: string;
  status: GradeStatus;
  acceptedAt: string;
  note?: string;
}
