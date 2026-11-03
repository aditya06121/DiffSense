import { Router, Request, Response } from 'express';
import { ConfigLoader } from '../../core/Config';
import { RepositoryManager } from '../../repository/RepositoryManager';
import { WorkspaceManager } from '../../repository/WorkspaceManager';
import { Logger } from '../../core/Logger';

import { JobExecutor } from '../../core/JobExecutor';

export function createRepositoryRouter(
  repoManager: RepositoryManager,
  workspaceManager: WorkspaceManager,
  executor?: JobExecutor
): Router {
  const router = Router();
  const configLoader = ConfigLoader.getInstance();

  // GET /api/repositories - List all repositories with their status
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const config = configLoader.getConfig();
      const repositories = [];

      for (const [id, repoConfig] of Object.entries(config.repositories)) {
        const status = await repoManager.getStatus(id);
        repositories.push({
          id,
          ssh: repoConfig.ssh,
          defaultBranch: repoConfig.defaultBranch,
          isCloned: status.exists,
          activeBranch: status.activeBranch,
          currentCommit: status.currentCommit,
          isSyncing: executor ? executor.isRepoActive(id) : false,
        });
      }

      res.json({ success: true, count: repositories.length, repositories });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/repositories - Add a new repository to config and automatically clone & sync it
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { id, ssh, defaultBranch } = req.body;

      if (!id || !ssh) {
        return res.status(400).json({ success: false, error: 'Both "id" and "ssh" fields are required.' });
      }

      const targetBranch = defaultBranch || 'main';

      // 1. Add repository to YAML config
      configLoader.addRepository(id, { ssh, defaultBranch: targetBranch });
      const updatedConfig = configLoader.getRepositoryConfig(id);

      // 2. Clone the repository immediately if not cloned
      if (!workspaceManager.repoExists(id)) {
        await repoManager.clone(id, ssh);
      }

      // 3. Update / checkout default branch
      try {
        await repoManager.update(id, targetBranch);
      } catch (err: any) {
        Logger.getInstance().warn(`Initial sync for ${id} warning:`, { error: err.message });
      }

      const status = await repoManager.getStatus(id);

      res.status(201).json({
        success: true,
        message: `Repository '${id}' added and cloned successfully.`,
        repository: {
          id,
          ssh: updatedConfig.ssh,
          defaultBranch: updatedConfig.defaultBranch,
          isCloned: status.exists,
          activeBranch: status.activeBranch,
          currentCommit: status.currentCommit,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // PUT /api/repositories/:id - Update repository configuration (e.g. defaultBranch, ssh)
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { ssh, defaultBranch } = req.body;

      configLoader.updateRepository(id, { ssh, defaultBranch });
      const updatedConfig = configLoader.getRepositoryConfig(id);

      res.json({
        success: true,
        message: `Repository '${id}' updated successfully.`,
        repository: { id, ...updatedConfig },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // DELETE /api/repositories/:id - Remove repository from configuration
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      configLoader.deleteRepository(id);
      res.json({ success: true, message: `Repository '${id}' removed from configuration.` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/repositories/:id/branches - List local and remote branches
  router.get('/:id/branches', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // If repo is not cloned yet, attempt clone using config SSH
      if (!workspaceManager.repoExists(id)) {
        const repoConfig = configLoader.getRepositoryConfig(id);
        if (repoConfig) {
          await repoManager.clone(id, repoConfig.ssh);
          await repoManager.update(id, repoConfig.defaultBranch);
        }
      }

      const branchInfo = await repoManager.listBranches(id);
      res.json({ success: true, repoId: id, ...branchInfo });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/repositories/:id/status - Get current commit & git status
  router.get('/:id/status', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const statusInfo = await repoManager.getStatus(id);
      res.json({ success: true, ...statusInfo });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
