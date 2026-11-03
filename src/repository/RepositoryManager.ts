import * as fs from 'fs';
import * as path from 'path';
import { GitClient } from './GitClient';
import { WorkspaceManager } from './WorkspaceManager';
import { GitResult } from './types';
import { Logger } from '../core/Logger';

export interface BranchInfo {
  activeBranch: string;
  localBranches: string[];
  remoteBranches: string[];
}

export interface RepoStatusInfo {
  repoId: string;
  exists: boolean;
  activeBranch?: string;
  currentCommit?: string;
  statusOutput?: string;
}

export class RepositoryManager {
  private gitClient: GitClient;
  private workspaceManager: WorkspaceManager;
  private logger = Logger.getInstance();

  constructor(gitClient: GitClient, workspaceManager: WorkspaceManager) {
    this.gitClient = gitClient;
    this.workspaceManager = workspaceManager;
  }

  // Removes stale .git/index.lock if left behind by crashed or interrupted git processes
  private clearStaleGitLock(repoPath: string): void {
    try {
      const lockFile = path.join(repoPath, '.git', 'index.lock');
      if (fs.existsSync(lockFile)) {
        const stats = fs.statSync(lockFile);
        const ageMs = Date.now() - stats.mtimeMs;
        if (ageMs > 3000) {
          fs.unlinkSync(lockFile);
          this.logger.warn(`[RepositoryManager] Cleared stale .git/index.lock in ${repoPath} (age: ${Math.round(ageMs / 1000)}s)`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`[RepositoryManager] Could not inspect/clear .git/index.lock: ${err.message}`);
    }
  }

  public async clone(repoId: string, sshUrl: string): Promise<GitResult> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    
    // If valid git repository already exists, skip clone
    if (this.workspaceManager.repoExists(repoId)) {
      this.logger.info(`Repository '${repoId}' already exists at ${repoPath}. Skipping clone.`);
      return {
        command: 'git',
        args: ['clone', sshUrl, repoPath],
        stdout: 'Repository already exists',
        stderr: '',
        exitCode: 0,
        durationMs: 0,
      };
    }

    // If directory exists but is NOT a valid git repository (broken/interrupted clone), clean it up first to avoid git exit code 128
    if (fs.existsSync(repoPath)) {
      this.logger.warn(`Directory ${repoPath} exists but is not a valid Git repo. Removing invalid directory before cloning...`);
      fs.rmSync(repoPath, { recursive: true, force: true });
    }

    this.logger.info(`Cloning repository '${repoId}' from ${sshUrl}...`, { repoId, sshUrl, targetPath: repoPath });
    const result = await this.gitClient.execute(['clone', sshUrl, repoPath]);
    this.logger.info(`Successfully cloned repository '${repoId}'.`, { durationMs: result.durationMs });
    return result;
  }

  public async update(repoId: string, defaultBranch?: string): Promise<GitResult[]> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);

    if (!this.workspaceManager.repoExists(repoId)) {
      throw new Error(`Cannot update repository '${repoId}' because it is not cloned at ${repoPath}. Run clone first.`);
    }

    const results: GitResult[] = [];

    // 1. git fetch --all --prune
    this.logger.info(`Fetching remote updates for '${repoId}'...`);
    try {
      const fetchResult = await this.gitClient.execute(['fetch', '--all', '--prune'], repoPath);
      results.push(fetchResult);
    } catch (e: any) {
      this.logger.warn(`Fetch remote updates for '${repoId}' warning:`, { error: e.message });
    }

    // 2. Determine target branch to reset & checkout
    let targetBranch = defaultBranch;
    let originRefExists = false;

    if (targetBranch) {
      try {
        await this.gitClient.execute(['rev-parse', '--verify', `origin/${targetBranch}`], repoPath);
        originRefExists = true;
      } catch {
        this.logger.warn(`Specified branch 'origin/${targetBranch}' not found for '${repoId}'. Attempting automatic remote HEAD detection.`);
      }
    }

    // Auto-detect origin/HEAD if specified branch wasn't found or wasn't provided
    if (!originRefExists || !targetBranch) {
      try {
        const symRef = await this.gitClient.execute(['symbolic-ref', 'refs/remotes/origin/HEAD'], repoPath);
        const refStr = symRef.stdout.trim();
        if (refStr.startsWith('refs/remotes/origin/')) {
          targetBranch = refStr.replace('refs/remotes/origin/', '');
          originRefExists = true;
        }
      } catch {
        this.logger.warn(`Could not resolve refs/remotes/origin/HEAD for '${repoId}'.`);
      }
    }

    if (!targetBranch) {
      targetBranch = 'main';
    }

