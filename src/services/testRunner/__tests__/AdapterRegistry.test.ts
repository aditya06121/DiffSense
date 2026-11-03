import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildDefaultAdapterRegistry, detectAdapter } from '../AdapterRegistry';

function makeRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adapter-registry-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

describe('detectAdapter', () => {
  const registry = buildDefaultAdapterRegistry();

  it('returns null for a repo with no recognizable test setup', () => {
    const repo = makeRepo({ 'README.md': 'hello' });
    expect(detectAdapter(repo, registry)).toBeNull();
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('detects Flutter from a pubspec.yaml with a flutter sdk marker', () => {
    const repo = makeRepo({ 'pubspec.yaml': 'environment:\n  sdk: flutter\n' });
    expect(detectAdapter(repo, registry)?.id).toBe('flutter');
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('detects Dart from a pubspec.yaml with no flutter marker', () => {
    const repo = makeRepo({ 'pubspec.yaml': 'name: my_dart_pkg\n' });
    expect(detectAdapter(repo, registry)?.id).toBe('dart');
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('detects Pytest from a requirements.txt', () => {
    const repo = makeRepo({ 'requirements.txt': 'pytest\n' });
    expect(detectAdapter(repo, registry)?.id).toBe('pytest');
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('detects Vitest before Jest when both are present (registry order = priority)', () => {
    const repo = makeRepo({
      'vitest.config.ts': 'export default {}',
      'jest.config.js': 'module.exports = {}',
    });
    expect(detectAdapter(repo, registry)?.id).toBe('vitest');
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('detects Jest from a jest.config.js', () => {
    const repo = makeRepo({ 'jest.config.js': 'module.exports = {}' });
    expect(detectAdapter(repo, registry)?.id).toBe('jest');
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('detects Mocha from a package.json dependency when no jest/vitest config exists', () => {
    const repo = makeRepo({
      'package.json': JSON.stringify({ devDependencies: { mocha: '^10.0.0' } }),
    });
    expect(detectAdapter(repo, registry)?.id).toBe('mocha');
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('falls back to the generic npm adapter when only a "test" script exists', () => {
    const repo = makeRepo({
      'package.json': JSON.stringify({ scripts: { test: 'some-custom-runner' } }),
    });
    expect(detectAdapter(repo, registry)?.id).toBe('npm');
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
