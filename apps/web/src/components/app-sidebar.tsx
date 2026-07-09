import { Link, NavLink, useLocation } from 'react-router';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from '@/components/ui/sidebar';
import { buildNav } from '@/lib/nav';
import type { Role } from '@/lib/authz';
import { supabase } from '../supabase';

export type WorkspaceStage = 'pending' | 'setup' | 'live';

export function AppSidebar({
  workspaceName,
  email,
  stage,
  role,
}: {
  workspaceName?: string;
  email?: string;
  stage: WorkspaceStage;
  role: Role | null;
}) {
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  // /w/:workspaceId/<segment>/... — the segment names the active page.
  const activeSegment = location.pathname.split('/')[3] ?? '';
  const itemClasses = 'h-auto flex-col items-start gap-0 py-2';

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-4 pt-4 pb-2">
        <Link to="/" className="w-fit font-display text-2xl font-[560] text-ink">
          Cormac
        </Link>
        <div className="truncate text-xs text-muted-foreground">{workspaceName ?? 'workspace'}</div>
      </SidebarHeader>
      <SidebarContent>
        {stage === 'pending' || role === null ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {[0, 1, 2].map((i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          buildNav({ live: stage === 'live', role }).map((group, gi) => (
            <SidebarGroup key={group.label ?? gi}>
              {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      {item.disabled ? (
                        <SidebarMenuButton
                          aria-disabled
                          className={`${itemClasses} opacity-55 hover:bg-transparent active:translate-y-0`}
                        >
                          <span>{item.label}</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            {item.hint}
                          </span>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          asChild
                          isActive={activeSegment === item.to}
                          className={itemClasses}
                        >
                          <NavLink
                            to={item.to}
                            onClick={() => {
                              if (isMobile) setOpenMobile(false);
                            }}
                          >
                            <span>{item.label}</span>
                            <span className="text-xs font-normal text-muted-foreground">
                              {item.hint}
                            </span>
                          </NavLink>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-4 py-3">
        <div className="truncate text-xs text-muted-foreground">{email}</div>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="w-fit text-xs text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
