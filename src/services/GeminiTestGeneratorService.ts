import * as fs from 'fs';
import * as path from 'path';
import { DiffService } from './DiffService';
import { GeminiAnalysisService } from './GeminiAnalysisService';
import { GeminiAgentExecutor, AgentRunResult, ToolExecutionResult } from './GeminiAgentExecutor';
import { CodebaseTestRunner, CodebaseTestRunResult, TestCommandExecution } from './CodebaseTestRunner';
import { TestScenario } from './TestScenarioService';
import { AstContextService } from './ast/AstContextService';
import { AssetCacheService } from './AssetCacheService';
import { WorkspaceManager } from '../repository/WorkspaceManager';
import { RepositoryManager } from '../repository/RepositoryManager';
import { JobExecutor } from '../core/JobExecutor';
import { Logger } from '../core/Logger';

export interface TestGeneratorResult extends AgentRunResult {
  repoId: string;
  commitSha: string;
  authorName: string;
  commitMessage: string;
  fromCache?: boolean;
  cachedOnBranch?: string;
  cachePath?: string;
  runner?: string;
  passed?: boolean;
  testExecution?: TestCommandExecution;
}

export interface BranchTestGeneratorResult extends AgentRunResult {
  repoId: string;
  baseBranch: string;
  compareBranch: string;
  compareSha: string;
  runner?: string;
  passed?: boolean;
  testExecution?: TestCommandExecution;
  fromCache?: boolean;
}

export interface ScenarioRunResult {
  scenarioId: number;
  scenarioTitle: string;
  success: boolean;
  finalSummary: string;
  steps: ToolExecutionResult[];
  createdFiles: string[];
  executionLogs: Array<{ command: string; exitCode: number; stdout: string; stderr: string }>;
  error?: string;
  // Derived from executionLogs, restricted to genuine test-runner invocations — a successful `git status`
  // or `git log` must never be able to make a scenario look like it "passed."
  testWasRun: boolean;
  testPassed: boolean | null;
  // Best-effort parse of the model's structured final summary, for a richer UI without another API call.
  parsedTestFile?: string;
  parsedDescription?: string;
  parsedRiskCategory?: string;
  parsedResultLabel?: string;
}

const TEST_COMMAND_PATTERN = /\b(vitest|jest|mocha|pytest|flutter test|dart test|go test|cargo test|node --test|npm test|npm run test|yarn test)\b/i;

export interface ScenarioTestGeneratorResult extends TestGeneratorResult {
  testBranch: string;
  testBranchCreated: boolean;
  committed: boolean;
  pushed: boolean;
  pushError?: string;
  scenarioResults: ScenarioRunResult[];
}

export interface BranchScenarioTestGeneratorResult extends BranchTestGeneratorResult {
  testBranch: string;
  testBranchCreated: boolean;
  committed: boolean;
  pushed: boolean;
  pushError?: string;
  scenarioResults: ScenarioRunResult[];
}

// Each selected scenario gets its own short-lived agent loop rather than sharing one long-running loop —
// this keeps the resent conversation history bounded per scenario instead of compounding across all of them.
const SCENARIO_TURN_BUDGET = 10;

export class GeminiTestGeneratorService {
  private diffService: DiffService;
  private geminiAnalysisService: GeminiAnalysisService;
  private astContextService: AstContextService;
  private workspaceManager: WorkspaceManager;
  private repositoryManager: RepositoryManager;
  private jobExecutor: JobExecutor;
  private agentExecutor: GeminiAgentExecutor;
  private testRunner: CodebaseTestRunner;
  private assetCacheService?: AssetCacheService;
  private logger = Logger.getInstance();

