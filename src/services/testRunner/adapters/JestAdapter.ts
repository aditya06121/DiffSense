import * as fs from 'fs';
import * as path from 'path';
import { AdapterContext, PlanResult, RunSpec, TestFrameworkAdapter } from '../types';

const JEST_CONFIG_FILES = ['jest.config.js', 'jest.config.ts', 'jest.config.mjs', 'jest.config.cjs', 'jest.config.json'];

function readAllDeps(repoPath: string): Record<string, string> {
  try {
    const pkgPath = path.join(repoPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return {};
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  } catch {
    return {};
  }
}

function findJestConfigFile(repoPath: string): string | null {
  for (const f of JEST_CONFIG_FILES) {
    const p = path.join(repoPath, f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// True when the repo declares its own Jest transform/config, either via a jest.config.* file or a
// package.json#jest block. Used to decide whether it's safe to inject a default ts-jest transform -
// a repo with its own config already knows how it wants to be transformed (babel-jest, swc, next/jest,
// ts-jest with diagnostics on, ...), and overriding that produces results that diverge from what
// `npm test` actually does for that repo.
function hasExistingJestConfig(repoPath: string): boolean {
  if (findJestConfigFile(repoPath)) return true;
  try {
    const pkgPath = path.join(repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.jest) return true;
    }
  } catch {
    // Malformed package.json - fall through to "no config found"
  }
  return false;
}

function hasTsJestConfigured(repoPath: string): boolean {
  const configFile = findJestConfigFile(repoPath);
  if (!configFile) return false;
  try {
    return /ts-jest/i.test(fs.readFileSync(configFile, 'utf-8'));
  } catch {
    return false;
  }
}

export class JestAdapter implements TestFrameworkAdapter {
  readonly id = 'jest' as const;

  detect(repoPath: string): boolean {
    if (findJestConfigFile(repoPath)) return true;
    const allDeps = readAllDeps(repoPath);
    return Boolean(allDeps['jest'] || allDeps['ts-jest'] || allDeps['@types/jest']);
  }

  depsMarkerPath(repoPath: string): string {
    return path.join(repoPath, 'node_modules');
  }

  defaultInstallSpec(repoPath: string): RunSpec {
    return { bin: 'npm', args: ['install', '--legacy-peer-deps', '--no-audit'], cwd: repoPath };
  }

  toolingPackages(): string[] {
    return ['jest', 'ts-jest', '@types/jest'];
  }

  isToolingSatisfied(repoPath: string): boolean {
    const jestDir = path.join(repoPath, 'node_modules', 'jest');
    const tsJestDir = path.join(repoPath, 'node_modules', 'ts-jest');
    if (!fs.existsSync(jestDir)) return false;
    if (hasTsJestConfigured(repoPath) && !fs.existsSync(tsJestDir)) return false;
    return true;
  }

  plan(ctx: AdapterContext): PlanResult {
    const baseFlags = ['--passWithNoTests', '--forceExit', '--maxWorkers=50%'];
    const flags = hasExistingJestConfig(ctx.repoPath)
      ? baseFlags
      : [...baseFlags, '--transform', '{"^.+[.][jt]sx?$":["ts-jest",{"diagnostics":false}]}'];

    if (ctx.impactedTestFiles.length > 0) {
      // Run strictly the directly impacted test files to prevent transitive legacy test failures
      return {
        spec: { bin: 'npx', args: ['jest', ...ctx.impactedTestFiles, ...flags], cwd: ctx.repoPath },
        isDiffScoped: true,
      };
    }
    if (ctx.changedFiles.length > 0) {
      return {
        spec: null,
        isDiffScoped: true,
        bypassMessage: `No pre-existing Jest test files found covering the modified files (${ctx.changedFiles.join(', ')}). Unrelated legacy test suite bypassed. Proceeding directly to Stage 2 (AI Scenario Generation).`,
      };
    }
    return { spec: { bin: 'npx', args: ['jest', ...flags], cwd: ctx.repoPath }, isDiffScoped: false };
  }

  postProcessStderr(stderr: string): string {
    if (!stderr) return '';
    const lines = stderr.split('\n');
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/Force exiting Jest: Have you considered using/i.test(trimmed)) return false;
      if (/ts-jest\[ts-jest-transformer\] \(WARN\)/i.test(trimmed)) return false;
      if (/See more at https:\/\/kulshekhar\.github\.io/i.test(trimmed)) return false;
      if (/transform:\s*\{/i.test(trimmed)) return false;
      if (/<transform_regex>/i.test(trimmed)) return false;
      if (/^\},?$/i.test(trimmed)) return false;
      return true;
    });
    return filtered.join('\n').trim();
  }
}
