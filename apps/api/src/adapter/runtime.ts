import { safeParseProposal, type Contract, type Proposal } from '@serenica/contract';
import { ProblemError } from '@serenica/shared';

/**
 * The Agent Runtime Adapter (ADR-006). The control plane reaches the runtime
 * over HTTP, carries tenant context IN, and treats everything that comes back
 * as untrusted. The runtime holds no database access.
 *
 * Two implementations behind this seam:
 *
 * - `runHermesTask`: the real runtime (Hermes Runs API, ADR-025). The run is
 *   asynchronous; the agent acts only through the control plane's MCP tools,
 *   so the proposal arrives via `submit_proposal` (already validated and held),
 *   not in the run response. The adapter returns the run's terminal status and
 *   final text; the pipeline correlates the proposal by source message.
 * - `callStubRuntime`: the synchronous /propose contract of the runtime-stub.
 *   Test fixture only; it never runs in the composed stack (ADR-021 open item
 *   4: the stub's fate is vitest determinism, nothing else).
 */

export interface RuntimeRecordSummary {
  objectApiName: string;
  id: string;
  display: Record<string, unknown>;
}

export interface StubRuntimeRequest {
  workspaceId: string;
  contract: Contract;
  text: string;
  records: RuntimeRecordSummary[];
}

export async function callStubRuntime(
  runtimeUrl: string,
  req: StubRuntimeRequest,
): Promise<Proposal> {
  let res: Response;
  try {
    res = await fetch(`${runtimeUrl}/propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch (err) {
    throw new ProblemError(502, 'runtime_unreachable', 'Agent runtime is unreachable', String(err));
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ProblemError(502, 'runtime_error', `Agent runtime returned ${res.status}`, detail);
  }

  const body: unknown = await res.json().catch(() => null);
  const parsed = safeParseProposal(body);
  if (!parsed.success) {
    // Malformed output is rejected here and never reaches the database (ADR-006).
    throw new ProblemError(
      502,
      'runtime_invalid_output',
      'Agent runtime returned malformed output',
      parsed.error.message,
    );
  }
  return parsed.data;
}

export interface HermesRuntimeConfig {
  url: string;
  apiKey?: string;
  timeoutMs: number;
  /** Test hook; defaults to 1500ms. */
  pollIntervalMs?: number;
}

export interface HermesTask {
  /** The source_message id; doubles as the run's session id and the proposal correlation key. */
  taskId: string;
  text: string;
  /**
   * The compiled workspace-context prefix (ADR-027 section 3): contract,
   * glossary, and active learned knowledge, delivered as the run's cached system
   * prefix so the agent need not fetch the contract per run. Hermes path only;
   * the stub receives the contract directly. Absent when not compiled.
   */
  context?: string;
}

export interface HermesRunOutcome {
  runId: string;
  output: string;
  /** Token/cost telemetry from the run, when the runtime reports it. */
  usage?: Record<string, unknown>;
}

/**
 * The operational brief sent as the run input. The agent's persona and policy
 * live in the Hermes profile (docker/hermes-runtime), and the workspace contract
 * and knowledge arrive in the cached context prefix (ADR-027); this carries only
 * the task: the inbound text and the taskId that submit_proposal requires, which
 * ties the run back to its source message.
 */
export function buildTaskBrief(task: HermesTask): string {
  return [
    `CRM task ${task.taskId}.`,
    '',
    'A user sent this update:',
    '"""',
    task.text,
    '"""',
    '',
    'The workspace contract and knowledge are already provided in your context.',
    'Find the records this update refers to with search_records and get_record, then',
    `submit the changes you propose by calling submit_proposal with taskId "${task.taskId}".`,
    'Call get_active_contract only to re-read a detail you are unsure of, not as a',
    'first step. Submit at most one proposal. If you are unsure about a match or a',
    'value, submit your best proposal with uncertain set to true and explain in notes.',
    'If the update should change nothing, do not call submit_proposal; reply with',
    'a short explanation instead.',
  ].join('\n');
}

const TERMINAL_FAILURES = new Set(['failed', 'error', 'cancelled', 'timeout']);

function authHeaders(cfg: HermesRuntimeConfig): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  return headers;
}

async function fetchOrUnreachable(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw new ProblemError(502, 'runtime_unreachable', 'Agent runtime is unreachable', String(err));
  }
}

function asText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return JSON.stringify(value);
}

/**
 * Stateless-per-task, enforced: completed runs hold their session (and a slot
 * against the runtime's concurrent-run cap) until the session is deleted, so
 * the adapter ends every session it started. This is also the data-retention
 * control: after cleanup the runtime holds nothing about the task. Best-effort;
 * a failed delete must not mask the run's own outcome.
 */
/**
 * The Runs API usage payload omits cache tokens (#46). They live on the session
 * detail, so the adapter reads it once the run is terminal and before the
 * session is deleted, to instrument cache hits (ADR-027 section 3). Best-effort:
 * a failed read returns nothing and never fails the run.
 */
async function readSessionUsage(
  cfg: HermesRuntimeConfig,
  sessionId: string,
): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`${cfg.url}/api/sessions/${sessionId}`, { headers: authHeaders(cfg) });
    if (!res.ok) return {};
    const body = (await res.json().catch(() => null)) as {
      session?: Record<string, unknown>;
    } | null;
    const session = body?.session;
    if (!session || typeof session !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const key of [
      'cache_read_tokens',
      'cache_write_tokens',
      'tool_call_count',
      'api_call_count',
      'estimated_cost_usd',
    ]) {
      if (session[key] != null) out[key] = session[key];
    }
    return out;
  } catch {
    return {};
  }
}

async function endSession(cfg: HermesRuntimeConfig, sessionId: string): Promise<void> {
  try {
    await fetch(`${cfg.url}/api/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: authHeaders(cfg),
    });
  } catch {
    // Best-effort: the recycling schedule is the backstop.
  }
}

