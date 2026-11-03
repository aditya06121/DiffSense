import React, { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Toolbar } from './components/layout/Toolbar';
import { TabNav, TabId } from './components/layout/TabNav';
import { CommitList } from './components/diff/CommitList';
import { BranchCompare } from './components/diff/BranchCompare';
import { FileTree } from './components/diff/FileTree';
import { DiffHeader } from './components/diff/DiffHeader';
import { DiffFileCard } from './components/diff/DiffFileCard';
import { ScenarioSelector } from './components/test-studio/ScenarioSelector';
import { TestReportView } from './components/test-studio/TestReportView';
import { PrdViewer } from './components/prd/PrdViewer';
import { JobMonitor } from './components/monitor/JobMonitor';
import { DirectivesViewer } from './components/directives/DirectivesViewer';
import { AddRepoModal } from './components/modals/AddRepoModal';
import { ActionModal } from './components/modals/ActionModal';
import { MarkdownViewer } from './components/common/MarkdownViewer';
import { SyncBanner } from './components/common/SyncBanner';
import { Toast, ToastMessage } from './components/common/Toast';
import { api } from './api/client';
import {
  Repository,
  CommitInfo,
  MergeCommitDetails,
  BranchComparisonDetails,
  TestScenario,
  ScenarioTestGeneratorResult,
  PRDData,
} from './types';
import {
  Loader2,
  AlertTriangle,
  FileDiff,
  Sparkles,
  Files,
  GitCommit,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  GitCompare,
  GitFork,
  X,
  RefreshCw,
} from 'lucide-react';