  constructor(
    diffService: DiffService,
    geminiAnalysisService: GeminiAnalysisService,
    workspaceManager: WorkspaceManager,
    repositoryManager: RepositoryManager,
    jobExecutor: JobExecutor,
    assetCacheService?: AssetCacheService
  ) {
    this.diffService = diffService;
    this.geminiAnalysisService = geminiAnalysisService;
    this.astContextService = new AstContextService();
    this.workspaceManager = workspaceManager;
    this.repositoryManager = repositoryManager;
    this.jobExecutor = jobExecutor;
    this.agentExecutor = new GeminiAgentExecutor();
    this.testRunner = new CodebaseTestRunner();
    this.assetCacheService = assetCacheService;
  }

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '\n...[truncated]' : text;
  }

  private buildExecutionArtifacts(testRun: CodebaseTestRunResult): {
    steps: ToolExecutionResult[];
    executionLogs: Array<{ command: string; exitCode: number; stdout: string; stderr: string }>;
  } {
    const steps: ToolExecutionResult[] = [];
    const executionLogs: Array<{ command: string; exitCode: number; stdout: string; stderr: string }> = [];
    let step = 1;

    const record = (execResult: TestCommandExecution) => {
      const stdout = this.truncate(execResult.stdout, 15000);
      const stderr = this.truncate(execResult.stderr, 5000);
      executionLogs.push({ command: execResult.command, exitCode: execResult.exitCode, stdout, stderr });
      steps.push({
        toolName: 'run_command',
        args: { command: execResult.command },
        result: { exitCode: execResult.exitCode, stdout, stderr, status: execResult.exitCode === 0 ? 'PASSED' : 'FAILED' },
        step: step++,
      });
    };

    if (testRun.installExecution) record(testRun.installExecution);
    if (testRun.testExecution) record(testRun.testExecution);

    return { steps, executionLogs };
  }

  private buildTestSynthesisPrompt(subjectLabel: string, filesChangedSummary: string, testRun: CodebaseTestRunResult): string {
    let prompt = `You are an expert AI Test Engineer. An adaptive, diff-scoped codebase test suite was executed deterministically against the repository.\n\n`;
    prompt += `${subjectLabel}\n\n`;
    prompt += `--- CHANGED FILES IN THIS COMMIT ---\n${filesChangedSummary}\n\n`;
    prompt += `Test Runner: ${testRun.runner}\n`;
    prompt += `Test Command: ${testRun.testCommand || 'None (bypassed)'}\n`;
    prompt += `Diff-Scoped Execution: ${testRun.isDiffScoped ? 'YES (targeted only modified features)' : 'Full Suite'}\n`;
    if (testRun.impactedTestFiles && testRun.impactedTestFiles.length > 0) {
      prompt += `Impacted Test Files Targeted: ${testRun.impactedTestFiles.join(', ')}\n`;
    }
    if (testRun.statusMessage) {
      prompt += `Runner Status: ${testRun.statusMessage}\n`;
    }
    prompt += `\n`;

    if (testRun.installExecution) {
      const installOutput = this.truncate(`${testRun.installExecution.stdout}\n${testRun.installExecution.stderr}`.trim(), 2000);
      prompt += `--- DEPENDENCY INSTALL (exit ${testRun.installExecution.exitCode}) ---\n${installOutput}\n\n`;
    }

    if (testRun.testExecution) {
      prompt += `--- TEST RUN RESULT: exit code ${testRun.testExecution.exitCode} (${testRun.passed ? 'PASSED' : 'FAILED'}) ---\n`;
      if (testRun.testExecution.stdout) {
        prompt += `STDOUT:\n${this.truncate(testRun.testExecution.stdout, 6000)}\n\n`;
      }
      if (testRun.testExecution.stderr) {
        prompt += `STDERR:\n${this.truncate(testRun.testExecution.stderr, 4000)}\n\n`;
      }
    }

    prompt += `Format your response strictly as:

### 🧠 AI Executive Summary
- **Commit Purpose**: Concise explanation of what the changed files do.
- **Stage 1 Verification Status**: 
  - If PASSED: Confirm that the impacted tests passed cleanly.
  - If NO TESTS FOUND: State clearly that no pre-existing tests were found for these new/modified files, and that the engine will generate targeted tests in Stage 2.
  - If FAILED: Clearly identify the **Root Cause** (e.g. Missing Database/Redis connection vs Broken Assertion vs Legacy test debt).
- **Targeted Test Coverage vs Legacy Scope**: Note whether only the impacted tests were executed.`;
    return prompt;
  }

  public async runExistingTests(
    repoId: string,
    sha: string,
    customInstructions?: string,
    forceRefresh = false
  ): Promise<TestGeneratorResult> {
    return this.jobExecutor.withRepoLock(repoId, () => this.runExistingTestsImpl(repoId, sha, customInstructions, forceRefresh));
  }

  private async runExistingTestsImpl(
    repoId: string,
    sha: string,
    customInstructions?: string,
    forceRefresh = false
  ): Promise<TestGeneratorResult> {
    this.logger.info(`[GeminiTestGeneratorService] Running existing codebase tests for repo '${repoId}', commit '${sha}'...`);

    const repoPath = this.workspaceManager.getRepoPath(repoId);
    if (!this.workspaceManager.repoExists(repoId)) {
      throw new Error(`Repository '${repoId}' is not cloned at ${repoPath}.`);
    }

    const diffData = await this.diffService.getMergeCommitDetails(repoId, sha);

    // 1. Enforce First-Parent PR Merge requirement
    const isFirstParent = (diffData.parents && diffData.parents.length > 1);
    if (!isFirstParent) {
      throw new Error(`Running codebase tests is restricted to First-Parent PR Merge commits only. Commit '${diffData.shortSha}' is an intermediate commit.`);
    }

    // 2. Check for cached test run on the dedicated test branch
    let prKey = `commit-${diffData.shortSha}`;
    let testBranch = 'release-patch-tests';
    let assetPath = `automation-assets/${prKey}-existing-tests.json`;

    if (this.assetCacheService) {
      const meta = this.assetCacheService.parsePrMetadata(diffData.message, diffData.shortSha);
      prKey = meta.prKey;
      testBranch = meta.testBranch;
      assetPath = this.assetCacheService.getAssetPath(prKey, 'existing-tests');

      if (!forceRefresh) {
        const cached = await this.assetCacheService.getCachedAsset<TestGeneratorResult>(repoId, testBranch, assetPath);
        if (cached) {
          this.logger.info(`[GeminiTestGeneratorService] Cache HIT! Returning cached codebase test run for ${prKey} on ${testBranch}.`);
          // Trust the verdict recorded at run time — it reflects cases the execution-log heuristic below
          // can't (e.g. runner === 'none', where no command ever ran and passed was explicitly false).
          // Only recompute for older cache entries written before `passed` was persisted.
          const isPassed = typeof cached.passed === 'boolean'
            ? cached.passed
            : (cached.executionLogs && cached.executionLogs.length > 0
                ? cached.executionLogs.every((l) => l.exitCode === 0)
                : (cached.steps && cached.steps.length > 0
                    ? cached.steps.every((s) => s.result?.status === 'PASSED' || s.result?.exitCode === 0)
                    : true));
          return {
            ...cached,
            fromCache: true,
            passed: isPassed,
          };
        }
      }
    }

    // The working tree can be on any branch (e.g. the periodic sync target), not necessarily the one this
    // commit belongs to — force it to match the exact commit being tested before running anything.
    await this.repositoryManager.checkoutCommitClean(repoId, diffData.commitSha);

    const changedFiles = diffData.files.map((f) => f.newPath || f.oldPath);

    // Deterministically detect & run the adaptive diff-scoped test suite.
    const testRun = await this.testRunner.run(repoPath, changedFiles);
    const { steps, executionLogs } = this.buildExecutionArtifacts(testRun);

    const filesChangedSummary = diffData.files
      .map(f => `- ${f.newPath || f.oldPath} (${f.type}, +${f.additions} -${f.deletions})`)
      .join('\n') || 'No files changed.';

    let subjectLabel = `Repository ID: ${repoId}\nCommit SHA: ${diffData.commitSha}\nAuthor: ${diffData.authorName}\nCommit Message: ${diffData.message}`;
    if (customInstructions) {
      subjectLabel += `\nUser Custom Instructions: ${customInstructions}`;
    }

    let finalSummary: string;
    if (testRun.runner === 'none') {
      finalSummary = `### 🧠 AI Executive Summary\nNo test command was detected for this repository (no test framework or test script found). Nothing was executed.`;
    } else if (testRun.statusMessage && !testRun.testExecution) {
      finalSummary = `### 🧠 AI Executive Summary\n- **Status**: ${testRun.statusMessage}\n- **Next Step**: Proceed to Stage 2 to propose and generate targeted AI test scenarios for these modified files.`;
    } else {
      const promptText = this.buildTestSynthesisPrompt(subjectLabel, filesChangedSummary, testRun);
      finalSummary = await this.geminiAnalysisService.generateMarkdown(promptText);
    }

    const result: TestGeneratorResult = {
      repoId,
      commitSha: diffData.commitSha,
      authorName: diffData.authorName,
      commitMessage: diffData.message,
      success: true,
      runner: testRun.runner,
      passed: testRun.passed,
      testExecution: testRun.testExecution,
      fromCache: false,
      finalSummary,
      steps,
      createdFiles: [],
      executionLogs,
    };

    // 3. Cache and commit test run report to the dedicated test branch under automation-assets/
    if (this.assetCacheService) {
      try {
        await this.assetCacheService.saveAndCommitAsset(
          repoId,
          testBranch,
          diffData.commitSha,
          assetPath,
          result,
          `chore(assets): cache codebase test run report for ${prKey}`
        );
        result.cachedOnBranch = testBranch;
        result.cachePath = assetPath;
      } catch (e: any) {
        this.logger.warn(`[GeminiTestGeneratorService] Could not persist test run asset to '${testBranch}': ${e.message}`);
      }
    }

    return result;
  }

  private getPackageInfoSnippet(repoPath: string): string {
    const packageJsonPath = path.join(repoPath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      return '';
    }
    try {
      const pkgData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      return `Detected package.json scripts: ${JSON.stringify(pkgData.scripts || {})}\nDependencies snippet: ${JSON.stringify(pkgData.devDependencies || {})}\n`;
    } catch {
      return '';
    }
  }

  // Reads the scenario's target file(s) up front so the agent never has to spend a turn on read_file for
  // them — the AST context only has signatures, not the literal source it needs to write a correct test.
  private buildTargetFileSourceBlock(repoPath: string, targetFiles: string[] | undefined): string {
    const blocks: string[] = [];
    for (const file of targetFiles || []) {
      const fullPath = path.join(repoPath, file);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          blocks.push(`--- FULL SOURCE: ${file} ---\n${this.truncate(content, 8000)}`);
        } catch {
          // Unreadable file: the agent can still read_file it manually as a fallback.
        }
      }
    }
    return blocks.join('\n\n');
  }

  private getRecommendedTestPath(repoPath: string, scenario: TestScenario): string {
    if (scenario.existingTestFile) {
      return scenario.existingTestFile;
    }
    const targetFile = scenario.targetFiles?.[0];
    if (!targetFile) {
      return 'tests/unit/generatedScenario.test.ts';
    }

    const ext = path.extname(targetFile);
    const baseName = path.basename(targetFile, ext);
    const dir = path.dirname(targetFile);

    // If it's already a test file
    if (/\.(test|spec)\.[jt]sx?$/.test(targetFile) || /_test\.dart$/.test(targetFile)) {
      return targetFile;
    }

    if (ext === '.dart') {
      const relDir = dir.startsWith('lib') ? dir.replace(/^lib/, 'test') : path.join('test', dir);
      return path.join(relDir, `${baseName}_test.dart`);
    }

    if (ext === '.py') {
      const relDir = dir.startsWith('src') ? dir.replace(/^src/, 'tests') : path.join('tests', dir);
      return path.join(relDir, `test_${baseName}.py`);
    }

    // Check existing test directory conventions in this repo
    const testDirCandidates = [
      dir.startsWith('src') ? dir.replace(/^src/, 'tests') : path.join('tests', dir),
      path.join(dir, '__tests__'),
      path.join('tests', dir),
      'tests',
    ];

    for (const cand of testDirCandidates) {
      if (fs.existsSync(path.join(repoPath, cand))) {
        return path.join(cand, `${baseName}.test${ext.startsWith('.ts') ? '.ts' : '.js'}`);
      }
    }

    const targetDir = dir.startsWith('src') ? dir.replace(/^src/, 'tests') : path.join('tests', dir);
    return path.join(targetDir, `${baseName}.test${ext.startsWith('.ts') ? '.ts' : '.js'}`);
  }

  private buildSingleScenarioPrompt(
    repoPath: string,
    subjectLabel: string,
    filesChangedSummary: string,
    packageInfoSnippet: string,
    analysisMarkdown: string,
    astContextMarkdown: string,
    targetFileSourceBlock: string,
    scenario: TestScenario
  ): string {
    const recommendedTestPath = this.getRecommendedTestPath(repoPath, scenario);

    let prompt = `${subjectLabel}\n\n--- CHANGED FILES ---\n${filesChangedSummary}\n\n`;

    if (astContextMarkdown) {
      prompt += `${astContextMarkdown}\n\n`;
    }

    if (targetFileSourceBlock) {
      prompt += `${targetFileSourceBlock}\n\n`;
    }

    if (packageInfoSnippet) {
      prompt += `--- PRE-COMPUTED PACKAGE & TEST RUNNER CONTEXT ---\n${packageInfoSnippet}\n`;
    }

    if (analysisMarkdown) {
      prompt += `--- PREVIOUS AI CODE REVIEW & RISK ASSESSMENT ---\n${analysisMarkdown}\n\n`;
    }

    prompt += `--- YOUR ONLY TASK: IMPLEMENT THIS ONE TEST SCENARIO ---\n${scenario.id}. ${scenario.title}\n   ${scenario.description}\n`;
    if (scenario.targetFiles && scenario.targetFiles.length > 0) {
      prompt += `   Target file(s): ${scenario.targetFiles.join(', ')}\n`;
    }
    prompt += `   📁 Target Test File Destination: ${recommendedTestPath}\n`;
    if (scenario.coverageStatus === 'already_covered' && scenario.existingTestFile) {
      prompt += `   Note: the user selected this despite it already being covered by ${scenario.existingTestFile} — check that file first and only add a test if it's genuinely missing or worth strengthening.\n`;
    } else if (scenario.coverageStatus === 'partially_covered' && scenario.existingTestFile) {
      prompt += `   Note: ${scenario.existingTestFile} partially covers this already — read it first and write a test that fills the specific gap rather than duplicating it.\n`;
    }
    if (scenario.riskRuleId) {
      prompt += `   Risk category: ${scenario.riskRuleId}${scenario.riskSeverity ? ` (${scenario.riskSeverity})` : ''}${scenario.riskExplanation ? ` — ${scenario.riskExplanation}` : ''}\n`;
    }

    prompt += `\nSTAGE 2 INSTRUCTIONS (WRITE & RUN ONE TEST FOR THE SCENARIO ABOVE — strictly evaluated against Alt DRX Directives):
1. The full current source of the target file(s) is already provided above under "FULL SOURCE" — do NOT browse or explore the directory tree.
2. Step 1 (MANDATORY): Call write_file("${recommendedTestPath}", content) with the test implementation for this scenario.
   - 🚨 CRITICAL [REL-12]: Mock ALL external / I/O dependencies (databases, network APIs, repositories, message queues) using the patterns identified in the AST section. Never call live services in unit tests.
   - 🚨 CRITICAL [OOP-17 / SEC-05 / CLN-29]: Follow unified HTTP abstractions, test strict input validation boundaries, and assert clean error handling/early returns.
   - Use the exact test runner and framework syntax detected above (e.g. vitest vs jest vs flutter test).
3. Step 2: Immediately execute it using run_command with the actual test runner (e.g. "npx jest ${recommendedTestPath} --passWithNoTests --forceExit", "npx vitest run ${recommendedTestPath}", "flutter test ${recommendedTestPath}").
4. Step 3 (Only if Step 2 fails): Read the error output, fix the test code using write_file, and re-run once.
5. Final Step: Output the structured Markdown report with the required format:

**Test file:** \`${recommendedTestPath}\`
**Engineering Directive Evaluated:** ${scenario.riskRuleId ? `${scenario.riskRuleId}${scenario.riskSeverity ? ` (${scenario.riskSeverity})` : ''} — ${scenario.riskExplanation || 'see scenario description'}` : 'Alt DRX Directives (REL-12 Mock Boundaries, OOP-17 Unified Abstractions, SEC-05 Input Validation)'}
**What it verifies:** <Detailed 2-3 sentence explanation of the exact behavior, inputs, and outcomes this test checks, explaining what broke if this test ever fails>
**Validation & Edge Cases Covered:**
- <Bullet 1: Specific input conditions and edge cases tested>
- <Bullet 2: Dependencies and mocks configured>
- <Bullet 3: Assertions and expected outputs or errors thrown>
**Result:** PASSED | FAILED | NOT RUN — <details of test execution and pass count>

You have a strict budget of turns. Your call sequence should be: write_file → run_command → (optionally) write_file → run_command. Reaching your turn limit without having called write_file is a failure.`;

    return prompt;
  }

  private parseScenarioSummary(summary: string): {
    testFile?: string;
    description?: string;
    riskCategory?: string;
    resultLabel?: string;
  } {
    const field = (label: string) => {
      const match = summary.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+?)(?=\\n\\*\\*|$)`, 'is'));
      return match ? match[1].trim().replace(/^`|`$/g, '') : undefined;
    };

    return {
      testFile: field('Test file'),
      description: field('What it verifies') || field('Validation & Edge Cases Covered'),
      riskCategory: field('Engineering Directive Evaluated') || field('Risk category'),
      resultLabel: field('Result'),
    };
  }

  // Runs one bounded agent loop per scenario, sequentially (they share a working directory, so cannot
  // run concurrently), and aggregates the results into the same shape a single shared loop used to return.
  private async runScenarioLoops(
    repoPath: string,
    subjectLabel: string,
    filesChangedSummary: string,
    packageInfoSnippet: string,
    analysisMarkdown: string,
    astContextMarkdown: string,
    scenarios: TestScenario[]
  ): Promise<AgentRunResult & { scenarioResults: ScenarioRunResult[] }> {
    const scenarioResults: ScenarioRunResult[] = [];
    const allSteps: ToolExecutionResult[] = [];
    const allCreatedFiles: string[] = [];
    const allExecutionLogs: Array<{ command: string; exitCode: number; stdout: string; stderr: string }> = [];
    let stepCounter = 1;

    for (const scenario of scenarios) {
      this.logger.info(`[GeminiTestGeneratorService] Running scoped agent loop for scenario ${scenario.id}: "${scenario.title}"...`);

      const targetFileSourceBlock = this.buildTargetFileSourceBlock(repoPath, scenario.targetFiles);
      const scenarioPrompt = this.buildSingleScenarioPrompt(
        repoPath,
        subjectLabel,
        filesChangedSummary,
        packageInfoSnippet,
        analysisMarkdown,
        astContextMarkdown,
        targetFileSourceBlock,
        scenario
      );

      let runResult: AgentRunResult;
      try {
        runResult = await this.agentExecutor.runAgentLoop(repoPath, scenarioPrompt, SCENARIO_TURN_BUDGET);
      } catch (e: any) {
        this.logger.warn(`Scenario ${scenario.id} ("${scenario.title}") agent loop failed: ${e.message}`);
        runResult = { success: false, finalSummary: '', steps: [], createdFiles: [], executionLogs: [], error: e.message };
      }

      for (const step of runResult.steps) {
        allSteps.push({ ...step, step: stepCounter++, scenarioId: scenario.id, scenarioTitle: scenario.title });
      }
      for (const f of runResult.createdFiles) {
        if (!allCreatedFiles.includes(f)) allCreatedFiles.push(f);
      }
      allExecutionLogs.push(...runResult.executionLogs);

      const testExecutionLogs = runResult.executionLogs.filter((l) => TEST_COMMAND_PATTERN.test(l.command));
      const testWasRun = testExecutionLogs.length > 0;
      // Reflects the LAST test invocation, not every attempt in the loop - the agent routinely writes a
      // first draft, hits a compile/assertion error, fixes it, and reruns. Requiring every attempt to
      // have passed would mark that normal self-correction as an overall failure even when the test file
      // ends in a passing state, which is what the agent's own final summary already reports.
      const testPassed = testWasRun ? testExecutionLogs[testExecutionLogs.length - 1].exitCode === 0 : null;
      const parsed = this.parseScenarioSummary(runResult.finalSummary);

      scenarioResults.push({
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        success: runResult.success,
        finalSummary: runResult.finalSummary,
        steps: runResult.steps,
        createdFiles: runResult.createdFiles,
        executionLogs: runResult.executionLogs,
        error: runResult.error,
        testWasRun,
        testPassed,
        parsedTestFile: parsed.testFile,
        parsedDescription: parsed.description,
        parsedRiskCategory: parsed.riskCategory,
        parsedResultLabel: parsed.resultLabel,
      });
    }

    const combinedSummary = scenarioResults
      .map((r) => `### Scenario ${r.scenarioId}: ${r.scenarioTitle}\n${r.error ? `⚠️ Failed to complete: ${r.error}` : r.finalSummary || '_No summary produced._'}`)
      .join('\n\n');

    return {
      success: true,
      finalSummary: combinedSummary,
      steps: allSteps,
      createdFiles: allCreatedFiles,
      executionLogs: allExecutionLogs,
      scenarioResults,
    };
  }

  private async persistTestBranch(
    repoId: string,
    testBranch: string,
    scenarios: TestScenario[],
    prKey?: string,
    generatorResult?: any
  ): Promise<{ committed: boolean; pushed: boolean; pushError?: string }> {
    const repoPath = this.workspaceManager.getRepoPath(repoId);

    // Persist asset report to automation-assets/ if provided
    if (prKey && generatorResult) {
      const assetDir = path.join(repoPath, 'automation-assets');
      if (!fs.existsSync(assetDir)) {
        fs.mkdirSync(assetDir, { recursive: true });
      }
      fs.writeFileSync(
        path.join(assetDir, `${prKey}-ai-tests.json`),
        JSON.stringify(generatorResult, null, 2),
        'utf-8'
      );
    }

    const commitMessage = `AI-generated tests: ${scenarios.map((s) => s.title).join('; ')}`;
    const { committed } = await this.repositoryManager.commitAll(repoId, commitMessage);

    if (!committed) {
      return { committed: false, pushed: false };
    }

    try {
      await this.repositoryManager.pushBranch(repoId, testBranch);
      return { committed: true, pushed: true };
    } catch (e: any) {
      this.logger.warn(`Failed to push test branch '${testBranch}' for '${repoId}': ${e.message}`);
      return { committed: true, pushed: false, pushError: e.message };
    }
  }

  public async generateAndRunTests(
    repoId: string,
    sha: string,
    sourceBranch: string,
    scenarios: TestScenario[],
    forceRefresh = false
  ): Promise<ScenarioTestGeneratorResult> {
    if (!scenarios || scenarios.length === 0) {
      throw new Error('At least one test scenario must be selected.');
    }
    return this.jobExecutor.withRepoLock(repoId, () => this.generateAndRunTestsImpl(repoId, sha, sourceBranch, scenarios, forceRefresh));
  }

  private async generateAndRunTestsImpl(
    repoId: string,
    sha: string,
    sourceBranch: string,
    scenarios: TestScenario[],
    forceRefresh = false
  ): Promise<ScenarioTestGeneratorResult> {
    this.logger.info(`[GeminiTestGeneratorService] Generating tests for ${scenarios.length} selected scenario(s) — repo '${repoId}', commit '${sha}'...`);

    const repoPath = this.workspaceManager.getRepoPath(repoId);
    if (!this.workspaceManager.repoExists(repoId)) {
      throw new Error(`Repository '${repoId}' is not cloned at ${repoPath}.`);
    }

    const diffData = await this.diffService.getMergeCommitDetails(repoId, sha);

    // 1. Enforce First-Parent PR Merge requirement
    const isFirstParent = (diffData.parents && diffData.parents.length > 1);
    if (!isFirstParent) {
      throw new Error(`Generating AI tests is restricted to First-Parent PR Merge commits only. Commit '${diffData.shortSha}' is an intermediate commit.`);
    }

    // 2. Check for cached AI scenario tests on the dedicated test branch
    let prKey = `commit-${diffData.shortSha}`;
    const testBranch = `${sourceBranch}-tests`;
    let assetPath = `automation-assets/${prKey}-ai-tests.json`;

    if (this.assetCacheService) {
      const meta = this.assetCacheService.parsePrMetadata(diffData.message, diffData.shortSha, sourceBranch);
      prKey = meta.prKey;
      assetPath = this.assetCacheService.getAssetPath(prKey, 'ai-tests');

      if (!forceRefresh) {
        const cached = await this.assetCacheService.getCachedAsset<ScenarioTestGeneratorResult>(repoId, testBranch, assetPath);
        if (cached && cached.scenarioResults && cached.scenarioResults.length >= scenarios.length) {
          this.logger.info(`[GeminiTestGeneratorService] Cache HIT! Returning cached AI scenario test report for ${prKey} on ${testBranch}.`);
          return cached;
        }
      }
    }

    // Working tree must match the exact commit being tested before branching off it.
    await this.repositoryManager.checkoutCommitClean(repoId, diffData.commitSha);

    const { created: testBranchCreated } = await this.repositoryManager.prepareTestBranch(repoId, testBranch, diffData.commitSha);

    let analysisMarkdown = '';
    try {
      const analysisRes = await this.geminiAnalysisService.analyzeMergeCommit(repoId, sha, forceRefresh);
      analysisMarkdown = analysisRes.analysis;
    } catch (e: any) {
      this.logger.warn(`Failed to retrieve AI analysis for commit ${sha}: ${e.message}. Proceeding with diff details alone.`);
    }

    const changedFiles = diffData.files.map((f) => f.newPath || f.oldPath);
    let astContextMarkdown = '';
    try {
      const astRes = await this.astContextService.analyzeChangedFiles(repoPath, changedFiles);
      astContextMarkdown = astRes.formattedPromptBlock;
    } catch (e: any) {
      this.logger.warn(`Failed to generate AST context for commit ${sha}: ${e.message}`);
    }

    const runResult = await this.runScenarioLoops(
      repoPath,
      `Repository ID: ${repoId}\nCommit SHA: ${diffData.commitSha}\nAuthor: ${diffData.authorName}\nCommit Message: ${diffData.message}`,
      diffData.files.map((f) => `- ${f.newPath || f.oldPath} (${f.type}, +${f.additions} -${f.deletions})`).join('\n'),
      this.getPackageInfoSnippet(repoPath),
      analysisMarkdown,
      astContextMarkdown,
      scenarios
    );

    const initialResult: ScenarioTestGeneratorResult = {
      repoId,
      commitSha: diffData.commitSha,
      authorName: diffData.authorName,
      commitMessage: diffData.message,
      ...runResult,
      testBranch,
      testBranchCreated,
      committed: false,
      pushed: false,
      cachedOnBranch: testBranch,
      cachePath: assetPath,
    };

    const persistResult = await this.persistTestBranch(repoId, testBranch, scenarios, prKey, initialResult);

    return {
      ...initialResult,
      committed: persistResult.committed,
      pushed: persistResult.pushed,
      pushError: persistResult.pushError,
    };
  }

  public async runExistingTestsForBranchComparison(
    repoId: string,
    baseBranch: string,
    compareBranch: string,
    customInstructions?: string
  ): Promise<BranchTestGeneratorResult> {
    return this.jobExecutor.withRepoLock(repoId, () => this.runExistingTestsForBranchComparisonImpl(repoId, baseBranch, compareBranch, customInstructions));
  }

  private async runExistingTestsForBranchComparisonImpl(
    repoId: string,
    baseBranch: string,
    compareBranch: string,
    customInstructions?: string
  ): Promise<BranchTestGeneratorResult> {
    this.logger.info(`[GeminiTestGeneratorService] Running existing codebase tests for repo '${repoId}', comparing '${compareBranch}' against '${baseBranch}'...`);

    const repoPath = this.workspaceManager.getRepoPath(repoId);
    if (!this.workspaceManager.repoExists(repoId)) {
      throw new Error(`Repository '${repoId}' is not cloned at ${repoPath}.`);
    }

    // Working tree must cleanly reflect the compare branch's code before tests can be run against it
    // (fetch + checkout + hard reset + clean, so leftover files from a prior agent run can't interfere).
    await this.repositoryManager.update(repoId, compareBranch);

    const diffData = await this.diffService.getBranchComparisonDetails(repoId, baseBranch, compareBranch);

    const changedFiles = diffData.files.map((f) => f.newPath || f.oldPath);

    // Deterministically detect & run the adaptive diff-scoped test suite.
    const testRun = await this.testRunner.run(repoPath, changedFiles);
    const { steps, executionLogs } = this.buildExecutionArtifacts(testRun);

    const filesChangedSummary = diffData.files
      .map(f => `- ${f.newPath || f.oldPath} (${f.type}, +${f.additions} -${f.deletions})`)
      .join('\n') || 'No files changed.';

    let subjectLabel = `Repository ID: ${repoId}\nBase Branch: ${diffData.baseBranch} (${diffData.baseShortSha})\nCompare Branch: ${diffData.compareBranch} (${diffData.compareShortSha})\nCompare branch is ${diffData.aheadBy} commit(s) ahead and ${diffData.behindBy} commit(s) behind base.`;
    if (customInstructions) {
      subjectLabel += `\nUser Custom Instructions: ${customInstructions}`;
    }

    let finalSummary: string;
    if (testRun.runner === 'none') {
      finalSummary = `### 🧠 AI Executive Summary\nNo test command was detected for this repository (no test framework or test script found). Nothing was executed.`;
    } else if (testRun.statusMessage && !testRun.testExecution) {
      finalSummary = `### 🧠 AI Executive Summary\n- **Status**: ${testRun.statusMessage}\n- **Next Step**: Proceed to Stage 2 to propose and generate targeted AI test scenarios for these modified files.`;
    } else {
      const promptText = this.buildTestSynthesisPrompt(subjectLabel, filesChangedSummary, testRun);
      finalSummary = await this.geminiAnalysisService.generateMarkdown(promptText);
    }

    return {
      repoId,
      baseBranch: diffData.baseBranch,
      compareBranch: diffData.compareBranch,
      compareSha: diffData.compareSha,
      success: true,
      runner: testRun.runner,
      passed: testRun.passed,
      testExecution: testRun.testExecution,
      fromCache: false,
      finalSummary,
      steps,
      createdFiles: [],
      executionLogs,
    };
  }

  public async generateAndRunTestsForBranchComparison(
    repoId: string,
    baseBranch: string,
    compareBranch: string,
    scenarios: TestScenario[]
  ): Promise<BranchScenarioTestGeneratorResult> {
    if (!scenarios || scenarios.length === 0) {
      throw new Error('At least one test scenario must be selected.');
    }
    return this.jobExecutor.withRepoLock(repoId, () => this.generateAndRunTestsForBranchComparisonImpl(repoId, baseBranch, compareBranch, scenarios));
  }

  private async generateAndRunTestsForBranchComparisonImpl(
    repoId: string,
    baseBranch: string,
    compareBranch: string,
    scenarios: TestScenario[]
  ): Promise<BranchScenarioTestGeneratorResult> {
    this.logger.info(`[GeminiTestGeneratorService] Generating tests for ${scenarios.length} selected scenario(s) — repo '${repoId}', comparing '${compareBranch}' against '${baseBranch}'...`);

    const repoPath = this.workspaceManager.getRepoPath(repoId);
    if (!this.workspaceManager.repoExists(repoId)) {
      throw new Error(`Repository '${repoId}' is not cloned at ${repoPath}.`);
    }

    // Working tree must cleanly reflect the compare branch's code before branching off it.
    await this.repositoryManager.update(repoId, compareBranch);

    const diffData = await this.diffService.getBranchComparisonDetails(repoId, baseBranch, compareBranch);

    const testBranch = `${compareBranch}-tests`;
    const { created: testBranchCreated } = await this.repositoryManager.prepareTestBranch(repoId, testBranch, diffData.compareSha);

    let analysisMarkdown = '';
    try {
      const analysisRes = await this.geminiAnalysisService.analyzeBranchComparison(repoId, baseBranch, compareBranch);
      analysisMarkdown = analysisRes.analysis;
    } catch (e: any) {
      this.logger.warn(`Failed to retrieve AI analysis for branch comparison ${baseBranch}...${compareBranch}: ${e.message}. Proceeding with diff details alone.`);
    }

    const changedFiles = diffData.files.map((f) => f.newPath || f.oldPath);
    let astContextMarkdown = '';
    try {
      const astRes = await this.astContextService.analyzeChangedFiles(repoPath, changedFiles);
      astContextMarkdown = astRes.formattedPromptBlock;
    } catch (e: any) {
      this.logger.warn(`Failed to generate AST context for branch comparison: ${e.message}`);
    }

    const runResult = await this.runScenarioLoops(
      repoPath,
      `Repository ID: ${repoId}\nBase Branch: ${diffData.baseBranch} (${diffData.baseShortSha})\nCompare Branch: ${diffData.compareBranch} (${diffData.compareShortSha})`,
      diffData.files.map((f) => `- ${f.newPath || f.oldPath} (${f.type}, +${f.additions} -${f.deletions})`).join('\n'),
      this.getPackageInfoSnippet(repoPath),
      analysisMarkdown,
      astContextMarkdown,
      scenarios
    );
    const persistResult = await this.persistTestBranch(repoId, testBranch, scenarios);

    return {
      repoId,
      baseBranch: diffData.baseBranch,
      compareBranch: diffData.compareBranch,
      compareSha: diffData.compareSha,
      ...runResult,
      testBranch,
      testBranchCreated,
      committed: persistResult.committed,
      pushed: persistResult.pushed,
      pushError: persistResult.pushError,
    };
  }
}
