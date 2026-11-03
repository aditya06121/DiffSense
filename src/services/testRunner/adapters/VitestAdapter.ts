import * as fs from 'fs';
import * as path from 'path';
import { AdapterContext, PlanResult, RunSpec, TestFrameworkAdapter } from '../types';

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

export class VitestAdapter implements TestFrameworkAdapter {
  readonly id = 'vitest' as const;

  detect(repoPath: string): boolean {
    if (
      fs.existsSync(path.join(repoPath, 'vitest.config.ts')) ||
      fs.existsSync(path.join(repoPath, 'vitest.config.js'))
    ) {
      return true;
    }
    return Boolean(readAllDeps(repoPath)['vitest']);
  }

  depsMarkerPath(repoPath: string): string {
    return path.join(repoPath, 'node_modules');
  }

  defaultInstallSpec(repoPath: string): RunSpec {
    return { bin: 'npm', args: ['install', '--legacy-peer-deps', '--no-audit'], cwd: repoPath };
  }

  toolingPackages(): string[] {
    return ['vitest'];
  }

  isToolingSatisfied(repoPath: string): boolean {
    return fs.existsSync(path.join(repoPath, 'node_modules', 'vitest'));
  }

  plan(ctx: AdapterContext): PlanResult {
    if (ctx.impactedTestFiles.length > 0) {
      return {
        spec: { bin: 'npx', args: ['vitest', 'run', ...ctx.impactedTestFiles], cwd: ctx.repoPath },
        isDiffScoped: true,
      };
    }
    if (ctx.changedFiles.length > 0) {
      return {
        spec: null,
        isDiffScoped: true,
        bypassMessage: `No pre-existing Vitest test files found covering the modified files. Proceeding directly to Stage 2.`,
      };
    }
    return { spec: { bin: 'npx', args: ['vitest', 'run'], cwd: ctx.repoPath }, isDiffScoped: false };
  }
}
