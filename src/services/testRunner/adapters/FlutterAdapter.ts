import * as fs from 'fs';
import * as path from 'path';
import { AdapterContext, PlanResult, RunSpec, TestFrameworkAdapter } from '../types';

function hasFlutterMarkers(content: string): boolean {
  return /sdk:\s*flutter/i.test(content) || /flutter:/i.test(content);
}

export class FlutterAdapter implements TestFrameworkAdapter {
  readonly id = 'flutter' as const;

  detect(repoPath: string): boolean {
    const pubspecPath = path.join(repoPath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return false;
    try {
      return hasFlutterMarkers(fs.readFileSync(pubspecPath, 'utf-8'));
    } catch {
      // Unreadable pubspec.yaml - default to flutter, matching the prior fallback behavior.
      return true;
    }
  }

  depsMarkerPath(repoPath: string): string {
    return path.join(repoPath, '.dart_tool');
  }

  defaultInstallSpec(repoPath: string): RunSpec {
    return { bin: 'flutter', args: ['pub', 'get'], cwd: repoPath };
  }

  plan(ctx: AdapterContext): PlanResult {
    if (ctx.impactedTestFiles.length > 0) {
      return {
        spec: { bin: 'flutter', args: ['test', ...ctx.impactedTestFiles, '--no-pub', '--reporter', 'expanded'], cwd: ctx.repoPath },
        isDiffScoped: true,
      };
    }
    if (ctx.changedFiles.length > 0) {
      return {
        spec: null,
        isDiffScoped: true,
        bypassMessage: `No pre-existing Flutter test files found covering the modified files (${ctx.changedFiles.join(', ')}). Unrelated legacy test suite bypassed. Proceeding directly to Stage 2 (AI Scenario Generation).`,
      };
    }
    return {
      spec: { bin: 'flutter', args: ['test', '--no-pub', '--reporter', 'expanded'], cwd: ctx.repoPath },
      isDiffScoped: false,
    };
  }
}
