import * as fs from 'fs';
import * as path from 'path';
import { AdapterContext, PlanResult, RunSpec, TestFrameworkAdapter } from '../types';

function hasFlutterMarkers(content: string): boolean {
  return /sdk:\s*flutter/i.test(content) || /flutter:/i.test(content);
}

// Placed after FlutterAdapter in the registry: a pubspec.yaml with no Flutter markers is a plain Dart
// package. If the pubspec is unreadable, FlutterAdapter already claims that case (matching the prior
// fallback-to-flutter behavior), so this adapter treats an unreadable pubspec as "not mine".
export class DartAdapter implements TestFrameworkAdapter {
  readonly id = 'dart' as const;

  detect(repoPath: string): boolean {
    const pubspecPath = path.join(repoPath, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return false;
    try {
      return !hasFlutterMarkers(fs.readFileSync(pubspecPath, 'utf-8'));
    } catch {
      return false;
    }
  }

  depsMarkerPath(repoPath: string): string {
    return path.join(repoPath, '.dart_tool');
  }

  defaultInstallSpec(repoPath: string): RunSpec {
    return { bin: 'dart', args: ['pub', 'get'], cwd: repoPath };
  }

  plan(ctx: AdapterContext): PlanResult {
    if (ctx.impactedTestFiles.length > 0) {
      return {
        spec: { bin: 'dart', args: ['test', ...ctx.impactedTestFiles], cwd: ctx.repoPath },
        isDiffScoped: true,
      };
    }
    if (ctx.changedFiles.length > 0) {
      return {
        spec: null,
        isDiffScoped: true,
        bypassMessage: `No pre-existing Dart test files found covering the modified files. Proceeding directly to Stage 2.`,
      };
    }
    return { spec: { bin: 'dart', args: ['test'], cwd: ctx.repoPath }, isDiffScoped: false };
  }
}
