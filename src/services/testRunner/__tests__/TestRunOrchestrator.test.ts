import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TestRunOrchestrator } from '../TestRunOrchestrator';
import { CommandExecutor } from '../CommandExecutor';
import { TestFrameworkAdapter, TestCommandExecution } from '../types';

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestrator-'));
  // Pre-create the deps marker so ensureDeps' initial install check is a no-op in tests that aren't
  // specifically exercising dependency installation - keeps executor.run() call counts predictable.
  fs.mkdirSync(path.join(dir, 'node_modules'));
  return dir;
}

function makeAdapter(overrides: Partial<TestFrameworkAdapter> = {}): TestFrameworkAdapter {
  return {
    id: 'jest',
    detect: () => true,
    depsMarkerPath: (repoPath) => path.join(repoPath, 'node_modules'),
    defaultInstallSpec: (repoPath) => ({ bin: 'npm', args: ['install'], cwd: repoPath }),
    plan: () => ({
      spec: { bin: 'npx', args: ['jest'], cwd: '/repo' },
      isDiffScoped: false,
    }),
    ...overrides,
  };
}

function exec(overrides: Partial<TestCommandExecution>): TestCommandExecution {
  return { command: 'npx jest', exitCode: 0, stdout: '', stderr: '', ...overrides };
}

describe('TestRunOrchestrator.run', () => {
  it('reports passed:false with no execution when no adapter detects the repo', async () => {
    const repo = makeRepo();
    const orchestrator = new TestRunOrchestrator(new CommandExecutor(), []); // empty registry -> no match
    const result = await orchestrator.run(repo);

    expect(result.runner).toBe('none');
    expect(result.passed).toBe(false);
    expect(result.testExecution).toBeUndefined();
    expect(result.statusMessage).toMatch(/No supported test framework/);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('bypasses without touching dependency installation when the adapter has nothing to run', async () => {
    const repo = makeRepo();
    const run = jest.fn();
    const executor = { run } as unknown as CommandExecutor;
    const adapter = makeAdapter({
      plan: () => ({ spec: null, isDiffScoped: true, bypassMessage: 'nothing to scope to' }),
    });
    const orchestrator = new TestRunOrchestrator(executor, [adapter]);

    const result = await orchestrator.run(repo, ['src/untested.ts']);

    expect(result.passed).toBe(true);
    expect(result.statusMessage).toBe('nothing to scope to');
    expect(run).not.toHaveBeenCalled();
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('reports passed:true on a clean run and echoes the executed command', async () => {
    const repo = makeRepo();
    const run = jest.fn().mockResolvedValue(exec({ exitCode: 0, stdout: 'ok', command: 'npx jest' }));
    const executor = { run } as unknown as CommandExecutor;
    const orchestrator = new TestRunOrchestrator(executor, [makeAdapter()]);

    const result = await orchestrator.run(repo);

    expect(result.passed).toBe(true);
    expect(result.testCommand).toBe('npx jest');
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('reports passed:false when the test command exits non-zero for a real failure', async () => {
    const repo = makeRepo();
    const run = jest.fn().mockResolvedValue(exec({ exitCode: 1, stderr: 'AssertionError: expected true to be false' }));
    const executor = { run } as unknown as CommandExecutor;
    const orchestrator = new TestRunOrchestrator(executor, [makeAdapter()]);

    const result = await orchestrator.run(repo);

    expect(result.passed).toBe(false);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('retries once after a missing-dependency failure, then reports the second attempt\'s result', async () => {
    const repo = makeRepo();
    const run = jest
      .fn()
      // first ensureDeps/tooling calls (none configured on this adapter -> not called)
      // first test attempt: fails with a missing-module signature
      .mockResolvedValueOnce(exec({ exitCode: 1, stderr: 'Error: Cannot find module \'ts-jest\'' }))
      // forced reinstall
      .mockResolvedValueOnce(exec({ command: 'npm install --no-save jest ts-jest', exitCode: 0 }))
      // second test attempt: succeeds
      .mockResolvedValueOnce(exec({ exitCode: 0, stdout: 'all good', command: 'npx jest' }));
    const executor = { run } as unknown as CommandExecutor;
    const adapter = makeAdapter({ toolingPackages: () => ['jest', 'ts-jest'] });
    const orchestrator = new TestRunOrchestrator(executor, [adapter]);

    const result = await orchestrator.run(repo);

    expect(run).toHaveBeenCalledTimes(3);
    expect(result.passed).toBe(true);
    expect(result.installExecution?.command).toBe('npm install --no-save jest ts-jest');
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('does not retry when the failure is a genuine assertion failure, not a missing dependency', async () => {
    const repo = makeRepo();
    const run = jest.fn().mockResolvedValue(exec({ exitCode: 1, stderr: 'expect(received).toBe(expected)' }));
    const executor = { run } as unknown as CommandExecutor;
    const orchestrator = new TestRunOrchestrator(executor, [makeAdapter()]);

    const result = await orchestrator.run(repo);

    expect(run).toHaveBeenCalledTimes(1);
    expect(result.passed).toBe(false);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('applies the adapter\'s postProcessStderr to the final test execution', async () => {
    const repo = makeRepo();
    const run = jest.fn().mockResolvedValue(exec({ exitCode: 1, stderr: 'NOISE\nreal error' }));
    const executor = { run } as unknown as CommandExecutor;
    const adapter = makeAdapter({
      postProcessStderr: (stderr) => stderr.split('\n').filter((l) => l !== 'NOISE').join('\n'),
    });
    const orchestrator = new TestRunOrchestrator(executor, [adapter]);

    const result = await orchestrator.run(repo);

    expect(result.testExecution?.stderr).toBe('real error');
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
