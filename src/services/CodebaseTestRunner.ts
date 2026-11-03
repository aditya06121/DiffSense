import { TestRunOrchestrator } from './testRunner/TestRunOrchestrator';
import { findImpactedTestFiles } from './testRunner/ImpactedTestFileFinder';
import { CodebaseTestRunResult, DetectedFramework, TestCommandExecution } from './testRunner/types';

export type { CodebaseTestRunResult, DetectedFramework, TestCommandExecution };

// Thin, stable facade over the adapter-based test-running pipeline in ./testRunner. Kept as its own
// class (rather than exporting TestRunOrchestrator directly) so the public surface GeminiTestGeneratorService
// depends on never has to change even as the internals evolve.
export class CodebaseTestRunner {
  private orchestrator = new TestRunOrchestrator();

  public findImpactedTestFiles(repoPath: string, changedFiles: string[]): string[] {
    return findImpactedTestFiles(repoPath, changedFiles);
  }

  public async run(repoPath: string, changedFiles?: string[]): Promise<CodebaseTestRunResult> {
    return this.orchestrator.run(repoPath, changedFiles);
  }
}
