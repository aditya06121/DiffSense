import { execFile } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../../core/Logger';
import { buildExecutionEnv } from './EnvBuilder';
import { RunSpec, TestCommandExecution } from './types';

const execFileAsync = promisify(execFile);

const ANSI_REGEX =
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export function stripAnsi(text: string): string {
  return text ? text.replace(ANSI_REGEX, '') : '';
}

// Purely cosmetic - renders a RunSpec as a human-readable string for logs/UI. Never used for execution:
// execFile always receives bin/args as a real argv array, so there is no shell to interpret this string
// and nothing a malicious file path could inject into.
function displayQuote(arg: string): string {
  if (/^[A-Za-z0-9_\-.\/=:]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function renderCommand(spec: RunSpec): string {
  return [spec.bin, ...spec.args.map(displayQuote)].join(' ');
}

// The single place that spawns a process for the test runner. execFile (not exec) means bin/args are
// handed straight to the OS - no shell parses them, so file paths containing shell metacharacters can
// never be interpreted as anything but literal argv entries.
export class CommandExecutor {
  private logger = Logger.getInstance();

  public async run(spec: RunSpec, defaultTimeoutMs: number): Promise<TestCommandExecution> {
    const command = renderCommand(spec);
    const timeoutMs = spec.timeoutMs ?? defaultTimeoutMs;
    // Default to the built test env (NODE_ENV=test, CI=true, .env.test/.env.example merged in) rather
    // than raw process.env, so every command run through this executor gets a consistent, deterministic
    // environment regardless of which adapter or install step built the RunSpec.
    const env = spec.env ?? buildExecutionEnv(spec.cwd);

    this.logger.info(`[CommandExecutor] Executing: "${command}" inside ${spec.cwd}`);

    try {
      const { stdout, stderr } = await execFileAsync(spec.bin, spec.args, {
        cwd: spec.cwd,
        timeout: timeoutMs,
        maxBuffer: 20 * 1024 * 1024,
        env,
      });
      return {
        command,
        exitCode: 0,
        stdout: stripAnsi(stdout.trim()),
        stderr: stripAnsi(stderr.trim()),
      };
    } catch (err: any) {
      const stdout = err.stdout ? stripAnsi(String(err.stdout).trim()) : '';
      const stderr = err.stderr ? stripAnsi(String(err.stderr).trim()) : err.message || '';
      const exitCode = typeof err.code === 'number' ? err.code : 1;
      return { command, exitCode, stdout, stderr };
    }
  }
}
