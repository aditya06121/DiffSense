import * as fs from 'fs';
import * as path from 'path';

export class WorkspaceManager {
  private baseDir: string;
  private reposDir: string;
  private logsDir: string;
  private reportsDir: string;
  private artifactsDir: string;
  private tempDir: string;
  private keysDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    this.reposDir = path.join(this.baseDir, 'repos');
    this.logsDir = path.join(this.baseDir, 'logs');
    this.reportsDir = path.join(this.baseDir, 'reports');
    this.artifactsDir = path.join(this.baseDir, 'artifacts');
    this.tempDir = path.join(this.baseDir, 'temp');
    this.keysDir = path.join(this.baseDir, 'keys');
  }

  public prepareWorkspace(): void {
    const directories = [
      this.baseDir,
      this.reposDir,
      this.logsDir,
      this.reportsDir,
      this.artifactsDir,
      this.tempDir,
      this.keysDir,
    ];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  public getRepoPath(repoId: string): string {
    return path.join(this.reposDir, repoId);
  }

  public repoExists(repoId: string): boolean {
    const repoPath = this.getRepoPath(repoId);
    if (!fs.existsSync(repoPath)) {
      return false;
    }
    const gitDir = path.join(repoPath, '.git');
    return fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory();
  }

  public getLogsDir(): string {
    return this.logsDir;
  }

  public getReportsDir(): string {
    return this.reportsDir;
  }

  public getArtifactsDir(): string {
    return this.artifactsDir;
  }

  public getTempDir(): string {
    return this.tempDir;
  }

  public getReposDir(): string {
    return this.reposDir;
  }

  public getKeysDir(): string {
    return this.keysDir;
  }
}
