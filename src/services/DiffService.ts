import { GitClient } from '../repository/GitClient';
import { WorkspaceManager } from '../repository/WorkspaceManager';

export interface DiffLine {
  type: 'ADDITION' | 'DELETION' | 'CONTEXT';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  type: 'ADDED' | 'DELETED' | 'MODIFIED' | 'RENAMED';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface MergeCommitDetails {
  commitSha: string;
  shortSha: string;
  parentSha: string;
  parents?: string[];
  authorName: string;
  authorEmail: string;
  timestamp: string;
  message: string;
  summary: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  };
  files: FileDiff[];
}

export interface BranchComparisonDetails {
  baseBranch: string;
  compareBranch: string;
  baseSha: string;
  baseShortSha: string;
  compareSha: string;
  compareShortSha: string;
  mergeBaseSha: string;
  aheadBy: number;
  behindBy: number;
  summary: {
    totalFiles: number;
    totalAdditions: number;
    totalDeletions: number;
  };
  files: FileDiff[];
}

export class DiffService {
  private gitClient: GitClient;
  private workspaceManager: WorkspaceManager;

  constructor(gitClient: GitClient, workspaceManager: WorkspaceManager) {
    this.gitClient = gitClient;
    this.workspaceManager = workspaceManager;
  }

  public async getMergeCommitDetails(repoId: string, commitSha: string): Promise<MergeCommitDetails> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    if (!this.workspaceManager.repoExists(repoId)) {
      throw new Error(`Repository '${repoId}' does not exist locally.`);
    }

    // 1. Fetch commit details
    const commitInfoArgs = ['log', '-1', '--format=%H|||%P|||%an|||%ae|||%at|||%B', commitSha];
    const commitInfoRes = await this.gitClient.execute(commitInfoArgs, repoPath);
    const parts = commitInfoRes.stdout.trim().split('|||');

    if (parts.length < 6) {
      throw new Error(`Commit '${commitSha}' not found in repository '${repoId}'.`);
    }

    const fullSha = parts[0].trim();
    const parents = parts[1].trim() ? parts[1].trim().split(/\s+/) : [];
    const authorName = parts[2].trim();
    const authorEmail = parts[3].trim();
    const timestampNum = parseInt(parts[4].trim(), 10);
    const message = parts[5].trim();

    const parentSha = parents.length > 0 ? parents[0] : null;
    const dateIso = !isNaN(timestampNum) ? new Date(timestampNum * 1000).toISOString() : new Date().toISOString();

    // 2. Fetch git diff between parent (first-parent) and target commit
    let diffRes;
    if (parentSha) {
      diffRes = await this.gitClient.execute(['diff', '--no-color', parentSha, fullSha], repoPath);
    } else {
      diffRes = await this.gitClient.execute(['show', '--patch', '--no-color', fullSha], repoPath);
    }

