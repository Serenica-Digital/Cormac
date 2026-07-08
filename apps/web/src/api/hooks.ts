import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Contract } from '@cormac/contract';
import { api } from './client';
import type {
  AuditEventRow,
  AuthoringTurnOutcome,
  BusinessRecordRow,
  CaptureResult,
  DecisionResult,
  ProposalView,
  TimelineEntry,
  WorkbookUploadResult,
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
