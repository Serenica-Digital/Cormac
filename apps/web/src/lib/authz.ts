import { can, isRole, type Capability, type Role } from '@cormac/authz';
import { useWorkspaces } from '../api/hooks';

/**
 * The client's view of workspace authority. Everything here is presentation:
 * it decides what to show, never what is allowed. The control plane checks
 * the same @cormac/authz vocabulary server-side on every call, so a stale or
 * spoofed UI can render a control and still be refused.
 */

export { can, isRole, ROLES } from '@cormac/authz';
export type { Capability, Role } from '@cormac/authz';

/** Client words for roles: what a small business owner would call them. */
export const ROLE_LABELS: Record<Role, { label: string; blurb: string }> = {
  owner: { label: 'Owner', blurb: 'Everything, including who can work here.' },
  agent_admin: { label: 'Admin', blurb: 'Runs setup and manages the people list.' },
  manager: { label: 'Manager', blurb: 'Approves changes before they land.' },
  member: { label: 'Member', blurb: 'Sends updates in for approval.' },
  read_only: { label: 'Viewer', blurb: 'Reads the book, changes nothing.' },
};

/** An unrecognized role floors to read_only: show less, never more. */
export function roleOrFloor(raw: unknown): Role {
  return isRole(raw) ? raw : 'read_only';
}

/**
 * The caller's role in this workspace, derived from the workspaces query the
 * shell already runs (no extra request). `role` is null while that query is
 * in flight so callers can hold their skeletons instead of flashing the floor.
 */
export function useMyRole(workspaceId: string): { role: Role | null; isPending: boolean } {
  const { data, isPending } = useWorkspaces();
  if (isPending) return { role: null, isPending: true };
  return { role: roleOrFloor(data?.find((w) => w.id === workspaceId)?.role), isPending: false };
}

/** Capability check bound to this workspace; false until the role resolves. */
export function useCan(workspaceId: string): (capability: Capability) => boolean {
  const { role } = useMyRole(workspaceId);
  return (capability) => (role !== null ? can(role, capability) : false);
}
