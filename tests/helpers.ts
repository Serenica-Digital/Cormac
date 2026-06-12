import type { Db } from '@cormac/db';

/**
 * Tracks what a test file creates in the shared local database and removes it
 * in afterAll, so test runs stop accumulating residue next to the demo
 * workspace. Workspaces go through the service-role-only purge_workspace path
 * (migration 0005), the one deletion the append-only audit trigger sanctions;
 * auth users are deleted after their workspace rows are gone.
 */
export class TestResources {
  private readonly workspaceIds: string[] = [];
  private readonly userIds: string[] = [];

  workspace(id: string): string {
    this.workspaceIds.push(id);
    return id;
  }

  user(id: string): string {
    this.userIds.push(id);
    return id;
  }

  async cleanup(service: Db): Promise<void> {
    for (const id of this.workspaceIds) {
      const { error } = await service.rpc('purge_workspace', { p_workspace_id: id });
      if (error) console.warn(`test cleanup: purge_workspace(${id}) failed: ${error.message}`);
    }
    for (const id of this.userIds) {
      const { error } = await service.auth.admin.deleteUser(id);
      if (error) console.warn(`test cleanup: deleteUser(${id}) failed: ${error.message}`);
    }
  }
}
