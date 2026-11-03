import * as fs from 'fs';
import * as path from 'path';
import { AdapterContext, PlanResult, RunSpec, TestFrameworkAdapter } from '../types';

// Fallback for Node repos with a "test" script but no recognized framework config (jest/vitest/mocha).
// The underlying runner is unknown, so file paths can only be forwarded on a best-effort basis via
// `npm test --` (the common convention for runners invoked through an npm script). Bypass behavior is
// still applied for parity with the other adapters, so an unrelated legacy suite doesn't run on every
// diff just because scoping the actual invocation can't be guaranteed here.
export class NpmGenericAdapter implements TestFrameworkAdapter {
  readonly id = 'npm' as const;

  detect(repoPath: string): boolean {
    try {
      const pkgPath = path.join(repoPath, 'package.json');
      if (!fs.existsSync(pkgPath)) return false;
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const scripts = pkg.scripts || {};
      return Boolean(scripts['test:unit'] || scripts['test:ci'] || scripts['test']);
    } catch {
      return false;
    }
  }

  depsMarkerPath(repoPath: string): string {
    return path.join(repoPath, 'node_modules');
  }

  defaultInstallSpec(repoPath: string): RunSpec {
    return { bin: 'npm', args: ['install', '--legacy-peer-deps', '--no-audit'], cwd: repoPath };
  }

  plan(ctx: AdapterContext): PlanResult {
    if (ctx.impactedTestFiles.length > 0) {
      return {
        spec: { bin: 'npm', args: ['test', '--', ...ctx.impactedTestFiles], cwd: ctx.repoPath },
        isDiffScoped: true,
      };
    }
    if (ctx.changedFiles.length > 0) {
      return {
        spec: null,
        isDiffScoped: true,
        bypassMessage: `No pre-existing test files found covering the modified files (${ctx.changedFiles.join(', ')}). Unrelated legacy test suite bypassed. Proceeding directly to Stage 2 (AI Scenario Generation).`,
      };
    }
    return { spec: { bin: 'npm', args: ['test'], cwd: ctx.repoPath }, isDiffScoped: false };
  }
}
