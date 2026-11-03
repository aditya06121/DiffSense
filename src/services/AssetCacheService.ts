import * as fs from 'fs';
import * as path from 'path';
import { GitClient } from '../repository/GitClient';
import { WorkspaceManager } from '../repository/WorkspaceManager';
import { RepositoryManager } from '../repository/RepositoryManager';
import { Logger } from '../core/Logger';

export interface PrMetadata {
  prKey: string;
  prNumber: string | null;
  sourceBranch: string;
  testBranch: string;
}

export class AssetCacheService {
  private gitClient: GitClient;
  private workspaceManager: WorkspaceManager;
  private repositoryManager: RepositoryManager;
  private logger = Logger.getInstance();

  constructor(
    gitClient: GitClient,
    workspaceManager: WorkspaceManager,
    repositoryManager: RepositoryManager
  ) {
    this.gitClient = gitClient;
    this.workspaceManager = workspaceManager;
    this.repositoryManager = repositoryManager;
  }

  /**
   * Validates if a commit qualifies as a First-Parent PR Merge commit.
   */
  public isFirstParentMerge(parents?: string[], isMerge?: boolean): boolean {
    return (parents && parents.length > 1) || isMerge === true;
  }

  /**
   * Extracts PR number and source branch from commit message to form non-conflicting keys.
   */
  public parsePrMetadata(commitMessage: string, shortSha: string, explicitSourceBranch?: string): PrMetadata {
    const firstLine = commitMessage.split('\n')[0] || '';

    // 1. Extract PR number
    let prNumber: string | null = null;
    const prMatch = commitMessage.match(/(?:pull request|merge request|PR)\s*#?(\d+)/i) ||
                    commitMessage.match(/\(pull request #(\d+)\)/i);
    if (prMatch) {
      prNumber = prMatch[1];
    }

    // 2. Extract source branch
    let sourceBranch = explicitSourceBranch || '';
    if (!sourceBranch) {
      const sourceMatch = firstLine.match(/Merged in ([^\s(]+)/i) ||
                          firstLine.match(/Merge pull request #\d+ from ([^\s/]+(?:\/[^\s]+)?)/i) ||
                          firstLine.match(/Merge branch '([^']+)'/i);
      if (sourceMatch) {
        sourceBranch = sourceMatch[1];
      }
    }

    if (!sourceBranch) {
      sourceBranch = 'release-patch';
    }

    const prKey = prNumber ? `pr-${prNumber}` : `commit-${shortSha}`;
    const testBranch = `${sourceBranch}-tests`;

    return {
      prKey,
      prNumber,
      sourceBranch,
      testBranch,
    };
  }

  /**
   * Builds the standardized asset path within the repository:
   * e.g. "automation-assets/pr-2482-prd.json"
   */
  public getAssetPath(prKey: string, assetType: 'prd' | 'existing-tests' | 'ai-tests' | 'scenarios'): string {
    return `automation-assets/${prKey}-${assetType}.json`;
  }

  /**
   * Reads a cached asset directly from Git tree storage on the test branch via `git show <ref>:<path>`.
   * Fast (< 50ms) and does not require checking out or dirtying the working directory.
   */
  public async getCachedAsset<T>(
    repoId: string,
    testBranch: string,
    assetPath: string
  ): Promise<T | null> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    if (!this.workspaceManager.repoExists(repoId)) {
      return null;
    }

    const candidateRefs = [testBranch, `origin/${testBranch}`];

    for (const ref of candidateRefs) {
      try {
        const res = await this.gitClient.execute(['show', `${ref}:${assetPath}`], repoPath);
        if (res && res.stdout && res.stdout.trim().startsWith('{')) {
          this.logger.info(`[AssetCacheService] Cache HIT for '${assetPath}' on '${ref}' in '${repoId}'.`);
          const parsed = JSON.parse(res.stdout);
          return {
            ...parsed,
            fromCache: true,
            cachedOnBranch: ref,
            cachePath: assetPath,
          } as T;
        }
      } catch {
        // Ref or file does not exist on this ref, try next
      }
    }

    return null;
  }

  /**
   * Saves and commits the asset to the dedicated test branch under automation-assets/
   */
  public async saveAndCommitAsset<T>(
    repoId: string,
    testBranch: string,
    baseCommitSha: string,
    assetPath: string,
    data: T,
    commitMessage: string,
    additionalMarkdown?: { filename: string; content: string }
  ): Promise<{ committed: boolean; pushed: boolean }> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    if (!this.workspaceManager.repoExists(repoId)) {
      throw new Error(`Repository '${repoId}' does not exist locally.`);
    }

    this.logger.info(`[AssetCacheService] Persisting asset '${assetPath}' to '${testBranch}' for '${repoId}'...`);

    // 1. Prepare and switch to the test branch rooted on the commit being tested
    await this.repositoryManager.prepareTestBranch(repoId, testBranch, baseCommitSha);

    // 2. Ensure destination directory exists on disk
    const fullAssetPath = path.join(repoPath, assetPath);
    const assetDir = path.dirname(fullAssetPath);
    if (!fs.existsSync(assetDir)) {
      fs.mkdirSync(assetDir, { recursive: true });
    }

    // 3. Write JSON payload
    fs.writeFileSync(fullAssetPath, JSON.stringify(data, null, 2), 'utf-8');

    // 4. Optionally write human-readable Markdown (e.g. pr-2482-prd.md)
    if (additionalMarkdown) {
      const fullMdPath = path.join(repoPath, additionalMarkdown.filename);
      const mdDir = path.dirname(fullMdPath);
      if (!fs.existsSync(mdDir)) {
        fs.mkdirSync(mdDir, { recursive: true });
      }
      fs.writeFileSync(fullMdPath, additionalMarkdown.content, 'utf-8');
    }

    // 5. Stage files
    await this.gitClient.execute(['add', 'automation-assets'], repoPath);

    // 6. Commit
    const { committed } = await this.repositoryManager.commitAll(repoId, commitMessage);

    // 7. Push branch if remote exists
    let pushed = false;
    if (committed) {
      try {
        await this.repositoryManager.pushBranch(repoId, testBranch);
        pushed = true;
      } catch (e: any) {
        this.logger.warn(`[AssetCacheService] Note: Could not push '${testBranch}' to remote: ${e.message}`);
      }
    }

    return { committed, pushed };
  }
}
