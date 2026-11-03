import { Job } from './Job';
import { JobResult } from '../repository/types';
import { RepositoryManager } from '../repository/RepositoryManager';

export class CloneJob extends Job {
  private repoId: string;
  private sshUrl: string;
  private repositoryManager: RepositoryManager;

  constructor(repoId: string, sshUrl: string, repositoryManager: RepositoryManager) {
    super(`CloneJob:${repoId}`);
    this.repoId = repoId;
    this.sshUrl = sshUrl;
    this.repositoryManager = repositoryManager;
  }

  public async execute(): Promise<JobResult> {
    const startTime = Date.now();
    this.status = 'RUNNING';

    try {
      const gitResult = await this.repositoryManager.clone(this.repoId, this.sshUrl);
      const durationMs = Date.now() - startTime;
      this.status = 'SUCCESS';

      return {
        jobId: this.id,
        jobName: this.name,
        success: true,
        durationMs,
        metadata: {
          repoId: this.repoId,
          sshUrl: this.sshUrl,
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
          sshUrl: this.sshUrl,
        },
      };
    }
  }
}
