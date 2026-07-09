import { Link, useParams } from 'react-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOperatorWorkspace, useRevokeAgentToken } from '../../api/hooks';
import { roleLabel } from '../../lib/authz';
import { ErrorNote, PageHeader, SectionLabel, Spinner } from '../../components/kit';
import { formatWhen } from '@/lib/format';

export function OperatorWorkspaceDetail() {
  const { workspaceId = '' } = useParams();
  const detail = useOperatorWorkspace(workspaceId);
  const revoke = useRevokeAgentToken(workspaceId);

  if (detail.isPending) {
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Spinner />
      </div>
    );
  }
  if (detail.error) return <ErrorNote error={detail.error} />;
  const d = detail.data!;

  return (
    <div>
      <Link to="/operator" className="text-xs text-stone-400 underline underline-offset-2">
        All workspaces
      </Link>
      <div className="mt-2">
        <PageHeader
          title={d.workspace.name}
          sub={`Created ${formatWhen(d.workspace.createdAt)} · confirmation mode ${d.workspace.confirmationMode} · ${
            d.contract ? `contract v${d.contract.version}` : 'no contract yet'
          } · ${d.stats.recordCount} records · ${d.stats.pendingProposalCount} pending proposals`}
        />
      </div>

      <div className="mb-8">
        <div className="mb-2">
          <SectionLabel>Members</SectionLabel>
        </div>
        {d.members.length === 0 ? (
          <p className="text-sm text-stone-500">No members yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
            <Table className="min-w-[32rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.members.map((m) => (
                  <TableRow key={m.userId}>
                    <TableCell className="font-medium">{m.email ?? m.userId}</TableCell>
                    <TableCell>{roleLabel(m.role)}</TableCell>
                    <TableCell className="text-stone-500">{formatWhen(m.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2">
          <SectionLabel>Agent tokens</SectionLabel>
        </div>
        {d.agentTokens.length === 0 ? (
          <p className="text-sm text-stone-500">No agent tokens bound to this workspace.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
            <Table className="min-w-[36rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.agentTokens.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.agent}</TableCell>
                    <TableCell className="text-stone-500">{formatWhen(t.createdAt)}</TableCell>
                    <TableCell>
                      {t.revokedAt ? (
                        <Badge variant="rejected">Revoked {formatWhen(t.revokedAt)}</Badge>
                      ) : (
                        <Badge variant="applied">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!t.revokedAt && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="danger" size="sm" disabled={revoke.isPending}>
                              Revoke
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Revoke the {t.agent} token for {d.workspace.name}?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                The runtime agent using it loses access immediately and cannot get
                                it back; a new token must be minted and bound. Revocation cannot be
                                undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep it</AlertDialogCancel>
                              <AlertDialogAction onClick={() => revoke.mutate(t.id)}>
                                Revoke
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {revoke.error && (
          <div className="mt-3">
            <ErrorNote error={revoke.error} />
          </div>
        )}
      </div>
    </div>
  );
}
