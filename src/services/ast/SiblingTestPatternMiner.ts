import * as path from 'path';
import * as fs from 'fs';
import { SiblingTestPattern } from './types';
import { Logger } from '../../core/Logger';

export class SiblingTestPatternMiner {
  private logger = Logger.getInstance();
  private readonly IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', 'vendor']);

  public async minePatterns(repoPath: string, targetMockTargets: string[]): Promise<SiblingTestPattern[]> {
    const testFiles = this.findTestFiles(repoPath);
    const patterns: SiblingTestPattern[] = [];

    for (const file of testFiles.slice(0, 10)) {
      const fullPath = path.join(repoPath, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const pattern = this.analyzeTestFile(file, content, targetMockTargets);
        if (pattern) {
          patterns.push(pattern);
        }
      } catch (err: any) {
        this.logger.warn(`[SiblingTestPatternMiner] Failed to read ${file}: ${err.message}`);
      }
    }

    return patterns;
  }

  private findTestFiles(repoPath: string): string[] {
    const results: string[] = [];
    let scanned = 0;

    const walk = (relDir: string) => {
      if (scanned >= 5000) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(path.join(repoPath, relDir), { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (scanned >= 5000) return;
        scanned++;
        const relPath = path.join(relDir, entry.name);

        if (entry.isDirectory()) {
          if (this.IGNORED_DIRS.has(entry.name)) continue;
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

  private analyzeTestFile(
    testFilePath: string,
    content: string,
    targetMockTargets: string[]
  ): SiblingTestPattern | null {
    let framework: 'vitest' | 'jest' | 'mocha' | 'pytest' | 'flutter' | 'unknown' = 'unknown';

    if (content.includes('from \'vitest\'') || content.includes('from "vitest"')) {
      framework = 'vitest';
    } else if (content.includes('@jest/globals') || content.includes('jest.mock') || content.includes('jest.fn')) {
      framework = 'jest';
    } else if (content.includes('flutter_test') || content.includes('package:flutter_test')) {
      framework = 'flutter';
    } else if (content.includes('pytest') || content.includes('unittest.mock')) {
      framework = 'pytest';
    } else if (content.includes('mocha') || content.includes('chai')) {
      framework = 'mocha';
    }

    // Check if test globals (describe, it, expect) are imported explicitly
    const usesGlobals = !/(?:import|require).*['"](vitest|@jest\/globals|mocha|chai)['"]/.test(content) &&
      /(?:describe|test|it)\s*\(/.test(content);

    const mockSnippets: string[] = [];
    const fixtureSnippets: string[] = [];

    // Extract mock statements: vi.mock(...), jest.mock(...), vi.fn(), jest.fn(), Mockito
    const lines = content.split('\n');
    let capturingMock = false;
    let currentMockBlock: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      if (
        trimmed.startsWith('vi.mock(') ||
        trimmed.startsWith('jest.mock(') ||
        trimmed.startsWith('jest.spyOn(') ||
        trimmed.startsWith('vi.spyOn(') ||
        trimmed.startsWith('@patch(') ||
        trimmed.startsWith('class Mock')
      ) {
        capturingMock = true;
        currentMockBlock = [line];
        if (trimmed.endsWith(');') || trimmed.endsWith('})') || trimmed.endsWith(');')) {
          mockSnippets.push(currentMockBlock.join('\n'));
          capturingMock = false;
          currentMockBlock = [];
        }
      } else if (capturingMock) {
        currentMockBlock.push(line);
        if (trimmed.endsWith(');') || trimmed.endsWith('});') || currentMockBlock.length > 20) {
          mockSnippets.push(currentMockBlock.join('\n'));
          capturingMock = false;
          currentMockBlock = [];
        }
      }

      // Extract fixture / mock factories
      if (
        /const\s+mock\w+\s*=\s*\{/.test(trimmed) ||
        /function\s+createMock\w+/.test(trimmed) ||
        /const\s+fake\w+\s*=\s*\{/.test(trimmed)
      ) {
        fixtureSnippets.push(trimmed);
      }
    }

    // Filter relevant mocks (prioritizing target mock targets) or keep high-value ones
    const prioritizedMocks = targetMockTargets && targetMockTargets.length > 0
      ? [
          ...mockSnippets.filter((m) => targetMockTargets.some((t) => m.toLowerCase().includes(t.toLowerCase()))),
          ...mockSnippets.filter((m) => !targetMockTargets.some((t) => m.toLowerCase().includes(t.toLowerCase()))),
        ]
      : mockSnippets;
    const relevantMocks = prioritizedMocks.slice(0, 3);
    const relevantFixtures = fixtureSnippets.slice(0, 3);

    if (relevantMocks.length === 0 && relevantFixtures.length === 0 && framework === 'unknown') {
      return null;
    }

    return {
      testFilePath,
      framework,
      usesGlobals,
      mockSnippets: relevantMocks,
      fixtureSnippets: relevantFixtures,
    };
  }
}