async function stopRun(cfg: HermesRuntimeConfig, runId: string): Promise<void> {
  try {
    await fetch(`${cfg.url}/v1/runs/${runId}/stop`, {
      method: 'POST',
      headers: authHeaders(cfg),
    });
  } catch {
    // Best-effort.
  }
}

/**
 * Submit a task to the Hermes Runs API and poll to a terminal state. Returns
 * only the run's final text; any proposal the agent made already passed the
 * MCP write gate. Failures map to problem codes the surfaces can show.
 */
export async function runHermesTask(
  cfg: HermesRuntimeConfig,
  task: HermesTask,
): Promise<HermesRunOutcome> {
  const submit = await fetchOrUnreachable(`${cfg.url}/v1/runs`, {
    method: 'POST',
    headers: authHeaders(cfg),
    // `instructions` becomes the run's ephemeral system prefix, inside the cached
    // system block (#46). JSON.stringify drops it when context is undefined.
    body: JSON.stringify({
      input: buildTaskBrief(task),
      session_id: task.taskId,
      instructions: task.context,
    }),
  });

  if (submit.status === 429) {
    const detail = await submit.text().catch(() => '');
    throw new ProblemError(503, 'runtime_busy', 'Agent runtime is at capacity', detail);
  }
  if (!submit.ok) {
    const detail = await submit.text().catch(() => '');
    throw new ProblemError(502, 'runtime_error', `Agent runtime returned ${submit.status}`, detail);
  }

  const accepted = (await submit.json().catch(() => null)) as { run_id?: unknown } | null;
  const runId = typeof accepted?.run_id === 'string' ? accepted.run_id : null;
  if (!runId) {
    throw new ProblemError(
      502,
      'runtime_invalid_output',
      'Agent runtime accepted the run without a run_id',
    );
  }

  const deadline = Date.now() + cfg.timeoutMs;
  const interval = cfg.pollIntervalMs ?? 1500;
  let terminal = false;

  try {
    while (Date.now() < deadline) {
      const poll = await fetchOrUnreachable(`${cfg.url}/v1/runs/${runId}`, {
        headers: authHeaders(cfg),
      });
      if (!poll.ok) {
        const detail = await poll.text().catch(() => '');
        throw new ProblemError(502, 'runtime_error', `Agent runtime returned ${poll.status}`, detail);
      }
      const run = (await poll.json().catch(() => null)) as
        | { status?: unknown; output?: unknown; usage?: unknown; session_id?: unknown }
        | null;
      const status = typeof run?.status === 'string' ? run.status : 'unknown';

      if (status === 'completed') {
        terminal = true;
        const base =
          run?.usage && typeof run.usage === 'object'
            ? { ...(run.usage as Record<string, unknown>) }
            : {};
        // Enrich with cache tokens from the session before the finally deletes it.
        const sessionId = typeof run?.session_id === 'string' ? run.session_id : task.taskId;
        const usage = { ...base, ...(await readSessionUsage(cfg, sessionId)) };
        return {
          runId,
          output: asText(run?.output),
          usage: Object.keys(usage).length > 0 ? usage : undefined,
        };
      }
      if (TERMINAL_FAILURES.has(status)) {
        terminal = true;
        throw new ProblemError(
          502,
          'runtime_failed',
          `Agent run ended ${status}`,
          asText(run?.output),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    throw new ProblemError(
      504,
      'runtime_timeout',
      `Agent run ${runId} did not finish within ${cfg.timeoutMs}ms`,
    );
  } catch (err) {
    if (!terminal) await stopRun(cfg, runId);
    throw err;
  } finally {
    await endSession(cfg, task.taskId);
  }
}
