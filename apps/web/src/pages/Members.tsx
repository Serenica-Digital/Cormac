import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  useAddMember,
  useChangeMemberRole,
  useMe,
  useMembers,
  useRemoveMember,
} from '../api/hooks';
import type { WorkspaceMemberRow } from '../api/types';
import { can, ROLE_LABELS, ROLES, useMyRole, type Role } from '../lib/authz';
import { EmptyState, ErrorNote, PageHeader, Spinner } from '../components/kit';
import { formatWhen } from '@/lib/format';

function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, { label: string }>)[role]?.label ?? role;
}

/**
 * Who can work in this book. The UI mirrors the server's rules so nobody
 * discovers them by 403: the owner role only moves by an owner's hand, the
 * last owner cannot leave or be demoted, and your own role is not yours to
 * change. The server enforces all of it regardless.
 */
export function Members() {
  const { workspaceId = '' } = useParams();
  const { role: myRole } = useMyRole(workspaceId);

  if (myRole === null) {
    return (
      <div className="flex justify-center py-20 text-stone-400">
        <Spinner />
      </div>
    );
  }
  if (!can(myRole, 'manage_members')) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          title="Nothing to manage here"
          hint="The people list is looked after by this book's owner and admins."
        />
      </div>
    );
  }
  return <MembersAdmin myRole={myRole} />;
}

function MembersAdmin({ myRole }: { myRole: Role }) {
  const { workspaceId = '' } = useParams();
  const me = useMe();
  const members = useMembers(workspaceId);
  const addMember = useAddMember(workspaceId);
  const changeRole = useChangeMemberRole(workspaceId);
  const removeMember = useRemoveMember(workspaceId);

  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  // The owner role moves only by an owner's hand (server rule, mirrored).
  const grantableRoles = ROLES.filter((r) => r !== 'owner' || myRole === 'owner');
  const ownerCount = members.data?.filter((m) => m.role === 'owner').length ?? 0;

  function invite(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    addMember.mutate({ email: trimmed, role: inviteRole }, { onSuccess: () => setEmail('') });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader title="People" sub="Who can work in this book, and what each person can do." />

      <form onSubmit={invite} className="mb-8 rounded-lg bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="invite-email">Add someone by email</Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={addMember.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-role">Access</Label>
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger id="invite-role" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {grantableRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    <span>{ROLE_LABELS[r].label}</span>
                    <span className="text-xs text-muted-foreground">{ROLE_LABELS[r].blurb}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" busy={addMember.isPending} disabled={!email.trim()}>
            Add
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          New people sign in with this email address. No invitation email is sent yet; let them know
          yourself.
        </p>
        {addMember.error && (
          <div className="mt-3">
            <ErrorNote error={addMember.error} />
          </div>
        )}
      </form>

      {members.isPending && (
        <div className="flex justify-center py-8 text-stone-400">
          <Spinner />
        </div>
      )}
      {members.error && <ErrorNote error={members.error} />}

      <div className="space-y-2">
        {members.data?.map((m) => (
          <MemberRow
            key={m.userId}
            member={m}
            isSelf={m.userId === me.data?.userId}
            myRole={myRole}
            grantableRoles={grantableRoles}
            lastOwner={m.role === 'owner' && ownerCount <= 1}
            onChangeRole={(role) => changeRole.mutate({ userId: m.userId, role })}
            onRemove={() => removeMember.mutate(m.userId)}
            busy={
              (changeRole.isPending && changeRole.variables?.userId === m.userId) ||
              (removeMember.isPending && removeMember.variables === m.userId)
            }
          />
        ))}
      </div>
      {(changeRole.error ?? removeMember.error) && (
        <div className="mt-3">
          <ErrorNote error={changeRole.error ?? removeMember.error} />
        </div>
      )}
    </div>
  );
}

function MemberRow({
  member,
  isSelf,
  myRole,
  grantableRoles,
  lastOwner,
  onChangeRole,
  onRemove,
  busy,
}: {
  member: WorkspaceMemberRow;
  isSelf: boolean;
  myRole: Role;
  grantableRoles: readonly Role[];
  lastOwner: boolean;
  onChangeRole: (role: string) => void;
  onRemove: () => void;
  busy: boolean;
}) {
  // Touching an owner (role or removal) is an owner-only act, mirrored here.
  const canTouch = member.role !== 'owner' || myRole === 'owner';
  const roleLocked = isSelf || !canTouch || lastOwner || busy;

  const lockedRole = (
    <span className="text-sm text-stone-600">
      {roleLabel(member.role)}
      {isSelf && <span className="ml-1.5 text-xs text-muted-foreground">(you)</span>}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-card px-4 py-3 ring-1 ring-foreground/10">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{member.email ?? member.userId}</div>
        <div className="text-xs text-muted-foreground">Joined {formatWhen(member.createdAt)}</div>
      </div>

      {roleLocked ? (
        lastOwner && !isSelf ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>{lockedRole}</TooltipTrigger>
              <TooltipContent>Every book needs an owner. Add another owner first.</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          lockedRole
        )
      ) : (
        <Select value={member.role} onValueChange={onChangeRole}>
          <SelectTrigger className="w-36" size="sm" aria-label={`Access for ${member.email}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {grantableRoles.map((r) => (
              <SelectItem key={r} value={r}>
                <span>{ROLE_LABELS[r].label}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[r].blurb}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {canTouch && !lastOwner && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={busy} className="text-stone-500">
              Remove
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {isSelf ? 'Leave this book?' : `Remove ${member.email ?? 'this person'}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {isSelf
                  ? "You'll lose access to this book immediately. Your past changes stay in History."
                  : 'They lose access immediately. Their past changes stay in History.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep them</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove}>
                {isSelf ? 'Leave' : 'Remove'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
