import * as fs from 'fs';
import * as path from 'path';
import { AdapterContext, PlanResult, RunSpec, TestFrameworkAdapter } from '../types';

export class PytestAdapter implements TestFrameworkAdapter {
  readonly id = 'pytest' as const;

  detect(repoPath: string): boolean {
    return (
      fs.existsSync(path.join(repoPath, 'pytest.ini')) ||
      fs.existsSync(path.join(repoPath, 'setup.py')) ||
      fs.existsSync(path.join(repoPath, 'requirements.txt'))
    );
  }

  depsMarkerPath(repoPath: string): string {
    return path.join(repoPath, '.venv');
  }

  defaultInstallSpec(repoPath: string): RunSpec {
    return { bin: 'pip', args: ['install', '-r', 'requirements.txt'], cwd: repoPath };
  }

  plan(ctx: AdapterContext): PlanResult {
    if (ctx.impactedTestFiles.length > 0) {
      return {
        spec: { bin: 'pytest', args: [...ctx.impactedTestFiles], cwd: ctx.repoPath },
        isDiffScoped: true,
      };
    }
    if (ctx.changedFiles.length > 0) {
      return {
        spec: null,
        isDiffScoped: true,
        bypassMessage: `No pre-existing Pytest test files found covering the modified files. Proceeding directly to Stage 2.`,
      };
    }
    return { spec: { bin: 'pytest', args: [], cwd: ctx.repoPath }, isDiffScoped: false };
  }
}
