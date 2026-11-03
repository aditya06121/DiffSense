import * as fs from 'fs';
import * as path from 'path';
import { Type } from '@google/genai';
import { DiffService, FileDiff } from './DiffService';
import { GeminiAnalysisService } from './GeminiAnalysisService';
import { AstContextService } from './ast/AstContextService';
import { AssetCacheService } from './AssetCacheService';
import { WorkspaceManager } from '../repository/WorkspaceManager';
import { RepositoryManager } from '../repository/RepositoryManager';
import { JobExecutor } from '../core/JobExecutor';
import { Logger } from '../core/Logger';

export type ScenarioCoverageStatus = 'new' | 'already_covered' | 'partially_covered';

export interface TestScenario {
  id: number;
  title: string;
  description: string;
  targetFiles: string[];
  coverageStatus: ScenarioCoverageStatus;
  existingTestFile?: string;
  riskRuleId?: string;
  riskSeverity?: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  riskExplanation?: string;
}

const SCENARIOS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    scenarios: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          targetFiles: { type: Type.ARRAY, items: { type: Type.STRING } },
          coverageStatus: { type: Type.STRING, enum: ['new', 'already_covered', 'partially_covered'] },
          existingTestFile: { type: Type.STRING },
          riskRuleId: { type: Type.STRING, description: 'The single most relevant Alt DRX directive rule ID this scenario guards against, e.g. "DAT-08". Omit if no rule clearly applies.' },
          riskSeverity: { type: Type.STRING, enum: ['CRITICAL', 'HIGH', 'MEDIUM'] },
          riskExplanation: { type: Type.STRING, description: 'One sentence: why this specific code is at risk under that rule.' },
        },
        required: ['title', 'description', 'coverageStatus'],
      },
    },
  },
  required: ['scenarios'],
};

