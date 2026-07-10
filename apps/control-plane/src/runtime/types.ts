/**
 * The seam between the pipeline and the Hermes transport (ADR-0001). Phase 4
 * defines the interface so capture and tests can run against a fake; phase 5
 * implements the real client (/v1/responses named conversations for authoring,
 * /v1/runs + SSE + approvals for gated work).
 */

export interface CaptureTaskInput {
  /** The source message id; doubles as the run's task correlation key. */
  taskId: string;
  workspaceId: string;
  text: string;
  /** Compiled workspace context, delivered as the cache-stable prefix. */
  context: string;
}

export interface CaptureTaskOutcome {
  runId: string;
  /** The agent's final text (used when it declined or asked instead of proposing). */
  output: string;
}

export interface AuthoringTurnInput {
  workspaceId: string;
  /** The client-side turn text forwarded into the named conversation. */
  text: string;
}

export interface AuthoringTurnOutcome {
  conversation: string;
  output: string;
}

export interface RuntimeClient {
  /** Run one gated capture task to completion (operations agent). */
  runCaptureTask(input: CaptureTaskInput): Promise<CaptureTaskOutcome>;
  /** Send one interview turn on the workspace's named conversation (authoring agent). */
  sendAuthoringTurn(input: AuthoringTurnInput): Promise<AuthoringTurnOutcome>;
}

/**
 * One client per agent kind: the gateways are separate processes with
 * separate lockdowns (ADR-0005/0008), so the control plane holds one lane
 * per kind. A null lane means that agent is not deployed; its feature
 * answers 503 while the other lane keeps working.
 */
export interface RuntimeLanes {
  authoring: RuntimeClient | null;
  operations: RuntimeClient | null;
}
