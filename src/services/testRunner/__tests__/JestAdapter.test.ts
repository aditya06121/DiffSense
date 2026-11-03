import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JestAdapter } from '../adapters/JestAdapter';

function makeRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-adapter-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

describe('JestAdapter.plan', () => {
  const adapter = new JestAdapter();

  it('scopes to impacted files and does NOT force a ts-jest transform when the repo has its own jest.config', () => {
    const repo = makeRepo({ 'jest.config.js': 'module.exports = { preset: "ts-jest" };' });
    const result = adapter.plan({
      repoPath: repo,
      changedFiles: ['src/foo.ts'],
      impactedTestFiles: ['src/foo.test.ts'],
    });
    expect(result.isDiffScoped).toBe(true);
    expect(result.spec?.bin).toBe('npx');
    expect(result.spec?.args).toEqual([
      'jest',
      'src/foo.test.ts',
      '--passWithNoTests',
      '--forceExit',
      '--maxWorkers=50%',
    ]);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('forces a ts-jest transform only when the repo has no jest config of its own', () => {
    const repo = makeRepo({});
    const result = adapter.plan({ repoPath: repo, changedFiles: [], impactedTestFiles: [] });
    expect(result.spec?.args).toContain('--transform');
    expect(result.spec?.args).toContain('{"^.+[.][jt]sx?$":["ts-jest",{"diagnostics":false}]}');
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('bypasses with a status message when changed files exist but none match a pre-existing test', () => {
    const repo = makeRepo({ 'jest.config.js': 'module.exports = {};' });
    const result = adapter.plan({
      repoPath: repo,
      changedFiles: ['src/untested.ts'],
      impactedTestFiles: [],
    });
    expect(result.spec).toBeNull();
    expect(result.isDiffScoped).toBe(true);
    expect(result.bypassMessage).toMatch(/No pre-existing Jest test files/);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('runs the full suite (not diff-scoped) when there are no changed files at all', () => {
    const repo = makeRepo({ 'jest.config.js': 'module.exports = {};' });
    const result = adapter.plan({ repoPath: repo, changedFiles: [], impactedTestFiles: [] });
    expect(result.isDiffScoped).toBe(false);
    expect(result.spec?.args).not.toContain('--transform');
    fs.rmSync(repo, { recursive: true, force: true });
  });
});

describe('JestAdapter.isToolingSatisfied', () => {
  const adapter = new JestAdapter();

  it('is false when jest is not installed', () => {
    const repo = makeRepo({});
    expect(adapter.isToolingSatisfied(repo)).toBe(false);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('is false when the repo configures ts-jest but ts-jest is not installed', () => {
    const repo = makeRepo({
      'jest.config.js': 'module.exports = { preset: "ts-jest" };',
      'node_modules/jest/package.json': '{}',
    });
    expect(adapter.isToolingSatisfied(repo)).toBe(false);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('is true when jest and the configured ts-jest are both installed', () => {
    const repo = makeRepo({
      'jest.config.js': 'module.exports = { preset: "ts-jest" };',
      'node_modules/jest/package.json': '{}',
      'node_modules/ts-jest/package.json': '{}',
    });
    expect(adapter.isToolingSatisfied(repo)).toBe(true);
    fs.rmSync(repo, { recursive: true, force: true });
  });
});

describe('JestAdapter.postProcessStderr', () => {
  const adapter = new JestAdapter();

  it('strips known Jest/ts-jest noise but keeps real error lines', () => {
    const stderr = [
      'Force exiting Jest: Have you considered using --detectOpenHandles?',
      'ts-jest[ts-jest-transformer] (WARN) some warning',
      'TypeError: real failure happened here',
    ].join('\n');
    expect(adapter.postProcessStderr!(stderr)).toBe('TypeError: real failure happened here');
  });

  it('returns an empty string for empty input', () => {
    expect(adapter.postProcessStderr!('')).toBe('');
  });
});
