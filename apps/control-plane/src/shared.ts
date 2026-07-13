/**
 * Control-plane vocabulary. The workspace role/capability model moved to
 * @cormac/authz when the web app became a second consumer; it is re-exported
 * here so existing './shared.js' imports keep working. What remains local:
 * the confirmation mode, the agent-kind split, and the typed error the
 * control plane turns into HTTP problem responses. The authority these encode
 * is enforced server-side; nothing here is a UI-only check.
 */

export { CAPABILITIES_BY_ROLE, can, isRole, ROLES } from '@cormac/authz';
export type { Capability, Role } from '@cormac/authz';

/**
 * Per-workspace write-confirmation policy. The skeleton ships `confirm_each`
 * only; `apply_then_report` is named but not yet selectable as a default.
 */
export const CONFIRMATION_MODES = ['confirm_each', 'apply_then_report'] as const;
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number];

/**
 * The two agent kinds and their privilege split (ADR-0005): what each kind of
 * runtime agent may reach on the /agent/* surface. An authoring token cannot
 * submit proposals; an operations token cannot publish contracts.
 */
export const AGENT_KINDS = ['authoring', 'operations'] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export type AgentCapability =
  | 'read_workbook' // the latest workbook detection profile
  | 'submit_contract' // the validating contract publish gate
  | 'read_contract' // the active contract document
  | 'read_records' // search + fetch records, sensitive fields redacted
  | 'submit_proposal' // hold a proposed change set for human review
  | 'propose_learning' // stage a typed learned fact for human review
  | 'read_history'; // search past messages/decisions, redacted and bounded

const AGENT_CAPABILITIES: Record<AgentKind, ReadonlySet<AgentCapability>> = {
  authoring: new Set<AgentCapability>(['read_workbook', 'submit_contract']),
  operations: new Set<AgentCapability>([
    'read_contract',
    'read_records',
    'submit_proposal',
    'propose_learning',
    'read_history',
  ]),
};

export function agentCan(agent: AgentKind, capability: AgentCapability): boolean {
  return AGENT_CAPABILITIES[agent].has(capability);
}

/**
 * A typed error the API maps to an RFC-9457-style problem response. Carrying the
 * status on the error keeps route handlers from hand-rolling status codes.
 */
export class ProblemError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;

  constructor(status: number, code: string, message: string, detail?: string) {
    super(message);
    this.name = 'ProblemError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }

  static unauthorized(detail?: string): ProblemError {
    return new ProblemError(401, 'unauthorized', 'Authentication required', detail);
  }

  static forbidden(detail?: string): ProblemError {
    return new ProblemError(403, 'forbidden', 'Not permitted', detail);
  }

  static badRequest(message: string, detail?: string): ProblemError {
    return new ProblemError(400, 'bad_request', message, detail);
  }

  static notFound(message = 'Not found', detail?: string): ProblemError {
    return new ProblemError(404, 'not_found', message, detail);
  }

  static unprocessable(message: string, detail?: string): ProblemError {
    return new ProblemError(422, 'unprocessable', message, detail);
  }
}
