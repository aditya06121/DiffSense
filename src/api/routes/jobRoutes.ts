import { Router, Request, Response } from 'express';
import { JobExecutor } from '../../core/JobExecutor';
import { RepositoryManager } from '../../repository/RepositoryManager';
import { WorkspaceManager } from '../../repository/WorkspaceManager';
import { ConfigLoader } from '../../core/Config';
import { UpdateJob } from '../../jobs/UpdateJob';
import { CheckoutJob } from '../../jobs/CheckoutJob';

export function createJobRouter(
  executor: JobExecutor,
  repoManager: RepositoryManager,
  workspaceManager: WorkspaceManager
): Router {
  const router = Router();
  const configLoader = ConfigLoader.getInstance();

  // POST /api/jobs/sync - Trigger sync job for specified repo or all repos
  router.post('/sync', async (req: Request, res: Response) => {
    try {
      const { repoId, branch } = req.body;
      const config = configLoader.getConfig();

      if (repoId) {
        const repoCfg = configLoader.getRepositoryConfig(repoId);
        const targetBranch = branch || repoCfg.defaultBranch || 'main';

        const updateJob = new UpdateJob(
          repoId,
          repoCfg.ssh,
          targetBranch,
          repoManager,
          workspaceManager
        );

        // Execute job asynchronously or synchronously based on caller preference
        const jobResult = await executor.execute(updateJob);
        const skipped = !!jobResult.metadata?.skipped;
        return res.json({
          success: jobResult.success,
          skipped,
          commitHash: jobResult.metadata?.commitHash,
          durationMs: jobResult.durationMs,
          jobResult,
        });
      } else {
        // Trigger sync for all repositories sequentially
        const results = [];
        for (const [id, repoCfg] of Object.entries(config.repositories)) {
          const updateJob = new UpdateJob(
            id,
            repoCfg.ssh,
            branch || repoCfg.defaultBranch || 'main',
            repoManager,
            workspaceManager
          );
          const jobResult = await executor.execute(updateJob);
          results.push(jobResult);
        }

        return res.json({ success: true, count: results.length, results });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/jobs/active - Get currently executing/locked repositories
  router.get('/active', (_req: Request, res: Response) => {
    try {
      const activeRepos = executor.getActiveRepos();
      res.json({ success: true, activeRepos });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/jobs/checkout - Trigger checkout job for a specific repo & branch/commit
  router.post('/checkout', async (req: Request, res: Response) => {
    try {
      const { repoId, branch, ref } = req.body;
      const targetRef = branch || ref;

      if (!repoId || !targetRef) {
        return res.status(400).json({ success: false, error: 'Both "repoId" and "branch" (or "ref") are required.' });
      }

      const checkoutJob = new CheckoutJob(repoId, targetRef, repoManager, workspaceManager);
      const jobResult = await executor.execute(checkoutJob);

      res.json({ success: jobResult.success, jobResult });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // GET /api/jobs/history - Get job execution metrics & history
  router.get('/history', (_req: Request, res: Response) => {
    try {
      const history = executor.getHistory();
      res.json({ success: true, count: history.length, history });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}
