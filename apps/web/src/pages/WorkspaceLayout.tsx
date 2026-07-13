import { Outlet, useLocation, useParams } from 'react-router';
import { cn } from '@/lib/utils';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar, type WorkspaceStage } from '../components/app-sidebar';
import { SearchPaletteHost } from '../components/SearchPalette';
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
  const location = useLocation();
  const workspace = workspaces?.find((w) => w.id === workspaceId);
  const stage = useWorkspaceStage(workspaceId);
  const { role } = useMyRole(workspaceId);

  // The Book (/w/:id/records, no record id) manages its own full-height,
  // full-width layout; every other page reads as a centered document.
  const segments = location.pathname.split('/').filter(Boolean);
  const isBook = segments.length === 3 && segments[2] === 'records';

  return (
    <SidebarProvider>
      <AppSidebar
        workspaceName={workspace?.name}
        email={session?.user.email}
        stage={stage}
        role={role}
      />
      <SidebarInset className={cn('min-w-0 bg-background', isBook && 'h-svh overflow-hidden')}>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:hidden">
          <SidebarTrigger />
          <span className="font-display text-lg font-[560] text-ink">Cormac</span>
          <span className="truncate text-xs text-muted-foreground">{workspace?.name}</span>
        </header>
        {isBook ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </div>
        ) : (
          <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        )}
      </SidebarInset>
      {stage === 'live' && <SearchPaletteHost workspaceId={workspaceId} />}
    </SidebarProvider>
  );
}
