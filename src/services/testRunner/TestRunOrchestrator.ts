import { ConfigLoader } from '../../core/Config';
import { Logger } from '../../core/Logger';
import { CommandExecutor } from './CommandExecutor';
import { DependencyManager } from './DependencyManager';
import { buildDefaultAdapterRegistry, detectAdapter } from './AdapterRegistry';
import { findImpactedTestFiles } from './ImpactedTestFileFinder';
import { CodebaseTestRunResult, TestFrameworkAdapter } from './types';

const MISSING_DEPENDENCY_PATTERN =
  /cannot find module|command not found|is not recognized as an internal or external command|MODULE_NOT_FOUND|no such file or directory|preset .* not found/i;

// Files that never carry test-relevant signal but still show up in a diff (docs, lockfiles) - excluded
// from impact-matching, but NOT from manifest-change detection (a changed package-lock.json must still
// trigger a dependency reinstall even though it can't itself be "impacted" by a test file).
const NOISE_FILE_PATTERN = /\.md$|package-lock\.json|pubspec\.lock/i;

// Orchestrates the pipeline: detect adapter -> plan the (possibly diff-scoped) run -> ensure deps ->
// execute -> retry once on a missing-dependency signal -> normalize into CodebaseTestRunResult. Every
// framework-specific decision lives in its adapter; this class only sequences the steps every framework
// shares, so a new adapter can't silently skip diff-scoping or the bypass behavior the way mocha/npm did
// under the old single-method implementation.
export class TestRunOrchestrator {
  private logger = Logger.getInstance();
  private executor: CommandExecutor;
  private depManager: DependencyManager;
  private registry: TestFrameworkAdapter[];

  constructor(
    executor: CommandExecutor = new CommandExecutor(),
    registry: TestFrameworkAdapter[] = buildDefaultAdapterRegistry()
  ) {
    this.executor = executor;
    this.depManager = new DependencyManager(executor);
    this.registry = registry;
  }

  public async run(repoPath: string, changedFiles?: string[]): Promise<CodebaseTestRunResult> {
    const config = ConfigLoader.getInstance().getConfig();
    const testTimeoutMs = config.agentCommandTimeoutMs || 60000;
    const installTimeoutMs = Math.max(testTimeoutMs, 5 * 60 * 1000);

    const adapter = detectAdapter(repoPath, this.registry);
    if (!adapter) {
      return {
        runner: 'none',
        testCommand: null,
        passed: false,
        isDiffScoped: false,
        statusMessage: 'No supported test framework or test script was detected in this repository.',
      };
    }

    const rawChangedFiles = changedFiles || [];
    const validChangedFiles = rawChangedFiles.filter((f) => !NOISE_FILE_PATTERN.test(f));
    const impactedTestFiles = findImpactedTestFiles(repoPath, validChangedFiles);

    const { spec, isDiffScoped, bypassMessage } = adapter.plan({
      repoPath,
      changedFiles: validChangedFiles,
      impactedTestFiles,
    });

    if (!spec) {
      return {
        runner: adapter.id,
        testCommand: null,
        impactedTestFiles: [],
        passed: true,
        isDiffScoped,
        statusMessage: bypassMessage,
      };
    }

    // Manifest-change detection intentionally uses the raw (unfiltered) changed files - a changed
    // package-lock.json is noise for impact-matching but must still trigger a reinstall.
    let installExecution = await this.depManager.ensureDeps(adapter, repoPath, rawChangedFiles, installTimeoutMs);
    const toolingInstall = await this.depManager.ensureToolingProactively(adapter, repoPath, installTimeoutMs);
    if (toolingInstall) installExecution = toolingInstall;

    let testExecution = await this.executor.run(spec, testTimeoutMs);

    if (
      testExecution.exitCode !== 0 &&
      MISSING_DEPENDENCY_PATTERN.test(`${testExecution.stdout}\n${testExecution.stderr}`)
    ) {
      this.logger.warn(
        `[TestRunOrchestrator] Dependency or test runner preset missing after test run for ${adapter.id}. Retrying with runner install and test execution...`
      );
      const retryInstall = await this.depManager.forceReinstall(adapter, repoPath, installTimeoutMs);
      if (retryInstall) installExecution = retryInstall;
      testExecution = await this.executor.run(spec, testTimeoutMs);
    }

    if (adapter.postProcessStderr) {
      testExecution = { ...testExecution, stderr: adapter.postProcessStderr(testExecution.stderr) };
      if (installExecution) {
        installExecution = { ...installExecution, stderr: adapter.postProcessStderr(installExecution.stderr) };
      }
    }

    return {
      runner: adapter.id,
      testCommand: testExecution.command,
      impactedTestFiles,
      installExecution,
      testExecution,
      passed: testExecution.exitCode === 0,
      isDiffScoped,
    };
  }
}
