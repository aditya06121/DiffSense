import { GitClient } from '../repository/GitClient';
import { WorkspaceManager } from '../repository/WorkspaceManager';

export interface CommitInfo {
  sha: string;
  shortSha: string;
  parents: string[];
  isMerge: boolean;
  authorName: string;
  authorEmail: string;
  timestamp: string;
  date: string;
  message: string;
}

export interface PaginatedCommits {
  commits: CommitInfo[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export class CommitService {
  private gitClient: GitClient;
  private workspaceManager: WorkspaceManager;

  constructor(gitClient: GitClient, workspaceManager: WorkspaceManager) {
    this.gitClient = gitClient;
    this.workspaceManager = workspaceManager;
  }

  public async getCommitHistory(
    repoId: string,
    branch?: string,
    page: number = 1,
    limit: number = 30
  ): Promise<PaginatedCommits> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    if (!this.workspaceManager.repoExists(repoId)) {
      throw new Error(`Repository '${repoId}' does not exist locally.`);
    }

    const targetBranch = branch || 'HEAD';
    const offset = (page - 1) * limit;

    // We request (limit + 1) commits to determine if hasMore is true
    const fetchLimit = limit + 1;

    // Use delimiter for git log formatting: %H (sha), %P (parents), %an (author name), %ae (author email), %at (unix timestamp), %s (subject)
    const DELIMITER = '---COMMIT-SEP---';
    const FIELD_SEP = '|||FIELD|||';

    const formatStr = `${DELIMITER}%H${FIELD_SEP}%P${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%at${FIELD_SEP}%s`;

    const args = [
      'log',
      `--format=${formatStr}`,
      `-n`,
      String(fetchLimit),
      `--skip=${offset}`,
      targetBranch,
    ];

    try {
      const gitResult = await this.gitClient.execute(args, repoPath);
      const rawBlocks = gitResult.stdout.split(DELIMITER).filter((b) => b.trim().length > 0);

      const commits: CommitInfo[] = [];

      for (const block of rawBlocks) {
        const fields = block.trim().split(FIELD_SEP);
        if (fields.length < 6) continue;

        const sha = fields[0].trim();
        const parents = fields[1].trim() ? fields[1].trim().split(/\s+/) : [];
        const authorName = fields[2].trim();
        const authorEmail = fields[3].trim();
        const timestampNum = parseInt(fields[4].trim(), 10);
        const message = fields[5].trim();

        const dateIso = !isNaN(timestampNum) ? new Date(timestampNum * 1000).toISOString() : new Date().toISOString();
        const isMerge = parents.length > 1;

        commits.push({
          sha,
          shortSha: sha.substring(0, 7),
          parents,
          isMerge,
          authorName,
          authorEmail,
          timestamp: dateIso,
          date: new Date(dateIso).toLocaleString(),
          message,
        });
      }

      const hasMore = commits.length > limit;
      const resultCommits = hasMore ? commits.slice(0, limit) : commits;

      return {
        commits: resultCommits,
        page,
        limit,
        hasMore,
      };
    } catch (err: any) {
      throw new Error(`Failed to fetch commit history for ${repoId} on branch '${targetBranch}': ${err.message}`);
    }
  }
}
