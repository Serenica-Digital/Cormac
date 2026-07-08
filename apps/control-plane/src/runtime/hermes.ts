import type { HermesClient } from './client.js';
import type {
  AuthoringTurnInput,
  AuthoringTurnOutcome,
  CaptureTaskInput,
  CaptureTaskOutcome,
  RuntimeClient,
} from './types.js';

/**
 * The production RuntimeClient over the ADR-0001 transport. Two lanes:
 *
 * - Authoring turns ride POST /v1/responses on the named conversation
 *   `authoring:<workspaceId>` — server-side state carries the interview
 *   across calls and survives gateway restarts (verified in the spike).
 * - Capture tasks ride POST /v1/runs with the compiled workspace context in
 *   the `instructions` seam (cache-stable prefix) and complete via the SSE
 *   event stream. The agent submits its proposal through /agent/proposals
 *   before the run ends; capture correlates by source message.
 */
export class HermesRuntime implements RuntimeClient {
  constructor(
    private readonly client: HermesClient,
    private readonly model: string,
  ) {}

  static conversationFor(workspaceId: string): string {
    return `authoring:${workspaceId}`;
  }

  async sendAuthoringTurn(input: AuthoringTurnInput): Promise<AuthoringTurnOutcome> {
    const conversation = HermesRuntime.conversationFor(input.workspaceId);
    const result = await this.client.sendResponse({
      model: this.model,
      conversation,
      input: input.text,
    });
    return { conversation, output: result.outputText };
  }

  async runCaptureTask(input: CaptureTaskInput): Promise<CaptureTaskOutcome> {
    const runId = await this.client.submitRun({
      // The task brief names the taskId the agent must pass to submit_proposal;
      // the control plane created it, the agent cannot invent one.
      input: [
        `Task ${input.taskId}: process this inbound message for workspace records.`,
        `Message: ${input.text}`,
        `When you have a change set, submit it with taskId ${input.taskId}.`,
        `If nothing should change, say why instead of submitting.`,
      ].join('\n'),
      instructions: input.context,
      sessionId: input.taskId,
    });
    const result = await this.client.streamRunToCompletion(runId);
    if (result.status === 'failed') {
      throw new Error(`capture run ${runId} failed: ${result.error}`);
    }
    return { runId, output: result.output };
  }
}
