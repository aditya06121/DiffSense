import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AstContextService } from '../AstContextService';
import { AstParserEngine } from '../AstParserEngine';

function makeRepo(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ast-context-'));
  for (const [relPath, content] of Object.entries(files)) {
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

describe('AstContextService.analyzeChangedFiles caching', () => {
  it('does not re-parse the same file contents on a second call (cache hit)', async () => {
    const repo = makeRepo({
      'src/foo.ts': 'export function add(a: number, b: number): number { return a + b; }',
    });
    const parseSpy = jest.spyOn(AstParserEngine.prototype, 'parseFile');
    parseSpy.mockClear();

    const service = new AstContextService();
    const first = await service.analyzeChangedFiles(repo, ['src/foo.ts']);
    const callsAfterFirst = parseSpy.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // A second, independent AstContextService instance (as GeminiTestGeneratorService and
    // TestScenarioService each construct their own) must still hit the shared static cache.
    const service2 = new AstContextService();
    const second = await service2.analyzeChangedFiles(repo, ['src/foo.ts']);

    expect(parseSpy.mock.calls.length).toBe(callsAfterFirst); // no additional parse call
    expect(second).toEqual(first);

    parseSpy.mockRestore();
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('re-parses when the file content actually changes (cache miss)', async () => {
    const repo = makeRepo({
      'src/bar.ts': 'export function original(): void {}',
    });
    const parseSpy = jest.spyOn(AstParserEngine.prototype, 'parseFile');
    parseSpy.mockClear();

    const service = new AstContextService();
    await service.analyzeChangedFiles(repo, ['src/bar.ts']);
    const callsAfterFirst = parseSpy.mock.calls.length;

    fs.writeFileSync(path.join(repo, 'src/bar.ts'), 'export function changed(): void {}');
    await service.analyzeChangedFiles(repo, ['src/bar.ts']);

    expect(parseSpy.mock.calls.length).toBeGreaterThan(callsAfterFirst);

    parseSpy.mockRestore();
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
