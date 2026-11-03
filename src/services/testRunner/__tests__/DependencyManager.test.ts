import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DependencyManager } from '../DependencyManager';
import { CommandExecutor } from '../CommandExecutor';
import { TestFrameworkAdapter } from '../types';

function makeRepo(files: Record<string, string> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-manager-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

function fakeExecutor() {
  return { run: jest.fn().mockResolvedValue({ command: 'fake', exitCode: 0, stdout: '', stderr: '' }) } as unknown as CommandExecutor;
}

function makeAdapter(overrides: Partial<TestFrameworkAdapter> = {}): TestFrameworkAdapter {
  return {
    id: 'jest',
    detect: () => true,
    depsMarkerPath: (repoPath) => path.join(repoPath, 'node_modules'),
    defaultInstallSpec: (repoPath) => ({ bin: 'npm', args: ['install'], cwd: repoPath }),
    plan: () => ({ spec: null, isDiffScoped: false }),
    ...overrides,
  };
}

describe('DependencyManager.ensureDeps', () => {
  it('skips install when the deps marker exists and no manifest file changed', async () => {
    const repo = makeRepo({ 'node_modules/.keep': '' });
    const executor = fakeExecutor();
    const manager = new DependencyManager(executor);
    const result = await manager.ensureDeps(makeAdapter(), repo, ['src/foo.ts'], 60000);
    expect(result).toBeUndefined();
    expect(executor.run).not.toHaveBeenCalled();
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('installs when the deps marker is missing', async () => {
    const repo = makeRepo();
    const executor = fakeExecutor();
    const manager = new DependencyManager(executor);
    const result = await manager.ensureDeps(makeAdapter(), repo, [], 60000);
    expect(result).toBeDefined();
    expect(executor.run).toHaveBeenCalledTimes(1);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('reinstalls even when the marker exists, if a manifest file changed', async () => {
    const repo = makeRepo({ 'node_modules/.keep': '' });
    const executor = fakeExecutor();
    const manager = new DependencyManager(executor);
    const result = await manager.ensureDeps(makeAdapter(), repo, ['package-lock.json'], 60000);
    expect(result).toBeDefined();
    expect(executor.run).toHaveBeenCalledTimes(1);
    fs.rmSync(repo, { recursive: true, force: true });
  });
});

describe('DependencyManager.ensureToolingProactively', () => {
  it('does nothing for an adapter with no tooling requirements', async () => {
    const repo = makeRepo();
    const executor = fakeExecutor();
    const manager = new DependencyManager(executor);
    const result = await manager.ensureToolingProactively(makeAdapter(), repo, 60000);
    expect(result).toBeUndefined();
    expect(executor.run).not.toHaveBeenCalled();
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('installs tooling packages when isToolingSatisfied reports false', async () => {
    const repo = makeRepo();
    const executor = fakeExecutor();
    const manager = new DependencyManager(executor);
    const adapter = makeAdapter({
      toolingPackages: () => ['jest', 'ts-jest'],
      isToolingSatisfied: () => false,
    });
    const result = await manager.ensureToolingProactively(adapter, repo, 60000);
    expect(result).toBeDefined();
    expect(executor.run).toHaveBeenCalledWith(
      expect.objectContaining({ args: expect.arrayContaining(['jest', 'ts-jest']) }),
      60000
    );
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('skips install when isToolingSatisfied reports true', async () => {
    const repo = makeRepo();
    const executor = fakeExecutor();
    const manager = new DependencyManager(executor);
    const adapter = makeAdapter({
      toolingPackages: () => ['jest'],
      isToolingSatisfied: () => true,
    });
    const result = await manager.ensureToolingProactively(adapter, repo, 60000);
    expect(result).toBeUndefined();
    expect(executor.run).not.toHaveBeenCalled();
    fs.rmSync(repo, { recursive: true, force: true });
  });
});

describe('DependencyManager.forceReinstall', () => {
  it('reinstalls tooling packages unconditionally when the adapter defines them', async () => {
    const repo = makeRepo();
    const executor = fakeExecutor();
    const manager = new DependencyManager(executor);
    const adapter = makeAdapter({
      toolingPackages: () => ['vitest'],
      isToolingSatisfied: () => true, // even "satisfied" - retry doesn't consult this
    });
    await manager.forceReinstall(adapter, repo, 60000);
    expect(executor.run).toHaveBeenCalledWith(
      expect.objectContaining({ args: expect.arrayContaining(['vitest']) }),
      60000
    );
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('falls back to the default install spec when the adapter has no tooling packages', async () => {
    const repo = makeRepo();
    const executor = fakeExecutor();
    const manager = new DependencyManager(executor);
    await manager.forceReinstall(makeAdapter(), repo, 60000);
    expect(executor.run).toHaveBeenCalledWith(expect.objectContaining({ bin: 'npm', args: ['install'] }), 60000);
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