export const App: React.FC = () => {
  // Navigation & Repositories State
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<string>('');
  const [branches, setBranches] = useState<string[]>([]);
  const [activeBranch, setActiveBranch] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabId>('diff');

  // Collapsible Sections State
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isBranchCompareOpen, setIsBranchCompareOpen] = useState<boolean>(false);

  // Sidebar toggle mode: 'commits' | 'files'
  const [sidebarMode, setSidebarMode] = useState<'commits' | 'files'>('commits');

  // Commits & Diff State
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [selectedSha, setSelectedSha] = useState<string | null>(null);
  const [commitDiff, setCommitDiff] = useState<MergeCommitDetails | null>(null);
  const [branchDiff, setBranchDiff] = useState<BranchComparisonDetails | null>(null);
  const [activeComparison, setActiveComparison] = useState<{ base: string; compare: string } | null>(null);

  // File Tree & Card States
  const [activeFileIndex, setActiveFileIndex] = useState<number | null>(null);
  const [allFilesExpanded, setAllFilesExpanded] = useState<boolean>(true);

  // Loaders, Syncing & Notifications
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusText, setSyncStatusText] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isCommitsLoading, setIsCommitsLoading] = useState<boolean>(false);
  const [isLoadingMoreCommits, setIsLoadingMoreCommits] = useState<boolean>(false);
  const [commitsPage, setCommitsPage] = useState<number>(1);
  const [hasMoreCommits, setHasMoreCommits] = useState<boolean>(false);
  const [isDiffLoading, setIsDiffLoading] = useState<boolean>(false);
  const [isBranchDiffLoading, setIsBranchDiffLoading] = useState<boolean>(false);

  // Modals
  const [isAddRepoOpen, setIsAddRepoOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    subtitle?: string;
    content: React.ReactNode;
  }>({
    isOpen: false,
    title: '',
    content: null,
  });

  // Persistent Run Results (AI Test & PRD)
  const [latestAiTestResult, setLatestAiTestResult] = useState<ScenarioTestGeneratorResult | null>(null);
  const [latestPrdData, setLatestPrdData] = useState<PRDData | null>(null);
  const [isGeneratingTests, setIsGeneratingTests] = useState(false);
  const [commitCacheStatus, setCommitCacheStatus] = useState<{
    prd?: boolean;
    existingTests?: boolean;
    aiTests?: boolean;
    scenarios?: boolean;
  } | null>(null);

  // 1. Fetch Diff for a Commit
  const loadCommitDiff = useCallback(async (repoId: string, sha: string) => {
    setIsDiffLoading(true);
    setBranchDiff(null);
    setActiveComparison(null);
    setActiveFileIndex(null);

    try {
      const diff = await api.getCommitDiff(repoId, sha);
      setCommitDiff(diff);

      // Fetch cache status for this commit
      api.getCacheStatus(repoId, sha)
        .then((res) => {
          if (res && res.success) {
            setCommitCacheStatus(res.cached);
          } else {
            setCommitCacheStatus(null);
          }
        })
        .catch(() => setCommitCacheStatus(null));
    } catch (err: any) {
      console.error('Failed to load diff:', err);
      setCommitDiff(null);
      setCommitCacheStatus(null);
    } finally {
      setIsDiffLoading(false);
    }
  }, []);

  // 2. Fetch Commits for a Branch (with optional preservation of selected commit)
  const loadCommits = useCallback(async (repoId: string, branch: string, preserveSelectedSha?: string | null) => {
    setIsCommitsLoading(true);

    try {
      const res = await api.getCommits(repoId, branch);
      const newCommits = res.commits || [];
      setCommits(newCommits);
      setCommitsPage(1);
      setHasMoreCommits(res.hasMore);

      if (newCommits.length > 0) {
        const shaToSelect = (preserveSelectedSha && newCommits.some((c) => c.sha === preserveSelectedSha))
          ? preserveSelectedSha
          : newCommits[0].sha;
        setSelectedSha(shaToSelect);
        await loadCommitDiff(repoId, shaToSelect);
      } else {
        setSelectedSha(null);
        setCommitDiff(null);
      }
    } catch (err) {
      console.error('Failed to load commits:', err);
      setCommits([]);
      setHasMoreCommits(false);
      setSelectedSha(null);
      setCommitDiff(null);
    } finally {
      setIsCommitsLoading(false);
    }
  }, [loadCommitDiff]);

  // 2b. Fetch the next page of commits for the current repo/branch and append to the existing list
  const loadMoreCommits = useCallback(async () => {
    if (!activeRepoId || !activeBranch || isLoadingMoreCommits || !hasMoreCommits) return;
    setIsLoadingMoreCommits(true);

    try {
      const nextPage = commitsPage + 1;
      const res = await api.getCommits(activeRepoId, activeBranch, nextPage);
      setCommits((prev) => [...prev, ...(res.commits || [])]);
      setCommitsPage(nextPage);
      setHasMoreCommits(res.hasMore);
    } catch (err) {
      console.error('Failed to load more commits:', err);
    } finally {
      setIsLoadingMoreCommits(false);
    }
  }, [activeRepoId, activeBranch, commitsPage, hasMoreCommits, isLoadingMoreCommits]);

  // 3. Initialize repository branches and load initial commits
  const initRepoData = useCallback(async (repoId: string, preferredBranch?: string, preserveSha?: string | null) => {
    try {
      const branchData = await api.getBranches(repoId);
      const branchList = branchData.remoteBranches?.length
        ? branchData.remoteBranches
        : branchData.localBranches?.length
        ? branchData.localBranches
        : [preferredBranch || 'main'];

      const targetBranch =
        preferredBranch && branchList.includes(preferredBranch)
          ? preferredBranch
          : branchData.activeBranch && branchList.includes(branchData.activeBranch)
          ? branchData.activeBranch
          : branchList[0] || 'main';

      setBranches(branchList);
      setActiveBranch(targetBranch);
      await loadCommits(repoId, targetBranch, preserveSha);
    } catch (err) {
      console.warn('Failed to fetch branches, falling back to default:', err);
      const fallback = preferredBranch || 'main';
      setBranches([fallback]);
      setActiveBranch(fallback);
      await loadCommits(repoId, fallback, preserveSha);
    }
  }, [loadCommits]);

  // 4. Initial Load: Fetch Repositories list and select target
  const loadRepositories = useCallback(async (selectRepoId?: string) => {
    try {
      const repos = await api.getRepositories();
      setRepositories(repos);
      if (repos.length > 0) {
        const targetRepo =
          repos.find((r) => r.id === selectRepoId) ||
          (selectRepoId ? repos[0] : (repos.find((r) => r.id === activeRepoId) || repos[0]));

        setActiveRepoId(targetRepo.id);
        const preferredBranch = targetRepo.activeBranch || targetRepo.defaultBranch || 'main';
        await initRepoData(targetRepo.id, preferredBranch);
      }
    } catch (err: any) {
      console.error('Failed to load repositories:', err);
    }
  }, [activeRepoId, initRepoData]);

  useEffect(() => {
    loadRepositories();
  }, []);

  // When user selects a different repository from the dropdown
  const handleSelectRepo = async (repoId: string) => {
    setActiveRepoId(repoId);
    const targetRepo = repositories.find((r) => r.id === repoId);
    const preferredBranch = targetRepo?.activeBranch || targetRepo?.defaultBranch || 'main';
    await initRepoData(repoId, preferredBranch);
  };

  // 5. Fetch Branch Comparison Diff
  const handleCompareBranches = async (base: string, compare: string) => {
    setIsBranchDiffLoading(true);
    setCommitDiff(null);
    setSelectedSha(null);
    setActiveComparison({ base, compare });
    setActiveFileIndex(null);

    try {
      const diff = await api.getBranchComparison(activeRepoId, base, compare);
      setBranchDiff(diff);
      setSidebarMode('files'); // Switch to files tree when diffing branches
    } catch (err: any) {
      console.error('Failed to run branch comparison:', err);
      setBranchDiff(null);
    } finally {
      setIsBranchDiffLoading(false);
    }
  };

  // 6. Switch & Sync Branch
  const handleSwitchBranch = async (branch: string) => {
    setIsSyncing(true);
    setSyncStatusText(`Switching repository '${activeRepoId}' to branch '${branch}' & syncing from remote origin...`);
    try {
      await api.updateRepository(activeRepoId, { defaultBranch: branch });
      const res = await api.triggerSync(activeRepoId, branch);
      if (res && res.success === false) {
        throw new Error(res.error || 'Failed to switch and sync branch');
      }

      setActiveBranch(branch);
      setToast({
        id: Date.now().toString(),
        type: 'success',
        title: 'Switched & Synced Branch',
        message: `Now tracking '${branch}' on '${activeRepoId}'.`,
      });

      await initRepoData(activeRepoId, branch);
      api.getRepositories().then(setRepositories).catch(() => {});
    } catch (err: any) {
      console.error('Switch & sync failed:', err);
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Switch & Sync Failed',
        message: err.message || 'Failed to checkout and sync the specified branch.',
      });
    } finally {
      setIsSyncing(false);
      setSyncStatusText(undefined);
    }
  };

  // 7. Sync Current Repository
  const handleSyncCurrent = async () => {
    setIsSyncing(true);
    setSyncStatusText(`Fetching remote updates for '${activeRepoId}' on branch '${activeBranch}'...`);
    try {
      const res = await api.triggerSync(activeRepoId, activeBranch);
      if (res && res.success === false) {
        throw new Error(res.error || 'Failed to sync repository');
      }

      const durationStr = res?.durationMs ? `${(res.durationMs / 1000).toFixed(1)}s` : '';
      const commitShort = res?.commitHash ? res.commitHash.substring(0, 7) : '';

      setToast({
        id: Date.now().toString(),
        type: 'success',
        title: 'Repository Synced Successfully',
        message: `Synced '${activeRepoId}' (${activeBranch})${commitShort ? ` • HEAD is at ${commitShort}` : ''}${durationStr ? ` in ${durationStr}` : ''}`,
      });

      // Preserve currently selected commit if available
      await initRepoData(activeRepoId, activeBranch, selectedSha);
      api.getRepositories().then(setRepositories).catch(() => {});
    } catch (err: any) {
      console.error('Sync failed:', err);
      setToast({
        id: Date.now().toString(),
        type: 'error',
        title: 'Repository Sync Failed',
        message: err.message || 'An unexpected error occurred during repository sync.',
      });
    } finally {
      setIsSyncing(false);
      setSyncStatusText(undefined);
    }
  };

  // 8. AI Code Review Trigger
  const handleAiCodeReview = async () => {
    setModalConfig({
      isOpen: true,
      title: 'AI Code Review & Architecture Analysis',
      subtitle: activeComparison
        ? `Analyzing branch comparison: ${activeComparison.compare} → ${activeComparison.base}`
        : `Analyzing commit: ${selectedSha?.substring(0, 7)}`,
      content: (
        <div className="p-8 flex flex-col items-center justify-center gap-3 text-text-secondary text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-accent-purple" />
          <p className="font-semibold text-text-bright text-sm">Gemini AI is analyzing the code diff & patch changelog...</p>
          <span>Evaluating additions, modifications, deletions, and architectural risk assessment</span>
        </div>
      ),
    });

    try {
      let analysisText = '';
      if (activeComparison) {
        const res = await api.analyzeBranchComparison(activeRepoId, activeComparison.base, activeComparison.compare);
        analysisText = res.analysis;
      } else if (selectedSha) {
        const res = await api.analyzeCommit(activeRepoId, selectedSha);
        analysisText = res.analysis;
      }

      setModalConfig((prev) => ({
        ...prev,
        content: (
          <div className="max-h-[75vh] overflow-y-auto pr-1">
            <MarkdownViewer content={analysisText} />
          </div>
        ),
      }));
    } catch (err: any) {
      setModalConfig((prev) => ({
        ...prev,
        content: (
          <div className="p-6 bg-accent-rose/10 border border-accent-rose/30 rounded-xl text-accent-rose">
            <AlertTriangle className="w-5 h-5 mb-2" />
            <strong className="block font-bold text-sm">AI Analysis Failed</strong>
            <span>{err.message}</span>
          </div>
        ),
      }));
    }
  };

  // 9. Generate PRD Trigger
  const handleGeneratePrd = async (forceRefresh = false) => {
    if (!selectedSha) return;

    setModalConfig({
      isOpen: true,
      title: forceRefresh ? 'Force Regenerating PRD with AI' : 'Generate Product Requirement Document (PRD)',
      subtitle: `Analyzing commit: ${selectedSha.substring(0, 7)}`,
      content: (
        <div className="p-8 flex flex-col items-center justify-center gap-3 text-text-secondary text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-accent-cyan" />
          <p className="font-semibold text-text-bright text-sm">
            {forceRefresh ? 'Regenerating PRD & Technical Specification...' : 'Checking branch cache & generating PRD...'}
          </p>
          <span>Extracting user stories, architectural changes, API specs, and verification rollout plan</span>
        </div>
      ),
    });

    try {
      const prd = await api.generatePrd(activeRepoId, selectedSha, forceRefresh);
      setLatestPrdData(prd);
      setActiveTab('prd');
      setModalConfig({ isOpen: false, title: '', content: null });

      // Refresh cache state
      api.getCacheStatus(activeRepoId, selectedSha)
        .then((res) => setCommitCacheStatus(res?.success ? res.cached : null))
        .catch(() => {});
    } catch (err: any) {
      setModalConfig((prev) => ({
        ...prev,
        content: (
          <div className="p-6 bg-accent-rose/10 border border-accent-rose/30 rounded-xl text-accent-rose">
            <AlertTriangle className="w-5 h-5 mb-2" />
            <strong className="block font-bold text-sm">PRD Generation Failed</strong>
            <span>{err.message}</span>
          </div>
        ),
      }));
    }
  };

  // 10. Run Codebase Tests (Stage 1)
  const handleRunExistingTests = async (forceRefresh = false) => {
    setModalConfig({
      isOpen: true,
      title: forceRefresh ? 'Re-running Pre-existing Codebase Tests' : 'Stage 1: Pre-existing Codebase Test Execution',
      subtitle: activeComparison
        ? `Running tests for branch '${activeComparison.compare}'`
        : `Running tests for commit '${selectedSha?.substring(0, 7)}'`,
      content: (
        <div className="p-8 flex flex-col items-center justify-center gap-3 text-text-secondary text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-accent-cyan" />
          <p className="font-semibold text-text-bright text-sm">
            {forceRefresh ? 'Re-executing test suites cleanly...' : 'Detecting test runner & executing pre-existing tests...'}
          </p>
          <span>Checking Jest, Vitest, Flutter, Pytest suites impacted by changed files</span>
        </div>
      ),
    });

    try {
      let result: any;
      if (activeComparison) {
        result = await api.runExistingTestsBranch(activeRepoId, activeComparison.base, activeComparison.compare);
      } else if (selectedSha) {
        result = await api.runExistingTests(activeRepoId, selectedSha, forceRefresh);
        api.getCacheStatus(activeRepoId, selectedSha)
          .then((res) => setCommitCacheStatus(res?.success ? res.cached : null))
          .catch(() => {});
      }

      const isPassed =
        typeof result?.passed === 'boolean'
          ? result.passed
          : result?.executionLogs && result.executionLogs.length > 0
          ? result.executionLogs.every((l: any) => l.exitCode === 0)
          : result?.steps && result.steps.length > 0
          ? result.steps.every((s: any) => s.result?.status === 'PASSED' || s.result?.exitCode === 0)
          : true;

      const badgeLabel = result?.fromCache
        ? isPassed
          ? 'CACHED PASS'
          : 'CACHED FAILED'
        : isPassed
        ? 'PASSED'
        : 'FAILED';

      const badgeColor = isPassed
        ? 'bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30'
        : 'bg-accent-rose/20 text-accent-rose border border-accent-rose/30';

      const logsToRender =
        result?.executionLogs && result.executionLogs.length > 0
          ? result.executionLogs
          : result?.testExecution
          ? [result.testExecution]
          : (result?.steps || [])
              .filter((s: any) => s.args?.command || s.result)
              .map((s: any) => ({
                command: s.args?.command || s.toolName,
                exitCode: s.result?.exitCode ?? (s.result?.status === 'FAILED' ? 1 : 0),
                stdout: s.result?.stdout || '',
                stderr: s.result?.stderr || '',
              }));

      setModalConfig((prev) => ({
        ...prev,
        content: (
          <div className="flex flex-col gap-4 text-xs">
            <div className="p-4 rounded-xl bg-bg-card border border-border-subtle flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <strong className="text-text-bright text-sm">Framework: {result?.runner || 'Detected'}</strong>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${badgeColor}`}>
                    {badgeLabel}
                  </span>
                </div>
                <p className="text-text-secondary mt-0.5">
                  {result?.fromCache
                    ? `⚡ Loaded from branch cache (${isPassed ? 'All tests passed' : 'Test run failed'})`
                    : isPassed
                    ? 'All targeted codebase tests passed'
                    : 'Codebase test suite encountered errors'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleRunExistingTests(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-panel hover:bg-accent-indigo/20 border border-border-subtle hover:border-border-glow text-text-primary hover:text-text-bright transition-all shadow-sm text-xs font-medium"
                title="Bypass cache and force re-run test suite on codebase"
              >
                <RefreshCw className="w-3.5 h-3.5 text-accent-cyan" />
                <span>Force Re-run</span>
              </button>
            </div>

            {/* AI Summary Section if present */}
            {result?.finalSummary && (
              <div className="flex flex-col gap-1.5">
                <span className="font-bold text-text-bright text-xs">AI Execution Analysis</span>
                <MarkdownViewer content={result.finalSummary} />
              </div>
            )}

            {/* Execution Logs */}
            {logsToRender.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <span className="font-bold text-text-bright text-xs">Command Execution Logs</span>
                {logsToRender.map((log: any, idx: number) => {
                  const logPassed = log.exitCode === 0;
                  return (
                    <div key={idx} className="rounded-xl overflow-hidden border border-border-subtle bg-bg-card shadow-sm">
                      <div className="px-4 py-2 bg-bg-header/50 border-b border-border-subtle text-text-secondary flex items-center justify-between">
                        <span className="truncate font-mono text-[11px] font-semibold text-text-bright">
                          $ {log.command}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            logPassed
                              ? 'bg-accent-emerald/20 text-accent-emerald'
                              : 'bg-accent-rose/20 text-accent-rose'
                          }`}
                        >
                          exit {log.exitCode}
                        </span>
                      </div>
                      <pre
                        className={`p-4 max-h-72 overflow-y-auto text-[11px] font-mono whitespace-pre-wrap leading-relaxed ${
                          logPassed ? 'text-emerald-200/90' : 'text-rose-200/90'
                        }`}
                      >
                        {log.stdout
                          ? log.stdout + (log.stderr ? '\n' + log.stderr : '')
                          : log.stderr || '(No output recorded)'}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ),
      }));
    } catch (err: any) {
      setModalConfig((prev) => ({
        ...prev,
        content: (
          <div className="p-6 bg-accent-rose/10 border border-accent-rose/30 rounded-xl text-accent-rose">
            <AlertTriangle className="w-5 h-5 mb-2" />
            <strong className="block font-bold text-sm">Codebase Test Run Failed</strong>
            <span>{err.message}</span>
          </div>
        ),
      }));
    }
  };

  // 11. Generate AI Tests (Stage 2)
  const handleGenerateAiTests = async (forceRefresh = false) => {
    const testBranch = activeComparison ? `${activeComparison.compare}-tests` : `${activeBranch}-tests`;

    setModalConfig({
      isOpen: true,
      title: forceRefresh ? 'Force Proposing Fresh AI Scenarios' : 'Stage 2: AI Unit Test Generator & Verification',
      subtitle: `Proposing candidate scenarios for ${testBranch}`,
      content: (
        <div className="p-8 flex flex-col items-center justify-center gap-3 text-text-secondary text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-accent-emerald" />
          <p className="font-semibold text-text-bright text-sm">AI Agent is analyzing AST symbols & proposing test scenarios...</p>
          <span>Scanning changed classes, functions, and cross-referencing Alt DRX architecture rules</span>
        </div>
      ),
    });

    try {
      let scenarios: TestScenario[] = [];
      if (activeComparison) {
        scenarios = await api.getTestScenariosBranch(activeRepoId, activeComparison.base, activeComparison.compare);
      } else if (selectedSha) {
        scenarios = await api.getTestScenarios(activeRepoId, selectedSha, forceRefresh);
      }

      setModalConfig((prev) => ({
        ...prev,
        title: `Select Test Scenarios (${scenarios.length})`,
        subtitle: `Scenarios for branch: ${testBranch}`,
        content: (
          <ScenarioSelector
            scenarios={scenarios}
            testBranch={testBranch}
            isGenerating={isGeneratingTests}
            onConfirm={async (selected) => {
              setIsGeneratingTests(true);
              setModalConfig({
                isOpen: true,
                title: 'Executing AI Autonomous Test Agent',
                subtitle: `Writing tests and verifying on '${testBranch}'`,
                content: (
                  <div className="p-8 flex flex-col items-center justify-center gap-3 text-text-secondary text-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-accent-emerald" />
                    <p className="font-semibold text-text-bright text-sm">
                      Agent is writing tests for {selected.length} scenario(s) & executing them...
                    </p>
                    <span>Branching to '{testBranch}', synthesizing test cases with AST mocks, and committing</span>
                  </div>
                ),
              });

              try {
                let testResult: ScenarioTestGeneratorResult;
                if (activeComparison) {
                  testResult = await api.generateTestsBranch(
                    activeRepoId,
                    activeComparison.base,
                    activeComparison.compare,
                    selected
                  );
                } else if (selectedSha) {
                  testResult = await api.generateTests(
                    activeRepoId,
                    selectedSha,
                    activeBranch,
                    selected,
                    forceRefresh
                  );
                  api.getCacheStatus(activeRepoId, selectedSha)
                    .then((res) => setCommitCacheStatus(res?.success ? res.cached : null))
                    .catch(() => {});
                } else {
                  throw new Error('No target selected.');
                }

                setLatestAiTestResult(testResult);
                setActiveTab('studio');
                setModalConfig({ isOpen: false, title: '', content: null });
              } catch (err: any) {
                setModalConfig((prev) => ({
                  ...prev,
                  content: (
                    <div className="p-6 bg-accent-rose/10 border border-accent-rose/30 rounded-xl text-accent-rose">
                      <AlertTriangle className="w-5 h-5 mb-2" />
                      <strong className="block font-bold text-sm">Test Generation Failed</strong>
                      <span>{err.message}</span>
                    </div>
                  ),
                }));
              } finally {
                setIsGeneratingTests(false);
              }
            }}
          />
        ),
      }));
    } catch (err: any) {
      setModalConfig((prev) => ({
        ...prev,
        content: (
          <div className="p-6 bg-accent-rose/10 border border-accent-rose/30 rounded-xl text-accent-rose">
            <AlertTriangle className="w-5 h-5 mb-2" />
            <strong className="block font-bold text-sm">Failed to Propose Test Scenarios</strong>
            <span>{err.message}</span>
          </div>
        ),
      }));
    }
  };

  // Scroll to file card when selected
  const handleSelectFile = (index: number) => {
    setActiveFileIndex(index);
    const element = document.getElementById(`diff-file-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const currentDiff = branchDiff || commitDiff;
  const files = currentDiff?.files || [];

  return (
    <div className="h-screen w-screen bg-bg-primary text-text-primary flex flex-col overflow-hidden">
      {/* Top Main Container */}
      <div className="max-w-[1680px] w-full mx-auto p-3 sm:p-3.5 flex flex-col gap-2.5 h-full overflow-hidden">
        {/* Pinned Top Navigation Section (Collapsible) */}
        {isHeaderCollapsed ? (
          <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-bg-panel border border-border-subtle rounded-xl text-xs shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 font-bold text-text-bright">
                <GitFork className="w-4 h-4 text-accent-cyan" />
                <span>{activeRepoId || 'Repository'}</span>
              </div>
              <span className="text-text-muted">&bull;</span>
              <code className="text-[11px] font-mono text-accent-cyan bg-bg-card px-2 py-0.5 rounded border border-border-subtle">
                {activeBranch}
              </code>
            </div>

            <div className="flex items-center gap-2">
              <TabNav
                activeTab={activeTab}
                onSelectTab={setActiveTab}
                hasActiveTestRun={!!latestAiTestResult}
                hasActivePrd={!!latestPrdData}
              />
              <button
                onClick={() => setIsHeaderCollapsed(false)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-bg-card border border-border-subtle hover:border-border-glow text-text-secondary hover:text-text-bright transition-all text-xs"
                title="Expand full navigation header"
              >
                <ChevronDown className="w-3.5 h-3.5 text-accent-cyan" />
                <span>Expand Header</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 flex flex-col gap-2">
            <Navbar
              onOpenAddModal={() => setIsAddRepoOpen(true)}
              onRefreshAll={handleSyncCurrent}
              onToggleCollapse={() => setIsHeaderCollapsed(true)}
              isSyncing={isSyncing}
            />
            <Toolbar
              repositories={repositories}
              activeRepoId={activeRepoId}
              onSelectRepo={handleSelectRepo}
              branches={branches}
              activeBranch={activeBranch}
              onSwitchBranch={handleSwitchBranch}
              onSyncCurrent={handleSyncCurrent}
              isSyncing={isSyncing}
            />
            <TabNav
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              hasActiveTestRun={!!latestAiTestResult}
              hasActivePrd={!!latestPrdData}
            />
          </div>
        )}

        {/* Sync Progress Banner */}
        <SyncBanner
          isSyncing={isSyncing}
          repoId={activeRepoId}
          branch={activeBranch}
          statusText={syncStatusText}
        />

        {/* Main Tab Views */}
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* TAB 1: DIFF EXPLORER */}
          {activeTab === 'diff' && (
            <div className="flex flex-col gap-2.5 flex-1 min-h-0 overflow-hidden">
              {/* Branch Compare Selector Bar (Collapsible) */}
              {isBranchCompareOpen && (
                <div className="shrink-0 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <BranchCompare
                      branches={branches}
                      activeBranch={activeBranch}
                      defaultBranch={repositories.find((r) => r.id === activeRepoId)?.defaultBranch}
                      onCompare={handleCompareBranches}
                      isLoading={isBranchDiffLoading}
                      activeComparison={activeComparison}
                    />
                  </div>
                  <button
                    onClick={() => setIsBranchCompareOpen(false)}
                    className="p-2 rounded-xl bg-bg-panel border border-border-subtle text-text-muted hover:text-text-bright hover:bg-bg-card transition-colors shrink-0"
                    title="Close Branch Compare Bar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* 2-Column Responsive Layout: Left Sidebar (Commits or Files) | Right Main Diff Panel */}
              <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0 overflow-hidden">
                {/* Left Sidebar (350px or collapsed to 44px) */}
                {isSidebarCollapsed ? (
                  <div className="w-11 shrink-0 bg-bg-panel border border-border-subtle rounded-xl flex flex-col items-center py-2.5 gap-2.5 shadow-md h-full select-none">
                    <button
                      onClick={() => setIsSidebarCollapsed(false)}
                      className="p-2 rounded-lg bg-bg-card hover:bg-accent-indigo/20 text-accent-cyan hover:text-text-bright transition-colors"
                      title="Expand Sidebar (Commits & Files)"
                    >
                      <PanelLeftOpen className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => {
                        setSidebarMode('commits');
                        setIsSidebarCollapsed(false);
                      }}
                      className="writing-vertical-lr text-[11px] font-semibold text-text-secondary hover:text-text-bright tracking-wider flex items-center gap-1.5 py-2 hover:bg-bg-card/60 rounded transition-colors"
                      title="View Commits"
                    >
                      <GitCommit className="w-3.5 h-3.5 text-accent-cyan shrink-0 -rotate-90" />
                      <span>COMMITS ({commits.length})</span>
                    </button>

                    <div className="w-5 h-px bg-border-subtle my-1" />

                    <button
                      onClick={() => {
                        setSidebarMode('files');
                        setIsSidebarCollapsed(false);
                      }}
                      className="writing-vertical-lr text-[11px] font-semibold text-text-secondary hover:text-text-bright tracking-wider flex items-center gap-1.5 py-2 hover:bg-bg-card/60 rounded transition-colors"
                      title="View Changed Files"
                    >
                      <Files className="w-3.5 h-3.5 text-accent-indigo shrink-0 -rotate-90" />
                      <span>FILES ({files.length})</span>
                    </button>
                  </div>
                ) : (
                  <div className="w-full lg:w-[350px] shrink-0 flex flex-col gap-2 h-full overflow-hidden transition-all">
                    {/* Mode switcher tabs: Commits vs Files + Collapse Button */}
                    <div className="shrink-0 flex items-center gap-1 p-1 bg-bg-panel border border-border-subtle rounded-xl text-xs font-semibold">
                      <button
                        onClick={() => setSidebarMode('commits')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                          sidebarMode === 'commits'
                            ? 'bg-accent-indigo text-white shadow-sm'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <GitCommit className="w-3.5 h-3.5" />
                        <span>Commits ({commits.length})</span>
                      </button>
                      <button
                        onClick={() => setSidebarMode('files')}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                          sidebarMode === 'files'
                            ? 'bg-accent-indigo text-white shadow-sm'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <Files className="w-3.5 h-3.5" />
                        <span>Files ({files.length})</span>
                      </button>

                      {/* Collapse Sidebar Button */}
                      <button
                        onClick={() => setIsSidebarCollapsed(true)}
                        className="p-1.5 rounded-lg text-text-muted hover:text-text-bright hover:bg-bg-card transition-colors"
                        title="Collapse Sidebar (Maximize Diff Width)"
                      >
                        <PanelLeftClose className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Sidebar Content (Independent Inner Scroll) */}
                    <div className="flex-1 min-h-0 overflow-hidden">
                      {sidebarMode === 'commits' ? (
                        <CommitList
                          commits={commits}
                          selectedSha={selectedSha}
                          onSelectCommit={(sha) => {
                            setSelectedSha(sha);
                            loadCommitDiff(activeRepoId, sha);
                          }}
                          isLoading={isCommitsLoading}
                          activeBranch={activeBranch}
                          repoSsh={repositories.find((r) => r.id === activeRepoId)?.ssh}
                          isSyncing={isSyncing}
                          hasMore={hasMoreCommits}
                          isLoadingMore={isLoadingMoreCommits}
                          onLoadMore={loadMoreCommits}
                        />
                      ) : (
                        <FileTree
                          files={files}
                          activeFileIndex={activeFileIndex}
                          onSelectFile={handleSelectFile}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Right Main Diff Panel (Full remaining width!) */}
                <div className="flex-1 min-w-0 flex flex-col gap-2.5 h-full overflow-hidden">
                  {isDiffLoading || isBranchDiffLoading ? (
                    <div className="p-16 flex flex-col items-center justify-center gap-3 bg-bg-panel border border-border-subtle rounded-xl text-text-muted text-xs">
                      <Loader2 className="w-8 h-8 animate-spin text-accent-cyan" />
                      <span className="font-semibold text-text-bright text-sm">Loading code diff patch & hunks...</span>
                      <span>Calculating cumulative line changes against parent revision</span>
                    </div>
                  ) : currentDiff ? (
                    <>
                      {/* Pinned Diff Header */}
                      <div className="shrink-0">
                        <DiffHeader
                          title={
                            branchDiff
                              ? `Branch Comparison: ${branchDiff.compareBranch} → ${branchDiff.baseBranch}`
                              : commitDiff?.message || 'Diff Inspector'
                          }
                          subtitle={
                            branchDiff
                              ? `${branchDiff.compareShortSha} vs ${branchDiff.baseShortSha} (${branchDiff.aheadBy} ahead, ${branchDiff.behindBy} behind)`
                              : `Commit ${commitDiff?.shortSha} (vs ${commitDiff?.parentSha}) by ${commitDiff?.authorName}`
                          }
                          badgeLabel={branchDiff ? 'Branch Diff' : 'First-Parent Diff'}
                          summary={currentDiff.summary}
                          rawMessage={commitDiff?.message}
                          commitSha={commitDiff?.commitSha}
                          shortSha={commitDiff?.shortSha}
                          parentSha={commitDiff?.parentSha}
                          parents={commitDiff?.parents}
                          authorName={commitDiff?.authorName}
                          timestamp={commitDiff?.timestamp}
                          isBranchDiff={!!branchDiff}
                          branchInfo={
                            branchDiff
                              ? {
                                  base: branchDiff.baseBranch,
                                  compare: branchDiff.compareBranch,
                                  aheadBy: branchDiff.aheadBy,
                                  behindBy: branchDiff.behindBy,
                                }
                              : undefined
                          }
                          repoSsh={repositories.find((r) => r.id === activeRepoId)?.ssh}
                          cacheStatus={commitCacheStatus || undefined}
                          isSyncing={isSyncing}
                          onAiReview={handleAiCodeReview}
                          onGeneratePrd={!branchDiff ? handleGeneratePrd : undefined}
                          onRunExistingTests={handleRunExistingTests}
                          onGenerateTests={handleGenerateAiTests}
                          allExpanded={allFilesExpanded}
                          onToggleAllFiles={() => setAllFilesExpanded(!allFilesExpanded)}
                        />
                      </div>

                      {/* Pinned Quick Jump to File Dropdown Bar */}
                      <div className="shrink-0 flex items-center justify-between gap-2.5 px-4 py-2 bg-bg-panel border border-border-subtle rounded-xl text-xs flex-wrap">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="font-semibold text-text-secondary shrink-0">Jump to File:</span>
                          <select
                            value={activeFileIndex ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val !== '') handleSelectFile(parseInt(val, 10));
                            }}
                            className="bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1 text-text-bright font-mono text-xs focus:outline-none focus:border-border-glow cursor-pointer truncate max-w-xl"
                          >
                            <option value="">Select file to scroll into view ({files.length})...</option>
                            {files.map((f, idx) => (
                              <option key={idx} value={idx}>
                                [{f.type[0]}] {f.newPath || f.oldPath} (+{f.additions} -{f.deletions})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Toggle Branch Compare Bar */}
                          <button
                            onClick={() => setIsBranchCompareOpen(!isBranchCompareOpen)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors ${
                              isBranchCompareOpen || activeComparison
                                ? 'bg-accent-purple/20 border-accent-purple/40 text-purple-300'
                                : 'bg-bg-card border-border-subtle text-text-secondary hover:text-text-bright hover:border-border-glow'
                            }`}
                            title="Toggle Branch Compare Bar"
                          >
                            <GitCompare className="w-3.5 h-3.5 text-accent-purple" />
                            <span>Compare Branches</span>
                          </button>

                          {/* Toggle Sidebar Collapse */}
                          <button
                            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bg-card border border-border-subtle hover:border-border-glow text-text-secondary hover:text-text-bright transition-colors text-[11px]"
                            title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar (Maximize Diff)"}
                          >
                            {isSidebarCollapsed ? (
                              <PanelLeftOpen className="w-3.5 h-3.5 text-accent-cyan" />
                            ) : (
                              <PanelLeftClose className="w-3.5 h-3.5 text-accent-cyan" />
                            )}
                            <span>{isSidebarCollapsed ? 'Show Sidebar' : 'Hide Sidebar'}</span>
                          </button>

                          {/* Toggle Files / Commits in Sidebar */}
                          {!isSidebarCollapsed && (
                            <button
                              onClick={() => setSidebarMode(sidebarMode === 'files' ? 'commits' : 'files')}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bg-card border border-border-subtle hover:border-border-glow text-text-secondary hover:text-text-bright transition-colors text-[11px]"
                            >
                              <Files className="w-3.5 h-3.5 text-accent-indigo" />
                              <span>{sidebarMode === 'files' ? 'Commits' : `Files (${files.length})`}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Diff File Cards Scroll Area - ONLY THIS SCROLLS */}
                      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
                        {files.length === 0 ? (
                          <div className="p-12 text-center bg-bg-panel border border-border-subtle rounded-xl text-text-muted text-xs">
                            No file changes found in this diff.
                          </div>
                        ) : (
                          files.map((f, idx) => (
                            <DiffFileCard
                              key={idx}
                              file={f}
                              fileIndex={idx}
                              isExpanded={allFilesExpanded}
                            />
                          ))
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-16 flex flex-col items-center justify-center gap-3 bg-bg-panel border border-border-subtle rounded-xl text-text-muted text-xs text-center">
                      <FileDiff className="w-12 h-12 text-accent-indigo opacity-70" />
                      <p className="font-semibold text-text-bright text-base">Select a Commit or Run Branch Comparison</p>
                      <span className="max-w-md text-text-secondary">
                        Click on any merge or feature commit on the left or use the branch comparison bar above to inspect cumulative code changes.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AI TEST STUDIO */}
          {activeTab === 'studio' && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {latestAiTestResult ? (
                <TestReportView report={latestAiTestResult} />
              ) : (
                <div className="p-16 flex flex-col items-center justify-center gap-3 bg-bg-panel border border-border-subtle rounded-xl text-text-muted text-xs text-center">
                  <Sparkles className="w-10 h-10 text-accent-emerald opacity-70" />
                  <h3 className="text-base font-bold text-text-bright">No AI Test Generation Run Yet</h3>
                  <p className="max-w-md text-text-secondary leading-relaxed">
                    Navigate to the <strong>Diff Explorer</strong> tab and click <strong>"✍️ Generate AI Tests"</strong> on any commit or branch comparison to propose scenarios, generate unit tests, and verify execution logs here.
                  </p>
                  <button
                    onClick={() => setActiveTab('diff')}
                    className="mt-2 px-4 py-2 rounded-lg bg-accent-indigo text-white font-semibold text-xs shadow-sm hover:bg-accent-indigo/90 transition-colors"
                  >
                    Go to Diff Explorer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PRD & SPEC VIEWER */}
          {activeTab === 'prd' && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {latestPrdData ? (
                <PrdViewer prd={latestPrdData} />
              ) : (
                <div className="p-16 flex flex-col items-center justify-center gap-3 bg-bg-panel border border-border-subtle rounded-xl text-text-muted text-xs text-center">
                  <FileDiff className="w-10 h-10 text-accent-cyan opacity-70" />
                  <h3 className="text-base font-bold text-text-bright">No PRD Document Generated Yet</h3>
                  <p className="max-w-md text-text-secondary leading-relaxed">
                    Open a commit in the <strong>Diff Explorer</strong> tab and click <strong>"📄 Generate PRD"</strong> to synthesize user stories, architecture modifications, and formal technical specs with PDF download.
                  </p>
                  <button
                    onClick={() => setActiveTab('diff')}
                    className="mt-2 px-4 py-2 rounded-lg bg-accent-indigo text-white font-semibold text-xs shadow-sm hover:bg-accent-indigo/90 transition-colors"
                  >
                    Go to Diff Explorer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ENGINE & JOB MONITOR */}
          {activeTab === 'monitor' && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <JobMonitor repositories={repositories} />
            </div>
          )}

          {/* TAB 5: ENGINEERING DIRECTIVES */}
          {activeTab === 'directives' && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <DirectivesViewer />
            </div>
          )}
        </main>
      </div>

      {/* Add Repository Modal */}
      <AddRepoModal
        isOpen={isAddRepoOpen}
        onClose={() => setIsAddRepoOpen(false)}
        onSuccess={() => loadRepositories()}
      />

      {/* Reusable Action Modal (AI reviews, test selectors, etc.) */}
      <ActionModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ isOpen: false, title: '', content: null })}
        title={modalConfig.title}
        subtitle={modalConfig.subtitle}
      >
        {modalConfig.content}
      </ActionModal>

      {/* Floating Notifications Toast */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};
