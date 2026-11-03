export interface RepositoryConfig {
  ssh: string;
  defaultBranch?: string;
}

export interface RepositoriesConfigMap {
  repositories: Record<string, RepositoryConfig>;
}

export interface EngineConfig {
  workspaceDir: string;
  configPath: string;
  sshKeyPath?: string;
  strictHostKeyChecking?: string;
  geminiApiKey?: string;
  aiModel?: string;
  maxAgentIterations?: number;
  agentCommandTimeoutMs?: number;
  repositories: Record<string, RepositoryConfig>;
}

export interface GitResult {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export class GitError extends Error {
  public readonly command: string;
  public readonly args: string[];
  public readonly exitCode: number;
  public readonly stderr: string;
  public readonly stdout: string;
  public readonly repositoryPath?: string;

  constructor(message: string, result: GitResult, repositoryPath?: string) {
    super(message);
    this.name = 'GitError';
    this.command = result.command;
    this.args = result.args;
    this.exitCode = result.exitCode;
    this.stderr = result.stderr;
    this.stdout = result.stdout;
    this.repositoryPath = repositoryPath;
  }
}

export type JobStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface JobResult {
  jobId: string;
  jobName: string;
  success: boolean;
  durationMs: number;
  error?: Error;
  metadata?: Record<string, any>;
}
