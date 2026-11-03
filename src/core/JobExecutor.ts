import { Job } from '../jobs/Job';
import { JobResult } from '../repository/types';
import { Logger } from './Logger';

export class JobExecutor {
  private logger = Logger.getInstance();
  private history: JobResult[] = [];
  private activeRepos: Set<string> = new Set();

  public async execute(job: Job): Promise<JobResult> {
    // Extract target repoId if job pertains to a specific repo
    const repoIdMatch = job.id.match(/:(.+?)-\d+$/) || job.name.match(/:(.+)$/);
    const repoId = repoIdMatch ? repoIdMatch[1] : undefined;

    if (repoId) {
      if (this.activeRepos.has(repoId)) {
        this.logger.warn(`Job for repository '${repoId}' is already in progress. Skipping duplicate concurrent job '${job.id}'.`);
        const skippedResult: JobResult = {
          jobId: job.id,
          jobName: job.name,
          success: true,
          durationMs: 0,
          metadata: { repoId, skipped: true, reason: 'Duplicate concurrent job skipped' },
        };
        return skippedResult;
      }
      this.activeRepos.add(repoId);
    }

    this.logger.info(`Starting Job: ${job.name}`, { jobId: job.id });

    try {
      const result = await job.execute();
      this.history.push(result);

      if (result.success) {
        this.logger.info(`Job Succeeded: ${job.name}`, {
          jobId: job.id,
          duration: `${(result.durationMs / 1000).toFixed(2)}s`,
          metadata: result.metadata,
        });
      } else {
        this.logger.error(`Job Failed: ${job.name}`, result.error, {
          jobId: job.id,
          duration: `${(result.durationMs / 1000).toFixed(2)}s`,
          metadata: result.metadata,
        });
      }

      return result;
    } catch (err: any) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      const fallbackResult: JobResult = {
        jobId: job.id,
        jobName: job.name,
        success: false,
        durationMs: 0,
        error: errorObj,
      };
      this.history.push(fallbackResult);
      this.logger.error(`Job Execution Exception: ${job.name}`, errorObj, { jobId: job.id });
      return fallbackResult;
    } finally {
      if (repoId) {
        this.activeRepos.delete(repoId);
      }
    }
  }

  // Lets non-Job operations (e.g. AI test generation, which reads/checks out a repo's working tree
  // directly) claim the same per-repo lock Jobs use, so the periodic sync automatically skips a repo
  // that's mid-use instead of racing to reset it underneath an in-progress operation.
  public acquireRepoLock(repoId: string): boolean {
    if (this.activeRepos.has(repoId)) {
      return false;
    }
    this.activeRepos.add(repoId);
    return true;
  }

  public releaseRepoLock(repoId: string): void {
    this.activeRepos.delete(repoId);
  }

  public async withRepoLock<T>(repoId: string, fn: () => Promise<T>): Promise<T> {
    if (!this.acquireRepoLock(repoId)) {
      throw new Error(`Repository '${repoId}' is currently busy with another sync or test operation — please try again in a moment.`);
    }
    try {
      return await fn();
    } finally {
      this.releaseRepoLock(repoId);
    }
  }

  public getActiveRepos(): string[] {
    return Array.from(this.activeRepos);
  }

  public isRepoActive(repoId: string): boolean {
    return this.activeRepos.has(repoId);
  }

  public getHistory(): JobResult[] {
    return [...this.history];
  }
}
