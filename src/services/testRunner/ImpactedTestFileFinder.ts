import * as fs from 'fs';
import * as path from 'path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', 'vendor']);

const GENERIC_BASENAMES = new Set([
  'index', 'main', 'app', 'util', 'utils', 'helper', 'helpers',
  'types', 'type', 'config', 'constant', 'constants', 'common',
  'interface', 'interfaces', 'model', 'models', 'service', 'controller',
]);

const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Locates all test files in the repository (bounded walk, ignores common build/vendor dirs).
export function listAllRepoTestFiles(repoPath: string): string[] {
  const results: string[] = [];
  let count = 0;

  const walk = (relDir: string) => {
    if (count >= 5000) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(repoPath, relDir), { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (count >= 5000) return;
      count++;
      const relPath = path.join(relDir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(relPath);
      } else if (
        /\.(test|spec)\.[jt]sx?$/.test(entry.name) ||
        /_test\.dart$/.test(entry.name) ||
        /^test_.*\.py$/.test(entry.name)
      ) {
        results.push(relPath);
      }
    }
  };

  walk('.');
  return results;
}

// Resolves only the test files impacted by the changed files in the commit
export function findImpactedTestFiles(repoPath: string, changedFiles: string[]): string[] {
  if (!changedFiles || changedFiles.length === 0) return [];

  const allTestFiles = listAllRepoTestFiles(repoPath);
  const impactedTests = new Set<string>();

  for (const changed of changedFiles) {
    // If the changed file is itself a test file, include it directly
    if (
      /\.(test|spec)\.[jt]sx?$/.test(changed) ||
      /_test\.dart$/.test(changed) ||
      /^test_.*\.py$/.test(path.basename(changed))
    ) {
      if (fs.existsSync(path.join(repoPath, changed))) {
        impactedTests.add(changed);
      }
      continue;
    }

    // If it's a source file, find corresponding test files matching its basename
    const baseName = path.basename(changed, path.extname(changed)).toLowerCase();
    if (!baseName) continue;

    const isGeneric = GENERIC_BASENAMES.has(baseName);
    const escapedBase = escapeRegex(baseName);

    // Patterns:
    // JS/TS: baseName.test.ts, baseName.spec.ts, or baseName.subfeature.test.ts
    const jsTsPattern = isGeneric
      ? new RegExp(`^${escapedBase}\\.(test|spec)\\.[jt]sx?$`, 'i')
      : new RegExp(`^${escapedBase}(\\.[a-zA-Z0-9_-]+)?\\.(test|spec)\\.[jt]sx?$`, 'i');

    // Dart: baseName_test.dart or baseName_subfeature_test.dart
    const dartPattern = isGeneric
      ? new RegExp(`^${escapedBase}_test\\.dart$`, 'i')
      : new RegExp(`^${escapedBase}(_[a-zA-Z0-9_-]+)?_test\\.dart$`, 'i');

    // Python: test_baseName.py or test_baseName_subfeature.py
    const pyPattern = isGeneric
      ? new RegExp(`^test_${escapedBase}\\.py$`, 'i')
      : new RegExp(`^test_${escapedBase}(_[a-zA-Z0-9_-]+)?\\.py$`, 'i');

    for (const testFile of allTestFiles) {
      const testFileName = path.basename(testFile);
      if (jsTsPattern.test(testFileName) || dartPattern.test(testFileName) || pyPattern.test(testFileName)) {
        // If generic (e.g. index.test.ts), ensure it is in a related directory to prevent cross-suite contamination
        if (isGeneric) {
          const changedDir = path.dirname(changed);
          const testDir = path.dirname(testFile);
          if (testDir.includes(changedDir) || changedDir.includes(testDir)) {
            impactedTests.add(testFile);
          }
        } else {
          impactedTests.add(testFile);
        }
      }
    }
  }

  return Array.from(impactedTests);
}