// Proposes candidate test scenarios for a diff without writing any code — a cheap, single-shot call
// so the user can pick which ones are worth actually generating tests for. Cross-checks against
// existing test files so already-covered behavior is flagged instead of silently duplicated.
export class TestScenarioService {
  private diffService: DiffService;
  private geminiAnalysisService: GeminiAnalysisService;
  private astContextService: AstContextService;
  private workspaceManager: WorkspaceManager;
  private repositoryManager: RepositoryManager;
  private jobExecutor: JobExecutor;
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
    this.assetCacheService = assetCacheService;
  }

  public async proposeScenariosForCommit(repoId: string, sha: string, forceRefresh = false): Promise<{ commitSha: string; scenarios: TestScenario[]; fromCache?: boolean; cachedOnBranch?: string }> {
    return this.jobExecutor.withRepoLock(repoId, () => this.proposeScenariosForCommitImpl(repoId, sha, forceRefresh));
  }

  private async proposeScenariosForCommitImpl(repoId: string, sha: string, forceRefresh = false): Promise<{ commitSha: string; scenarios: TestScenario[]; fromCache?: boolean; cachedOnBranch?: string }> {
    const diffData = await this.diffService.getMergeCommitDetails(repoId, sha);

    // 1. Enforce First-Parent PR Merge requirement
    const isFirstParent = (diffData.parents && diffData.parents.length > 1);
    if (!isFirstParent) {
      throw new Error(`Test scenario proposal is restricted to First-Parent PR Merge commits only. Commit '${diffData.shortSha}' is an intermediate commit.`);
    }

    // 2. Check cache on dedicated test branch
    let prKey = `commit-${diffData.shortSha}`;
    let testBranch = 'release-patch-tests';
    let assetPath = `automation-assets/${prKey}-scenarios.json`;

    if (this.assetCacheService) {
      const meta = this.assetCacheService.parsePrMetadata(diffData.message, diffData.shortSha);
      prKey = meta.prKey;
      testBranch = meta.testBranch;
      assetPath = this.assetCacheService.getAssetPath(prKey, 'scenarios');

      if (!forceRefresh) {
        const cached = await this.assetCacheService.getCachedAsset<{ commitSha: string; scenarios: TestScenario[] }>(repoId, testBranch, assetPath);
        if (cached && cached.scenarios) {
          this.logger.info(`[TestScenarioService] Cache HIT for test scenarios on ${testBranch}`);
          return { ...cached, fromCache: true, cachedOnBranch: testBranch };
        }
      }
    }

    // The working tree must reflect this exact commit before we can scan it for existing test files.
    await this.repositoryManager.checkoutCommitClean(repoId, diffData.commitSha);

    const repoPath = this.workspaceManager.getRepoPath(repoId);
    const changedFiles = diffData.files.map((f) => f.newPath || f.oldPath);
    const subjectLabel = `Repository: ${repoId}\nCommit: ${diffData.shortSha} — ${diffData.message}`;

    const astContext = await this.astContextService.analyzeChangedFiles(repoPath, changedFiles);

    const scenarios = await this.propose(
      subjectLabel,
      this.summarizeDiff(diffData.files),
      this.buildExistingCoverageContext(repoPath, changedFiles),
      astContext.formattedPromptBlock
    );

    const result = { commitSha: diffData.commitSha, scenarios };

    // 3. Cache and commit scenarios to dedicated test branch
    if (this.assetCacheService) {
      try {
        await this.assetCacheService.saveAndCommitAsset(
          repoId,
          testBranch,
          diffData.commitSha,
          assetPath,
          result,
          `chore(assets): cache proposed test scenarios for ${prKey}`
        );
      } catch (e: any) {
        this.logger.warn(`Could not persist test scenarios asset to ${testBranch}: ${e.message}`);
      }
    }

    return result;
  }

  public async proposeScenariosForBranchComparison(
    repoId: string,
    baseBranch: string,
    compareBranch: string
  ): Promise<{ compareSha: string; scenarios: TestScenario[] }> {
    return this.jobExecutor.withRepoLock(repoId, () => this.proposeScenariosForBranchComparisonImpl(repoId, baseBranch, compareBranch));
  }

  private async proposeScenariosForBranchComparisonImpl(
    repoId: string,
    baseBranch: string,
    compareBranch: string
  ): Promise<{ compareSha: string; scenarios: TestScenario[] }> {
    // The working tree must reflect the compare branch before we can scan it for existing test files.
    await this.repositoryManager.update(repoId, compareBranch);

    const diffData = await this.diffService.getBranchComparisonDetails(repoId, baseBranch, compareBranch);
    const repoPath = this.workspaceManager.getRepoPath(repoId);
    const changedFiles = diffData.files.map((f) => f.newPath || f.oldPath);
    const subjectLabel = `Repository: ${repoId}\nBranch Comparison: ${compareBranch} vs ${baseBranch}`;

    const astContext = await this.astContextService.analyzeChangedFiles(repoPath, changedFiles);

    const scenarios = await this.propose(
      subjectLabel,
      this.summarizeDiff(diffData.files),
      this.buildExistingCoverageContext(repoPath, changedFiles),
      astContext.formattedPromptBlock
    );
    return { compareSha: diffData.compareSha, scenarios };
  }

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '\n...[truncated]' : text;
  }

  private static directivesIndexCache: string | null = null;

  // Condenses the (large, narrative) engineering-directives doc into a compact "RULE-ID — title: reason"
  // index so it's cheap to include in every scenario-proposal prompt, rather than pasting the whole file.
  private loadDirectivesIndex(): string {
    if (TestScenarioService.directivesIndexCache !== null) {
      return TestScenarioService.directivesIndexCache;
    }

    const filePath = path.join(__dirname, '../config/engineering-directives.md');
    let index = '';
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const ruleRegex = /-\s+\*\*\[([A-Z]+-\d+)\]\s*-\s*(.+?)\*\*:?\s*(.*)/g;
      const lines: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = ruleRegex.exec(content)) !== null) {
        const [, id, title, desc] = match;
        const firstSentence = desc.split(/\.\s|\.$/)[0].trim();
        lines.push(`${id} (${title.trim()})${firstSentence ? `: ${firstSentence}` : ''}`);
      }
      index = lines.join('\n');
    } catch {
      index = '';
    }

    TestScenarioService.directivesIndexCache = index;
    return index;
  }

  private readonly IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.turbo', 'vendor']);
  private readonly MAX_FILES_SCANNED = 20000;

  // Repos don't agree on a test-file convention (__tests__/, test/, tests/, co-located, suffixed, etc.),
  // so rather than guessing exact paths, scan the whole tree once and match by filename substring.
  private listAllTestFiles(repoPath: string): string[] {
    const results: string[] = [];
    let scanned = 0;

    const walk = (relDir: string) => {
      if (scanned >= this.MAX_FILES_SCANNED) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(path.join(repoPath, relDir), { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (scanned >= this.MAX_FILES_SCANNED) return;
        scanned++;
        const relPath = path.join(relDir, entry.name);

        if (entry.isDirectory()) {
          if (this.IGNORED_DIRS.has(entry.name)) continue;
          walk(relPath);
        } else if (/\.(test|spec)\.[jt]sx?$/.test(entry.name) || /_test\.dart$/.test(entry.name)) {
          results.push(relPath);
        }
      }
    };

    walk('.');
    return results;
  }

  private findRelatedTestFiles(changedFilePath: string, allTestFiles: string[]): string[] {
    if (/\.(test|spec)\.|_test\.|__tests__\//.test(changedFilePath)) {
      return []; // the changed file is itself a test file
    }

    const baseLower = path.basename(changedFilePath, path.extname(changedFilePath)).toLowerCase();
    return allTestFiles.filter((testFile) => path.basename(testFile).toLowerCase().includes(baseLower));
  }

  private buildExistingCoverageContext(repoPath: string, changedFiles: string[]): string {
    const allTestFiles = this.listAllTestFiles(repoPath);
    const blocks: string[] = [];
    const seen = new Set<string>();

    for (const file of changedFiles) {
      for (const testFile of this.findRelatedTestFiles(file, allTestFiles)) {
        const key = `${file}::${testFile}`;
        if (seen.has(key)) continue;
        seen.add(key);

        try {
          const content = fs.readFileSync(path.join(repoPath, testFile), 'utf-8');
          blocks.push(`--- EXISTING TEST FILE: ${testFile} (covers ${file}) ---\n${this.truncate(content, 3000)}`);
        } catch {
          // Unreadable file: skip, not fatal to scenario proposal.
        }
      }
    }

    return blocks.length > 0 ? blocks.join('\n\n') : 'No existing test files were found for the changed files.';
  }

  private summarizeDiff(files: FileDiff[]): string {
    let context = '';
    files.forEach((f, idx) => {
      context += `=== File [${idx + 1}/${files.length}]: ${f.newPath || f.oldPath} (${f.type}, +${f.additions} -${f.deletions}) ===\n`;
      f.hunks.forEach((h) => {
        context += `${h.header}\n`;
        h.lines.forEach((l) => {
          const sign = l.type === 'ADDITION' ? '+' : l.type === 'DELETION' ? '-' : ' ';
          context += `${sign} ${l.content}\n`;
        });
      });
      context += '\n';
    });

    if (context.length > 40000) {
      context = context.substring(0, 40000) + '\n\n... [Diff truncated for scenario proposal context limit] ...';
    }

    return context || 'No file changes.';
  }

  private async propose(
    subjectLabel: string,
    diffContext: string,
    existingCoverageContext: string,
    astContextMarkdown?: string
  ): Promise<TestScenario[]> {
    let promptText = `You are an expert Test Architect. Analyze the following code diff, AST symbol signatures, and dependency intelligence to propose a numbered list of concrete, high-value test scenarios that verify these specific changes.\n\n`;
    promptText += `${subjectLabel}\n\n`;

    if (astContextMarkdown) {
      promptText += `${astContextMarkdown}\n\n`;
    }

    const directivesIndex = this.loadDirectivesIndex();

    promptText += `Guidelines:
- Focus on behavior introduced or changed by this diff, not the whole codebase.
- Use the AST Symbol and Dependency Graph to target specific methods, parameters, and edge cases.
- Each scenario must be specific enough to turn directly into one test case: a clear input/action and an expected outcome.
- Prefer edge cases, error handling, and business logic over trivial rendering checks.
- Propose between 3 and 8 scenarios.
- List the file(s) each scenario primarily targets in "targetFiles".
- Cross-check each scenario against the existing test files below. Set "coverageStatus" to:
  - "new" if no existing test appears to verify this behavior.
  - "already_covered" if an existing test already verifies this exact behavior — still list it (so the user sees it's already handled), and name the file in "existingTestFile".
  - "partially_covered" if related tests exist but leave a gap (e.g. missing an edge case) — name the file in "existingTestFile".
- Be honest about coverage status rather than presenting already-tested behavior as a gap that needs new work.`;

    if (directivesIndex) {
      promptText += `
- Check the diff against the Alt DRX Engineering Directives index below. If this scenario's code is at risk under one of these rules, set "riskRuleId" to its ID, "riskSeverity" to that rule's tier, and "riskExplanation" to one sentence on why THIS code is at risk. Leave "riskRuleId" unset if nothing clearly applies — do not force a match.

--- ALT DRX ENGINEERING DIRECTIVES INDEX (id — title: risk if violated) ---
${directivesIndex}
`;
    }

    promptText += `
--- EXISTING TEST FILES RELATED TO THE CHANGED FILES ---
${existingCoverageContext}

--- CODE DIFF ---
${diffContext}`;

    const result = await this.geminiAnalysisService.generateJson<{ scenarios: Array<Omit<TestScenario, 'id'>> }>(
      promptText,
      SCENARIOS_RESPONSE_SCHEMA
    );

    return (result.scenarios || []).map((s, idx) => ({
      id: idx + 1,
      title: s.title,
      description: s.description,
      targetFiles: s.targetFiles || [],
      coverageStatus: s.coverageStatus || 'new',
      existingTestFile: s.existingTestFile,
      riskRuleId: s.riskRuleId,
      riskSeverity: s.riskSeverity,
      riskExplanation: s.riskExplanation,
    }));
  }
}
