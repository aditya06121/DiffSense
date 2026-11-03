import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findImpactedTestFiles, listAllRepoTestFiles } from '../ImpactedTestFileFinder';

function makeRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impacted-test-finder-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

describe('listAllRepoTestFiles', () => {
  it('finds JS/TS, Dart and Python test files and ignores build/vendor dirs', () => {
    const repo = makeRepo({
      'src/foo.test.ts': '',
      'src/bar.spec.tsx': '',
      'lib/widget_test.dart': '',
      'app/test_thing.py': '',
      'node_modules/pkg/index.test.ts': '',
      'dist/compiled.test.js': '',
    });

    const found = listAllRepoTestFiles(repo).sort();
    expect(found).toEqual(
      [
        path.join('app', 'test_thing.py'),
        path.join('lib', 'widget_test.dart'),
        path.join('src', 'bar.spec.tsx'),
        path.join('src', 'foo.test.ts'),
      ].sort()
    );

    fs.rmSync(repo, { recursive: true, force: true });
  });
});

describe('findImpactedTestFiles', () => {
  it('returns empty when there are no changed files', () => {
    const repo = makeRepo({});
    expect(findImpactedTestFiles(repo, [])).toEqual([]);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('includes a changed test file directly', () => {
    const repo = makeRepo({ 'src/foo.test.ts': '' });
    expect(findImpactedTestFiles(repo, ['src/foo.test.ts'])).toEqual(['src/foo.test.ts']);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('matches a non-generic source file to its co-located test by basename', () => {
    const repo = makeRepo({
      'src/widgets/Button.tsx': '',
      'src/widgets/Button.test.tsx': '',
    });
    const impacted = findImpactedTestFiles(repo, ['src/widgets/Button.tsx']);
    expect(impacted).toEqual([path.join('src', 'widgets', 'Button.test.tsx')]);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('does not cross-match unrelated basenames (e.g. foo.ts vs foobar.test.ts)', () => {
    const repo = makeRepo({
      'src/foo.ts': '',
      'src/foobar.test.ts': '',
    });
    expect(findImpactedTestFiles(repo, ['src/foo.ts'])).toEqual([]);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('restricts a generic basename (e.g. index.ts) to test files in a related directory', () => {
    const repo = makeRepo({
      'src/moduleA/index.ts': '',
      'src/moduleA/index.test.ts': '',
      'src/moduleB/index.test.ts': '',
    });
    const impacted = findImpactedTestFiles(repo, ['src/moduleA/index.ts']).sort();
    expect(impacted).toEqual([path.join('src', 'moduleA', 'index.test.ts')]);
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('matches Dart and Python naming conventions', () => {
    const repo = makeRepo({
      'lib/widget.dart': '',
      'lib/widget_test.dart': '',
      'app/thing.py': '',
      'app/test_thing.py': '',
    });
    const impacted = findImpactedTestFiles(repo, ['lib/widget.dart', 'app/thing.py']).sort();
    expect(impacted).toEqual(
      [path.join('app', 'test_thing.py'), path.join('lib', 'widget_test.dart')].sort()
    );
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('skips a changed test file that no longer exists on disk', () => {
    const repo = makeRepo({});
    expect(findImpactedTestFiles(repo, ['src/deleted.test.ts'])).toEqual([]);
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
