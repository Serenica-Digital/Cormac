import { Outlet, useParams } from 'react-router';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar, type WorkspaceStage } from '../components/app-sidebar';
import { useContract, useWorkspaces } from '../api/hooks';
import { useMyRole } from '../lib/authz';
import { useSession } from '../auth/useSession';

/** Where this workspace is in its life: still loading, pre-setup, or live. */
export function useWorkspaceStage(workspaceId: string): WorkspaceStage {
  const contract = useContract(workspaceId);
  if (contract.isPending) return 'pending';
  if (contract.data) return 'live';
  const noContract =
    contract.error instanceof Error && contract.error.message.includes('No active contract');
  // An unexpected error (API down) falls back to the full nav; each page
  // surfaces its own error state.
  return noContract ? 'setup' : 'live';
}

export function WorkspaceLayout() {
  const { workspaceId = '' } = useParams();
  const { data: workspaces } = useWorkspaces();
  const { session } = useSession();
  const workspace = workspaces?.find((w) => w.id === workspaceId);
  const stage = useWorkspaceStage(workspaceId);
  const { role } = useMyRole(workspaceId);

  return (
    <SidebarProvider>
      <AppSidebar
        workspaceName={workspace?.name}
        email={session?.user.email}
        stage={stage}
        role={role}
      />
      <SidebarInset className="min-w-0 bg-background">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:hidden">
          <SidebarTrigger />
          <span className="font-display text-lg font-[560] text-ink">Cormac</span>
          <span className="truncate text-xs text-muted-foreground">{workspace?.name}</span>
        </header>
        <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
