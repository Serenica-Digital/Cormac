/**
 * The typed HTTP client over the Hermes API server (ADR-0001). Wire shapes
 * verified against Hermes 0.17 source (gateway/platforms/api_server.py) and
 * the spike's live transport (evals/workbook-authoring/scripts/send-turn.sh):
 *
 * - POST /v1/responses {model, input, conversation, store, instructions?}
 *   -> {output: [{type:'message', content:[{type:'output_text', text}]}], usage}
 * - POST /v1/runs {input, instructions?, session_id?} -> 202 {run_id, status}
 * - GET  /v1/runs/{id}/events (SSE; run.completed carries output+usage,
 *   approval.request carries command/description/choices)
 * - POST /v1/runs/{id}/approval {"choice": "once|session|always|deny"}
 *
 * The cache-read split is NOT in the usage block; it appears only in the
 * gateway log (`cache=X/Y`). Cost accounting reads logs, not this client.
 */

export interface HermesClientOptions {
  baseUrl: string;
  apiKey: string;
  /** Per-request timeout; run streams get 5x this (a run spans many model calls). */
  timeoutMs: number;
}

export interface ResponseUsage {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

export interface SendResponseResult {
  outputText: string;
  usage: ResponseUsage;
}

export interface RunEvent {
  event: string;
  [key: string]: unknown;
}

export interface RunResult {
  runId: string;
  status: 'completed' | 'failed';
  output: string;
  error?: string;
  usage?: ResponseUsage;
}

export class HermesClient {
  constructor(private readonly opts: HermesClientOptions) {}

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.opts.apiKey}`,
      'content-type': 'application/json',
    };
  }

  /** One turn on a named conversation (server-side state, prefix-cache stable). */
  async sendResponse(input: {
    model: string;
    conversation: string;
    input: string;
    instructions?: string;
  }): Promise<SendResponseResult> {
    const res = await fetch(`${this.opts.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: input.model,
        input: input.input,
        conversation: input.conversation,
        store: true,
        ...(input.instructions ? { instructions: input.instructions } : {}),
      }),
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    if (!res.ok) throw new Error(`Hermes /v1/responses ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as {
      error?: unknown;
      output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
      usage?: ResponseUsage;
    };
    if (body.error) throw new Error(`Hermes /v1/responses error: ${JSON.stringify(body.error)}`);
    const outputText = (body.output ?? [])
      .filter((item) => item.type === 'message')
      .flatMap((item) => item.content ?? [])
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text ?? '')
      .join('\n');
    return { outputText, usage: body.usage ?? {} };
  }

  /** Submit a gated async run. */
  async submitRun(input: {
    input: string;
    instructions?: string;
    sessionId?: string;
  }): Promise<string> {
    const res = await fetch(`${this.opts.baseUrl}/v1/runs`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        input: input.input,
        ...(input.instructions ? { instructions: input.instructions } : {}),
        ...(input.sessionId ? { session_id: input.sessionId } : {}),
      }),
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    if (res.status !== 202 && !res.ok) {
      throw new Error(`Hermes /v1/runs ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { run_id?: string };
    if (!body.run_id) throw new Error('Hermes /v1/runs returned no run_id');
    return body.run_id;
  }

  /**
   * Stream a run's SSE events until it reaches a terminal event. `onEvent`
   * sees every event (tool starts, approval.request, ...); the returned
   * promise resolves on run.completed / run.failed.
   */
  async streamRunToCompletion(
    runId: string,
    onEvent?: (event: RunEvent) => void | Promise<void>,
  ): Promise<RunResult> {
    const res = await fetch(`${this.opts.baseUrl}/v1/runs/${runId}/events`, {
      headers: { authorization: `Bearer ${this.opts.apiKey}`, accept: 'text/event-stream' },
      signal: AbortSignal.timeout(this.opts.timeoutMs * 5),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Hermes run events ${res.status}: ${await res.text()}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        let eventName: string | undefined;
        let data = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;

        let parsed: RunEvent;
        try {
          const obj = JSON.parse(data) as Record<string, unknown>;
          parsed = { ...obj, event: (obj.event as string) ?? eventName ?? 'message' };
        } catch {
          continue;
        }
        if (onEvent) await onEvent(parsed);

        if (parsed.event === 'run.completed') {
          return {
            runId,
            status: 'completed',
            output: String(parsed.output ?? ''),
            usage: parsed.usage as ResponseUsage | undefined,
          };
        }
        if (parsed.event === 'run.failed' || parsed.event === 'run.cancelled') {
          return {
            runId,
            status: 'failed',
            output: '',
            error: String(parsed.error ?? parsed.event),
          };
        }
      }
    }
    throw new Error(`Hermes run ${runId}: event stream ended without a terminal event`);
  }

  /** Resolve a pending approval on a run. */
  async resolveApproval(
    runId: string,
    choice: 'once' | 'session' | 'always' | 'deny',
  ): Promise<void> {
    const res = await fetch(`${this.opts.baseUrl}/v1/runs/${runId}/approval`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ choice }),
      signal: AbortSignal.timeout(this.opts.timeoutMs),
    });
    if (!res.ok) throw new Error(`Hermes approval ${res.status}: ${await res.text()}`);
  }
}
