import { FlutterAdapter } from './adapters/FlutterAdapter';
import { DartAdapter } from './adapters/DartAdapter';
import { PytestAdapter } from './adapters/PytestAdapter';
import { VitestAdapter } from './adapters/VitestAdapter';
import { JestAdapter } from './adapters/JestAdapter';
import { MochaAdapter } from './adapters/MochaAdapter';
import { NpmGenericAdapter } from './adapters/NpmGenericAdapter';
import { TestFrameworkAdapter } from './types';

// Order encodes detection priority, same as the original if/else chain:
// Flutter/Dart (pubspec.yaml) -> Python (pytest markers) -> Node frameworks, most-specific first
// (Vitest/Jest/Mocha config or deps) -> generic npm "test" script as the last resort.
export function buildDefaultAdapterRegistry(): TestFrameworkAdapter[] {
  return [
    new FlutterAdapter(),
    new DartAdapter(),
    new PytestAdapter(),
    new VitestAdapter(),
    new JestAdapter(),
    new MochaAdapter(),
    new NpmGenericAdapter(),
  ];
}

export function detectAdapter(
  repoPath: string,
  registry: TestFrameworkAdapter[] = buildDefaultAdapterRegistry()
): TestFrameworkAdapter | null {
  for (const adapter of registry) {
    if (adapter.detect(repoPath)) return adapter;
  }
  return null;
}
