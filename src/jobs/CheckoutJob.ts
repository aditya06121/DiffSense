import { Job } from './Job';
import { JobResult } from '../repository/types';
import { RepositoryManager } from '../repository/RepositoryManager';
import { WorkspaceManager } from '../repository/WorkspaceManager';

export class CheckoutJob extends Job {
  private repoId: string;
  private targetRef: string;
  private repositoryManager: RepositoryManager;
  private workspaceManager: WorkspaceManager;

  constructor(
    repoId: string,
    targetRef: string,
    repositoryManager: RepositoryManager,
    workspaceManager: WorkspaceManager
  ) {
    super(`CheckoutJob:${repoId}:${targetRef}`);
    this.repoId = repoId;
    this.targetRef = targetRef;
    this.repositoryManager = repositoryManager;
    this.workspaceManager = workspaceManager;
  }

  public async execute(): Promise<JobResult> {
    const startTime = Date.now();
    this.status = 'RUNNING';

    try {
      if (!this.workspaceManager.repoExists(this.repoId)) {
        throw new Error(`Repository '${this.repoId}' does not exist locally. Run a clone or sync job first.`);
      }

      // Checkout the specified branch/commit
      const gitResult = await this.repositoryManager.checkoutBranch(this.repoId, this.targetRef);
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
          targetRef: this.targetRef,
          commitHash,
          stdout: gitResult.stdout,
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
          targetRef: this.targetRef,
        },
      };
    }
  }
}
