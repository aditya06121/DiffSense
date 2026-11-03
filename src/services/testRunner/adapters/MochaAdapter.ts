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

export class MochaAdapter implements TestFrameworkAdapter {
  readonly id = 'mocha' as const;

  detect(repoPath: string): boolean {
    return Boolean(readAllDeps(repoPath)['mocha']);
  }

  depsMarkerPath(repoPath: string): string {
    return path.join(repoPath, 'node_modules');
  }

  defaultInstallSpec(repoPath: string): RunSpec {
    return { bin: 'npm', args: ['install', '--legacy-peer-deps', '--no-audit'], cwd: repoPath };
  }

  plan(ctx: AdapterContext): PlanResult {
    if (ctx.impactedTestFiles.length > 0) {
      // Relies on the repo's own .mocharc for require-hooks (ts-node/register, etc.) - same
      // "call the binary directly, trust existing config" pattern as the other adapters.
      return {
        spec: { bin: 'npx', args: ['mocha', ...ctx.impactedTestFiles], cwd: ctx.repoPath },
        isDiffScoped: true,
      };
    }
    if (ctx.changedFiles.length > 0) {
      return {
        spec: null,
        isDiffScoped: true,
        bypassMessage: `No pre-existing Mocha test files found covering the modified files (${ctx.changedFiles.join(', ')}). Unrelated legacy test suite bypassed. Proceeding directly to Stage 2 (AI Scenario Generation).`,
      };
    }
    return { spec: { bin: 'npx', args: ['mocha'], cwd: ctx.repoPath }, isDiffScoped: false };
  }
}
