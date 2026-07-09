import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Contract } from '@cormac/contract';
import { api } from './client';
import type {
  AddMemberResult,
  AuditEventRow,
  AuthoringTurnOutcome,
  BusinessRecordRow,
  CaptureResult,
  CreateWorkspaceResult,
  DecisionResult,
  Me,
  OperatorAgentToken,
  OperatorWorkspaceDetail,
  OperatorWorkspaceSummary,
  ProposalView,
  TimelineEntry,
  WorkbookUploadResult,
  WorkspaceMemberRow,
  WorkspaceMembership,
} from './types';

const ws = (id: string) => `/api/workspaces/${id}`;

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.get<{ workspaces: WorkspaceMembership[] }>('/api/workspaces'),
    select: (d) => d.workspaces,
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Me>('/api/me'),
    // Identity and the operator flag move rarely; don't refetch per page.
    staleTime: 5 * 60_000,
  });
}

export function useMembers(workspaceId: string) {
  return useQuery({
    queryKey: ['members', workspaceId],
    queryFn: () => api.get<{ members: WorkspaceMemberRow[] }>(`${ws(workspaceId)}/members`),
    select: (d) => d.members,
  });
}

/** Membership mutations invalidate the workspaces list too: my own role may change. */
function useMembersInvalidation(workspaceId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['members', workspaceId] });
    void qc.invalidateQueries({ queryKey: ['workspaces'] });
  };
}

export function useAddMember(workspaceId: string) {
  const invalidate = useMembersInvalidation(workspaceId);
  return useMutation({
    mutationFn: (input: { email: string; role: string }) =>
      api.post<AddMemberResult>(`${ws(workspaceId)}/members`, input),
    onSuccess: invalidate,
  });
}

export function useChangeMemberRole(workspaceId: string) {
  const invalidate = useMembersInvalidation(workspaceId);
  return useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      api.patch<{ member: WorkspaceMemberRow }>(`${ws(workspaceId)}/members/${input.userId}`, {
        role: input.role,
      }),
    onSuccess: invalidate,
  });
}

export function useRemoveMember(workspaceId: string) {
  const invalidate = useMembersInvalidation(workspaceId);
  return useMutation({
    mutationFn: (userId: string) =>
      api.del<{ removed: boolean }>(`${ws(workspaceId)}/members/${userId}`),
    onSuccess: invalidate,
  });
}

// --- Operator surface (Serenica-internal) -----------------------------------

export function useOperatorWorkspaces() {
  return useQuery({
    queryKey: ['operator', 'workspaces'],
    queryFn: () => api.get<{ workspaces: OperatorWorkspaceSummary[] }>('/api/operator/workspaces'),
    select: (d) => d.workspaces,
  });
}

export function useOperatorWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: ['operator', 'workspace', workspaceId],
    queryFn: () => api.get<OperatorWorkspaceDetail>(`/api/operator/workspaces/${workspaceId}`),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; ownerEmail?: string }) =>
      api.post<CreateWorkspaceResult>('/api/operator/workspaces', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['operator', 'workspaces'] });
    },
  });
}

export function useRevokeAgentToken(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) =>
      api.post<{ token: OperatorAgentToken }>(`/api/operator/agent-tokens/${tokenId}/revoke`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['operator', 'workspace', workspaceId] });
    },
  });
}

export function useContract(workspaceId: string) {
  return useQuery({
    queryKey: ['contract', workspaceId],
    queryFn: () => api.get<{ contract: Contract; version: number }>(`${ws(workspaceId)}/contract`),
    retry: (count, error) =>
      count < 2 && !(error instanceof Error && error.message.includes('No active contract')),
  });
}

export function useProposals(workspaceId: string, status?: 'pending' | 'applied' | 'rejected') {
  return useQuery({
    queryKey: ['proposals', workspaceId, status ?? 'all'],
    queryFn: () =>
      api.get<{ proposals: ProposalView[] }>(
        `${ws(workspaceId)}/proposals${status ? `?status=${status}` : ''}`,
      ),
    select: (d) => d.proposals,
  });
}

export function useRecords(workspaceId: string, object?: string) {
  return useQuery({
    queryKey: ['records', workspaceId, object ?? 'all'],
    queryFn: () =>
      api.get<{ records: BusinessRecordRow[] }>(
        `${ws(workspaceId)}/records${object ? `?object=${encodeURIComponent(object)}` : ''}`,
      ),
    select: (d) => d.records,
  });
}

export function useRecordTimeline(workspaceId: string, recordId: string) {
  return useQuery({
    queryKey: ['timeline', workspaceId, recordId],
    queryFn: () =>
      api.get<{ record: BusinessRecordRow; entries: TimelineEntry[] }>(
        `${ws(workspaceId)}/records/${recordId}/timeline`,
      ),
  });
}

export function useAudit(workspaceId: string) {
  return useQuery({
    queryKey: ['audit', workspaceId],
    queryFn: () => api.get<{ events: AuditEventRow[] }>(`${ws(workspaceId)}/audit`),
    select: (d) => d.events,
  });
}

export function useCapture(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.post<CaptureResult>(`${ws(workspaceId)}/capture`, { text }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['proposals', workspaceId] });
    },
  });
}

export function useDecision(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { proposalId: string; decision: 'approve' | 'reject' }) =>
      api.post<DecisionResult>(`${ws(workspaceId)}/proposals/${input.proposalId}/decision`, {
        decision: input.decision,
      }),
    onSuccess: () => {
      for (const key of ['proposals', 'records', 'audit'] as const) {
        void qc.invalidateQueries({ queryKey: [key, workspaceId] });
      }
    },
  });
}

export function useAuthoringTurn(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      api.post<AuthoringTurnOutcome>(`${ws(workspaceId)}/authoring/turn`, { text }),
    onSuccess: () => {
      // A turn may have published the contract; keep that screen honest.
      void qc.invalidateQueries({ queryKey: ['contract', workspaceId] });
    },
  });
}

export function useWorkbookUpload(workspaceId: string) {
  return useMutation({
    mutationFn: (input: { name: string; profile: Record<string, unknown> }) =>
      api.post<WorkbookUploadResult>(`${ws(workspaceId)}/workbook`, input),
  });
}
