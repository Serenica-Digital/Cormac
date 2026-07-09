import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCreateWorkspace, useOperatorWorkspaces } from '../../api/hooks';
import { ErrorNote, PageHeader, Spinner } from '../../components/kit';
import { formatWhen } from '@/lib/format';

export function OperatorWorkspaces() {
  const workspaces = useOperatorWorkspaces();
  const create = useCreateWorkspace();
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [created, setCreated] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreated(null);
    create.mutate(
      { name: name.trim(), ...(ownerEmail.trim() ? { ownerEmail: ownerEmail.trim() } : {}) },
      {
        onSuccess: (result) => {
          setName('');
          setOwnerEmail('');
          setCreated(
            result.owner
              ? `${result.workspace.name} created; owner ${result.owner.email}${result.owner.userCreated ? ' (new account, signs in via magic link or OAuth)' : ''}.`
              : `${result.workspace.name} created, no members yet.`,
          );
        },
      },
    );
  }

  return (
    <div>
      <PageHeader title="Workspaces" sub="Every tenant on this deployment." />

      <form
        onSubmit={submit}
        className="mb-8 flex flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-end"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="ws-name">New workspace</Label>
          <Input
            id="ws-name"
            placeholder="Client name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={create.isPending}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="ws-owner">First owner email (optional)</Label>
          <Input
            id="ws-owner"
            type="email"
            placeholder="owner@client.com"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            disabled={create.isPending}
          />
        </div>
        <Button type="submit" busy={create.isPending} disabled={!name.trim()}>
          Create
        </Button>
      </form>
      {create.error && (
        <div className="-mt-4 mb-6">
          <ErrorNote error={create.error} />
        </div>
      )}
      {created && <p className="-mt-4 mb-6 text-sm text-ledger-700">{created}</p>}

      {workspaces.isPending && (
        <div className="flex justify-center py-8 text-stone-400">
          <Spinner />
        </div>
      )}
      {workspaces.error && <ErrorNote error={workspaces.error} />}

      {workspaces.data && (
        <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
          <Table className="min-w-[44rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Workspace</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Contract</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.data.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <Link
                      to={`workspaces/${w.id}`}
                      className="font-medium text-ledger-700 underline decoration-ledger-200 underline-offset-2 hover:decoration-ledger-600"
                    >
                      {w.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{w.stats.memberCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {w.stats.contractVersion !== null ? `v${w.stats.contractVersion}` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{w.stats.recordCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {w.stats.pendingProposalCount}
                  </TableCell>
                  <TableCell className="text-stone-500">
                    {w.stats.lastAuditAt ? formatWhen(w.stats.lastAuditAt) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
