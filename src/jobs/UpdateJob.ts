import { Job } from './Job';
import { JobResult } from '../repository/types';
import { RepositoryManager } from '../repository/RepositoryManager';
import { WorkspaceManager } from '../repository/WorkspaceManager';
import { CloneJob } from './CloneJob';

export class UpdateJob extends Job {
  private repoId: string;
  private sshUrl: string;
  private defaultBranch: string;
  private repositoryManager: RepositoryManager;
  private workspaceManager: WorkspaceManager;

  constructor(
    repoId: string,
    sshUrl: string,
    defaultBranch: string,
    repositoryManager: RepositoryManager,
    workspaceManager: WorkspaceManager
  ) {
    super(`UpdateJob:${repoId}`);
    this.repoId = repoId;
    this.sshUrl = sshUrl;
    this.defaultBranch = defaultBranch || 'main';
    this.repositoryManager = repositoryManager;
    this.workspaceManager = workspaceManager;
  }

  public async execute(): Promise<JobResult> {
    const startTime = Date.now();
    this.status = 'RUNNING';

    try {
      // 1. Ensure repository exists. If missing, clone it first.
      if (!this.workspaceManager.repoExists(this.repoId)) {
        const cloneJob = new CloneJob(this.repoId, this.sshUrl, this.repositoryManager);
        const cloneResult = await cloneJob.execute();

        if (!cloneResult.success) {
          throw cloneResult.error || new Error(`Clone step failed for repository '${this.repoId}'.`);
        }
      }

      // 2. Perform update (fetch, reset --hard origin/<branch>, clean -fdx)
      const updateResults = await this.repositoryManager.update(this.repoId, this.defaultBranch);
      const commitHash = await this.repositoryManager.currentCommit(this.repoId);
      const durationMs = Date.now() - startTime;
      this.status = 'SUCCESS';

      return {
        jobId: this.id,
        jobName: this.name,
        success: true,
        durationMs,
        metadata: {
          repoId: this.repoId,
          defaultBranch: this.defaultBranch,
          commitHash,
          operationsCount: updateResults.length,
        },
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      this.status = 'FAILED';

      return {
        jobId: this.id,
        jobName: this.name,
        success: false,
        durationMs,
        error: err instanceof Error ? err : new Error(String(err)),
        metadata: {
          repoId: this.repoId,
          defaultBranch: this.defaultBranch,
        },
      };
    }
  }
}
