/**
 * Workspace authorization vocabulary: roles, capabilities, and the mapping
 * between them. Moved out of the control plane's shared.ts when the web app
 * became a second consumer. The authority these encode is enforced by the
 * control plane, server-side; any use in a UI is presentation, never a
 * security boundary.
 */

export const ROLES = ['owner', 'agent_admin', 'manager', 'member', 'read_only'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Capabilities the control plane checks before doing anything dangerous. */
export type Capability =
  | 'capture_update' // submit natural language that becomes a proposal
  | 'approve_proposal' // approve/reject a held proposal, applying a write
  | 'publish_contract' // publish a new contract version
  | 'manage_members' // add or remove members, change their roles
  | 'read_records'; // read business records and the proposal queue

export const CAPABILITIES_BY_ROLE: Record<Role, ReadonlySet<Capability>> = {
  owner: new Set<Capability>([
    'capture_update',
    'approve_proposal',
    'publish_contract',
    'manage_members',
    'read_records',
  ]),
  agent_admin: new Set<Capability>([
    'capture_update',
    'approve_proposal',
    'publish_contract',
    'manage_members',
    'read_records',
  ]),
  manager: new Set<Capability>(['capture_update', 'approve_proposal', 'read_records']),
  member: new Set<Capability>(['capture_update', 'read_records']),
  read_only: new Set<Capability>(['read_records']),
};

export function can(role: Role, capability: Capability): boolean {
  return CAPABILITIES_BY_ROLE[role].has(capability);
}
