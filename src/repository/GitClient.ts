import { spawn } from 'child_process';
import * as path from 'path';
import { GitError, GitResult } from './types';
import { Logger } from '../core/Logger';

export interface GitClientOptions {
  sshKeyPath?: string;
  strictHostKeyChecking?: string;
}

export class GitClient {
  private logger = Logger.getInstance();
  private sshKeyPath?: string;
  private strictHostKeyChecking: string;

  constructor(options?: GitClientOptions) {
    this.sshKeyPath = options?.sshKeyPath ? path.resolve(options.sshKeyPath) : undefined;
    this.strictHostKeyChecking = options?.strictHostKeyChecking || 'accept-new';
  }

  public async execute(args: string[], workingDir?: string): Promise<GitResult> {
    const startTime = Date.now();
    const command = 'git';

    // Ensure --progress flag is passed for clone and fetch commands for real-time progress logging
    const finalArgs = [...args];
    if (finalArgs[0] === 'clone' && !finalArgs.includes('--progress')) {
      finalArgs.splice(1, 0, '--progress');
    } else if (finalArgs[0] === 'fetch' && !finalArgs.includes('--progress')) {
      finalArgs.splice(1, 0, '--progress');
    }

    const env = { ...process.env };
    
    // Build custom SSH command with absolute key path
    let sshCmd = `ssh -o StrictHostKeyChecking=${this.strictHostKeyChecking}`;
    if (this.sshKeyPath) {
      sshCmd += ` -i "${this.sshKeyPath}"`;
    }
    env.GIT_SSH_COMMAND = sshCmd;

    const targetLabel = workingDir ? path.basename(workingDir) : 'git';
    this.logger.info(`Executing: git ${finalArgs.join(' ')}`, { workingDir, sshCmd });

    return new Promise<GitResult>((resolve, reject) => {
      const child = spawn(command, finalArgs, {
        cwd: workingDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        const line = str.trim();
        if (line) {
          this.logger.info(`[git:${targetLabel}] ${line}`);
        }
      });

      child.stderr.on('data', (data) => {
        const str = data.toString();
        stderr += str;
        const line = str.trim();
        if (line) {
          // Real-time progress streaming to engine logs
          this.logger.info(`[git:${targetLabel}] ${line}`);
        }
      });

      child.on('error', (err) => {
        const durationMs = Date.now() - startTime;
        const result: GitResult = {
          command,
          args: finalArgs,
          stdout,
          stderr: err.message,
          exitCode: -1,
          durationMs,
        };
        reject(new GitError(`Failed to spawn git process: ${err.message}`, result, workingDir));
      });

      child.on('close', (code) => {
        const durationMs = Date.now() - startTime;
        const exitCode = code ?? 0;
        const result: GitResult = {
          command,
          args: finalArgs,
          stdout,
          stderr,
          exitCode,
          durationMs,
        };

        if (exitCode !== 0) {
          reject(new GitError(`Git command failed with exit code ${exitCode}`, result, workingDir));
        } else {
          resolve(result);
        }
      });
    });
  }
}
