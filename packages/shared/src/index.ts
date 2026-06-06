/**
 * Shared vocabulary for Serenica: workspace roles, the per-workspace confirmation
 * mode, and a typed error the control plane turns into HTTP problem responses.
 *
 * Roles and permissions are intentionally small for the walking skeleton. The
 * authority they encode is enforced server-side in the control plane (ADR-011,
 * ADR-015); nothing here is a UI-only check.
 */

export const ROLES = ['owner', 'agent_admin', 'manager', 'member', 'read_only'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Per-workspace write-confirmation policy (ADR-010). The skeleton ships
 * `confirm_each` only; `apply_then_report` is gated on the weekly report and a
 * passing eval set, so it is named here but not yet selectable as a default.
 */
export const CONFIRMATION_MODES = ['confirm_each', 'apply_then_report'] as const;
export type ConfirmationMode = (typeof CONFIRMATION_MODES)[number];

/** Capabilities the control plane checks before doing anything dangerous. */
export type Capability =
  | 'capture_update' // submit natural language that becomes a proposal
  | 'approve_proposal' // approve/reject a held proposal, applying a write
  | 'publish_contract' // publish a new contract version
  | 'read_records'; // read business records and the proposal queue

const CAPABILITIES_BY_ROLE: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set<Capability>([
    'capture_update',
    'approve_proposal',
    'publish_contract',
    'read_records',
  ]),
  agent_admin: new Set<Capability>([
    'capture_update',
    'approve_proposal',
    'publish_contract',
    'read_records',
  ]),
  manager: new Set<Capability>(['capture_update', 'approve_proposal', 'read_records']),
  member: new Set<Capability>(['capture_update', 'read_records']),
  read_only: new Set<Capability>(['read_records']),
};

export function can(role: Role, capability: Capability): boolean {
  return CAPABILITIES_BY_ROLE[role].has(capability);
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