    this.logger.info(`Switching and updating repository '${repoId}' to branch '${targetBranch}'...`, { repoId, targetBranch });

    // 3. Checkout target branch explicitly
    if (originRefExists) {
      try {
        const checkoutResult = await this.gitClient.execute(['checkout', '-B', targetBranch, `origin/${targetBranch}`], repoPath);
        results.push(checkoutResult);
      } catch (e: any) {
        this.logger.warn(`checkout -B ${targetBranch} origin/${targetBranch} failed:`, { error: e.message });
      }
    }

    // 4. git reset --hard (origin/<targetBranch> or HEAD if originRefExists)
    if (originRefExists) {
      try {
        const resetResult = await this.gitClient.execute(['reset', '--hard', `origin/${targetBranch}`], repoPath);
        results.push(resetResult);
      } catch (e: any) {
        this.logger.warn(`reset --hard origin/${targetBranch} failed:`, { error: e.message });
      }
    }

    // 5. git clean -fd (excluding node_modules)
    try {
      const cleanResult = await this.gitClient.execute(['clean', '-fd', '-e', 'node_modules'], repoPath);
      results.push(cleanResult);
    } catch (e: any) {
      this.logger.warn(`clean -fd for ${repoId} warning:`, { error: e.message });
    }

    this.logger.info(`Successfully updated repository '${repoId}'.`, { repoId, targetBranch });
    return results;
  }

  public async checkoutBranch(repoId: string, branch: string): Promise<GitResult> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    this.clearStaleGitLock(repoPath);
    
    try {
      await this.gitClient.execute(['fetch', '--all', '--prune'], repoPath);
    } catch {}

    try {
      await this.gitClient.execute(['rev-parse', '--verify', `origin/${branch}`], repoPath);
      return await this.gitClient.execute(['-c', 'advice.detachedHead=false', 'checkout', '-B', branch, `origin/${branch}`], repoPath);
    } catch {
      return await this.gitClient.execute(['-c', 'advice.detachedHead=false', 'checkout', branch], repoPath);
    }
  }

  // Force-checks out an exact commit and clears untracked files (keeping node_modules), so the working
  // tree actually matches what's being tested — regardless of which branch happens to be on disk already.
  public async checkoutCommitClean(repoId: string, commitHash: string): Promise<void> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    this.clearStaleGitLock(repoPath);

    try {
      await this.gitClient.execute(['fetch', '--all', '--prune'], repoPath);
    } catch (e: any) {
      this.logger.warn(`Failed to fetch latest refs for '${repoId}' before checking out commit '${commitHash}':`, { error: e.message });
    }

    await this.gitClient.execute(['-c', 'advice.detachedHead=false', 'checkout', '-f', commitHash], repoPath);

    try {
      await this.gitClient.execute(['clean', '-fd', '-e', 'node_modules'], repoPath);
    } catch (e: any) {
      this.logger.warn(`Clean after checkout of '${commitHash}' in '${repoId}' warning:`, { error: e.message });
    }
  }

  // Switches to `<sourceBranch>-tests`, ensuring it is properly rooted on the commit being tested.
  // If the test branch already contains baseCommitSha, it preserves previous test commits.
  // If the test branch is behind or off an unrelated commit, it resets to baseCommitSha so source files exist.
  public async prepareTestBranch(
    repoId: string,
    testBranch: string,
    baseCommitSha?: string
  ): Promise<{ created: boolean }> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    this.clearStaleGitLock(repoPath);

    try {
      await this.gitClient.execute(['fetch', '--all', '--prune'], repoPath);
    } catch {}

    if (baseCommitSha) {
      let branchRefExists = false;
      let targetRef = testBranch;

      try {
        await this.gitClient.execute(['rev-parse', '--verify', testBranch], repoPath);
        branchRefExists = true;
      } catch {
        try {
          await this.gitClient.execute(['rev-parse', '--verify', `origin/${testBranch}`], repoPath);
          branchRefExists = true;
          targetRef = `origin/${testBranch}`;
        } catch {}
      }

      if (branchRefExists) {
        let isAncestor = false;
        try {
          await this.gitClient.execute(['merge-base', '--is-ancestor', baseCommitSha, targetRef], repoPath);
          isAncestor = true;
        } catch {}

        if (isAncestor) {
          await this.gitClient.execute(['-c', 'advice.detachedHead=false', 'checkout', '-B', testBranch, targetRef], repoPath);
          return { created: false };
        }
      }

      // Re-create / reset test branch to the exact commit being tested so all diff files exist on disk
      await this.gitClient.execute(['-c', 'advice.detachedHead=false', 'checkout', '-B', testBranch, baseCommitSha], repoPath);
      try {
        await this.gitClient.execute(['clean', '-fd', '-e', 'node_modules'], repoPath);
      } catch {}
      return { created: true };
    }

    let existsLocally = false;
    try {
      await this.gitClient.execute(['rev-parse', '--verify', testBranch], repoPath);
      existsLocally = true;
    } catch {}

    if (existsLocally) {
      await this.gitClient.execute(['-c', 'advice.detachedHead=false', 'checkout', testBranch], repoPath);
      return { created: false };
    }

    let existsRemotely = false;
    try {
      await this.gitClient.execute(['rev-parse', '--verify', `origin/${testBranch}`], repoPath);
      existsRemotely = true;
    } catch {}

    if (existsRemotely) {
      await this.gitClient.execute(['-c', 'advice.detachedHead=false', 'checkout', '-B', testBranch, `origin/${testBranch}`], repoPath);
      return { created: false };
    }

    await this.gitClient.execute(['-c', 'advice.detachedHead=false', 'checkout', '-b', testBranch], repoPath);
    return { created: true };
  }

  // Stages and commits all working tree changes on the currently checked-out branch. No-op if nothing changed.
  public async commitAll(repoId: string, message: string): Promise<{ committed: boolean }> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);

    await this.gitClient.execute(['add', '-A'], repoPath);

    const statusRes = await this.gitClient.execute(['status', '--porcelain'], repoPath);
    if (!statusRes.stdout.trim()) {
      return { committed: false };
    }

    await this.gitClient.execute(
      ['-c', 'user.name=AI Test Agent', '-c', 'user.email=ai-test-agent@automation-bit.local', 'commit', '-m', message],
      repoPath
    );
    return { committed: true };
  }

  public async pushBranch(repoId: string, branch: string, force: boolean = true): Promise<GitResult> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    const args = ['push', '-u', 'origin', branch];
    if (force) {
      args.push('--force');
    }
    return await this.gitClient.execute(args, repoPath);
  }

  public async currentCommit(repoId: string): Promise<string> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    try {
      const result = await this.gitClient.execute(['rev-parse', 'HEAD'], repoPath);
      return result.stdout.trim();
    } catch {
      return 'No commits (empty repository)';
    }
  }

  public async listBranches(repoId: string): Promise<BranchInfo> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    if (!this.workspaceManager.repoExists(repoId)) {
      throw new Error(`Repository '${repoId}' does not exist locally.`);
    }

    try {
      await this.gitClient.execute(['fetch', '--all', '--prune'], repoPath);
    } catch (e) {
      this.logger.warn(`Failed to fetch latest branches for ${repoId}:`, { error: e instanceof Error ? e.message : String(e) });
    }

    let activeBranch = '';
    try {
      const activeRes = await this.gitClient.execute(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
      activeBranch = activeRes.stdout.trim();
    } catch {
      activeBranch = 'main';
    }

    let branchResult: GitResult = { command: 'git', args: [], stdout: '', stderr: '', exitCode: 0, durationMs: 0 };
    try {
      branchResult = await this.gitClient.execute(['branch', '-a'], repoPath);
    } catch {}

    const lines = branchResult.stdout.split('\n').map((l) => l.trim()).filter(Boolean);

    const localBranches: string[] = [];
    const remoteBranches: string[] = [];

    for (const line of lines) {
      const cleanLine = line.replace(/^\*\s*/, '').trim();

      if (cleanLine.startsWith('remotes/origin/')) {
        const branchName = cleanLine.replace('remotes/origin/', '');
        if (branchName !== 'HEAD' && !branchName.includes('->')) {
          if (!remoteBranches.includes(branchName)) {
            remoteBranches.push(branchName);
          }
        }
      } else if (!cleanLine.includes('->')) {
        if (!localBranches.includes(cleanLine)) {
          localBranches.push(cleanLine);
        }
      }
    }

    return {
      activeBranch,
      localBranches,
      remoteBranches,
    };
  }

  public async getStatus(repoId: string): Promise<RepoStatusInfo> {
    const exists = this.workspaceManager.repoExists(repoId);
    if (!exists) {
      return { repoId, exists: false };
    }

    const repoPath = this.workspaceManager.getRepoPath(repoId);
    const commit = await this.currentCommit(repoId);
    
    let statusOutput = '';
    try {
      const statusRes = await this.gitClient.execute(['status', '--short'], repoPath);
      statusOutput = statusRes.stdout.trim();
    } catch {}
    
    let activeBranch = '';
    try {
      const branchRes = await this.gitClient.execute(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
      activeBranch = branchRes.stdout.trim();
    } catch {
      activeBranch = 'main';
    }

    return {
      repoId,
      exists: true,
      activeBranch,
      currentCommit: commit,
      statusOutput,
    };
  }
}
