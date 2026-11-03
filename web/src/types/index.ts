export interface Repository {
  id: string;
  ssh: string;
  defaultBranch: string;
  isCloned: boolean;
  activeBranch?: string;
  currentCommit?: string;
  isSyncing?: boolean;
}

export interface SyncResult {
  success: boolean;
  skipped?: boolean;
  commitHash?: string;
  durationMs?: number;
  error?: string;
}

export interface BranchInfo {
  repoId: string;
  activeBranch: string;
  localBranches: string[];
  remoteBranches: string[];
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  parents: string[];
  isMerge: boolean;
  authorName: string;
  authorEmail: string;
  timestamp: string;
  date: string;
  message: string;
}

export interface PaginatedCommits {
  success: boolean;
  repoId: string;
  branch: string;
  commits: CommitInfo[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface DiffLine {
  type: 'ADDITION' | 'DELETION' | 'CONTEXT';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  type: 'ADDED' | 'DELETED' | 'MODIFIED' | 'RENAMED';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffSummary {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
}

export interface MergeCommitDetails {
  success: boolean;
  repoId: string;
  commitSha: string;
  shortSha: string;
  parentSha: string;
  parents?: string[];
  authorName: string;
  authorEmail: string;
  timestamp: string;
  message: string;
  summary: DiffSummary;
  files: FileDiff[];
}

export interface BranchComparisonDetails {
  success: boolean;
  repoId: string;
  baseBranch: string;
  compareBranch: string;
  baseSha: string;
  baseShortSha: string;
  compareSha: string;
  compareShortSha: string;
  mergeBaseSha: string;
  aheadBy: number;
  behindBy: number;
  summary: DiffSummary;
  files: FileDiff[];
}

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

export interface ToolExecutionResult {
  toolName: string;
  args: any;
  result: any;
  step: number;
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
  testWasRun: boolean;
  testPassed: boolean | null;
  parsedTestFile?: string;
  parsedDescription?: string;
  parsedRiskCategory?: string;
  parsedResultLabel?: string;
}

export interface ScenarioTestGeneratorResult {
  success: boolean;
  repoId: string;
  testBranch: string;
  testBranchCreated: boolean;
  committed: boolean;
  pushed: boolean;
  pushError?: string;
  scenarioResults: ScenarioRunResult[];
  createdFiles: string[];
  finalSummary: string;
  executionLogs: Array<{ command: string; exitCode: number; stdout: string; stderr: string }>;
  steps: ToolExecutionResult[];
}

export interface PRDData {
  repoId: string;
  commitSha: string;
  shortSha: string;
  authorName: string;
  commitMessage: string;
  prNumber?: string | null;
  summary: DiffSummary;
  prdMarkdown: string;
  createdAt: string;
  fromCache?: boolean;
  cachedOnBranch?: string;
  cachePath?: string;
}

export interface JobResult {
  jobId: string;
  jobName: string;
  success: boolean;
  durationMs: number;
  error?: { message: string; stack?: string };
  metadata?: Record<string, any>;
}

export interface SystemHealth {
  status: 'UP' | 'DOWN';
  service: string;
  version: string;
  timestamp: string;
}