    // 3. Parse patch output into structured FileDiffs
    const files = this.parseGitPatch(diffRes.stdout);

    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const f of files) {
      totalAdditions += f.additions;
      totalDeletions += f.deletions;
    }

    return {
      commitSha: fullSha,
      shortSha: fullSha.substring(0, 7),
      parentSha: parentSha ? parentSha.substring(0, 7) : 'HEAD^1',
      parents,
      authorName,
      authorEmail,
      timestamp: dateIso,
      message,
      summary: {
        totalFiles: files.length,
        totalAdditions,
        totalDeletions,
      },
      files,
    };
  }

  public async getBranchComparisonDetails(
    repoId: string,
    baseBranch: string,
    compareBranch: string
  ): Promise<BranchComparisonDetails> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    if (!this.workspaceManager.repoExists(repoId)) {
      throw new Error(`Repository '${repoId}' does not exist locally.`);
    }

    try {
      await this.gitClient.execute(['fetch', '--all', '--prune'], repoPath);
    } catch {
      // Non-fatal: fall back to whatever refs are already available locally.
    }

    const baseRef = await this.resolveRef(repoPath, baseBranch);
    const compareRef = await this.resolveRef(repoPath, compareBranch);

    const baseShaRes = await this.gitClient.execute(['rev-parse', baseRef], repoPath);
    const compareShaRes = await this.gitClient.execute(['rev-parse', compareRef], repoPath);
    const baseSha = baseShaRes.stdout.trim();
    const compareSha = compareShaRes.stdout.trim();

    const mergeBaseRes = await this.gitClient.execute(['merge-base', baseRef, compareRef], repoPath);
    const mergeBaseSha = mergeBaseRes.stdout.trim();

    const countsRes = await this.gitClient.execute(
      ['rev-list', '--left-right', '--count', `${baseRef}...${compareRef}`],
      repoPath
    );
    const [behindStr, aheadStr] = countsRes.stdout.trim().split(/\s+/);
    const behindBy = parseInt(behindStr, 10) || 0;
    const aheadBy = parseInt(aheadStr, 10) || 0;

    // Diff the compare branch against the common ancestor (equivalent to `git diff base...compare`),
    // so the result only shows what compareBranch introduces relative to baseBranch.
    const diffRes = await this.gitClient.execute(['diff', '--no-color', mergeBaseSha, compareSha], repoPath);
    const files = this.parseGitPatch(diffRes.stdout);

    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const f of files) {
      totalAdditions += f.additions;
      totalDeletions += f.deletions;
    }

    return {
      baseBranch,
      compareBranch,
      baseSha,
      baseShortSha: baseSha.substring(0, 7),
      compareSha,
      compareShortSha: compareSha.substring(0, 7),
      mergeBaseSha: mergeBaseSha.substring(0, 7),
      aheadBy,
      behindBy,
      summary: {
        totalFiles: files.length,
        totalAdditions,
        totalDeletions,
      },
      files,
    };
  }

  private async resolveRef(repoPath: string, branch: string): Promise<string> {
    try {
      await this.gitClient.execute(['rev-parse', '--verify', `origin/${branch}`], repoPath);
      return `origin/${branch}`;
    } catch {
      return branch;
    }
  }

  private parseGitPatch(patchOutput: string): FileDiff[] {
    const files: FileDiff[] = [];
    
    // Strip any leading commit header lines up to first "diff --git "
    const patchIndex = patchOutput.indexOf('diff --git ');
    const cleanPatch = patchIndex !== -1 ? patchOutput.substring(patchIndex) : patchOutput;

    // Split by "diff --git "
    const rawDiffs = cleanPatch.split(/^diff --git /m).filter((d) => d.trim().length > 0);

    for (const rawDiff of rawDiffs) {
      const lines = rawDiff.split('\n');
      if (lines.length === 0) continue;

      const headerLine = lines[0]; // e.g. "a/public/sitemap.xml b/public/sitemap.xml"
      const pathMatch = headerLine.match(/^a\/(.*?)\s+b\/(.*)/);

      let oldPath = pathMatch ? pathMatch[1] : 'unknown';
      let newPath = pathMatch ? pathMatch[2] : 'unknown';
      let type: FileDiff['type'] = 'MODIFIED';

      let additions = 0;
      let deletions = 0;

      const hunks: DiffHunk[] = [];
      let currentHunk: DiffHunk | null = null;

      let oldLineNum = 0;
      let newLineNum = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('new file mode')) {
          type = 'ADDED';
        } else if (line.startsWith('deleted file mode')) {
          type = 'DELETED';
        } else if (line.startsWith('similarity index') || line.startsWith('rename from')) {
          type = 'RENAMED';
        } else if (line.startsWith('--- a/')) {
          oldPath = line.substring(6);
        } else if (line.startsWith('+++ b/')) {
          newPath = line.substring(6);
        } else if (line.startsWith('@@ ')) {
          // Hunk header e.g. "@@ -6,7 +6,7 @@"
          const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
          if (hunkMatch) {
            oldLineNum = parseInt(hunkMatch[1], 10);
            newLineNum = parseInt(hunkMatch[2], 10);
          }

          currentHunk = {
            header: line,
            lines: [],
          };
          hunks.push(currentHunk);
        } else if (currentHunk) {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++;
            currentHunk.lines.push({
              type: 'ADDITION',
              content: line.substring(1),
              newLineNumber: newLineNum++,
            });
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
            currentHunk.lines.push({
              type: 'DELETION',
              content: line.substring(1),
              oldLineNumber: oldLineNum++,
            });
          } else if (line.startsWith(' ') || line === '') {
            currentHunk.lines.push({
              type: 'CONTEXT',
              content: line.startsWith(' ') ? line.substring(1) : line,
              oldLineNumber: oldLineNum++,
              newLineNumber: newLineNum++,
            });
          }
        }
      }

      files.push({
        oldPath,
        newPath,
        type,
        additions,
        deletions,
        hunks,
      });
    }

    return files;
  }
}
