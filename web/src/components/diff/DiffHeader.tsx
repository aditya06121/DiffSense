import React, { useState } from 'react';
import {
  Sparkles,
  FileText,
  PlayCircle,
  Beaker,
  Files,
  Plus,
  Minus,
  FoldVertical,
  UnfoldVertical,
  ChevronUp,
  ChevronDown,
  Rocket,
  GitBranch,
  Tag,
  CheckCircle2,
  GitCommit,
  ArrowLeft,
  Calendar,
  User,
  ExternalLink,
  Zap,
  RotateCw,
} from 'lucide-react';
import { DiffSummary } from '../../types';
import { parseCommitMeta, getRepoWebUrls } from '../../utils/commitParser';

interface DiffHeaderProps {
  title: string;
  subtitle: string;
  badgeLabel: string;
  summary: DiffSummary;
  rawMessage?: string;
  commitSha?: string;
  shortSha?: string;
  parentSha?: string;
  parents?: string[];
  authorName?: string;
  timestamp?: string;
  isBranchDiff?: boolean;
  branchInfo?: { base: string; compare: string; aheadBy: number; behindBy: number };
  repoSsh?: string;
  cacheStatus?: {
    prd?: boolean;
    existingTests?: boolean;
    aiTests?: boolean;
    scenarios?: boolean;
  };
  isSyncing?: boolean;
  onAiReview: () => void;
  onGeneratePrd?: (forceRefresh?: boolean) => void;
  onRunExistingTests: (forceRefresh?: boolean) => void;
  onGenerateTests: (forceRefresh?: boolean) => void;
  allExpanded: boolean;
  onToggleAllFiles: () => void;
}

export const DiffHeader: React.FC<DiffHeaderProps> = ({
  title,
  subtitle,
  badgeLabel,
  summary,
  rawMessage,
  commitSha,
  shortSha,
  parentSha,
  parents,
  authorName,
  timestamp,
  isBranchDiff,
  branchInfo,
  repoSsh,
  cacheStatus,
  isSyncing = false,
  onAiReview,
  onGeneratePrd,
  onRunExistingTests,
  onGenerateTests,
  allExpanded,
  onToggleAllFiles,
}) => {
  const [isCompact, setIsCompact] = useState(false);
  const [showFullBody, setShowFullBody] = useState(false);

  // Parse rich merge & ticket metadata if a commit message exists
  const meta = rawMessage
    ? parseCommitMeta(rawMessage, (parents && parents.length > 1) || false, parents?.length || 1)
    : null;

  const isMainMerge = meta?.tier === 'pr-merge';
  const webUrls = getRepoWebUrls(repoSsh);
  const prUrl = webUrls.getPrUrl(meta?.prNumber);
  const commitUrl = webUrls.getCommitUrl(commitSha);

  return (
    <div
      className={`flex flex-col gap-2.5 p-3.5 bg-bg-panel border rounded-xl shadow-md transition-all ${
        isMainMerge
          ? 'border-accent-cyan/40 bg-gradient-to-br from-bg-panel via-accent-cyan/[0.04] to-bg-panel'
          : 'border-border-subtle'
      }`}
    >
      {/* ========================================================================= */}
      {/* TOP ROW: TITLE & BADGES (RICH MERGE INFO WHEN APPLICABLE)                 */}
      {/* ========================================================================= */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          {/* PR / Branch / Commit Header Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {isBranchDiff ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-purple/20 text-purple-300 border border-accent-purple/40">
                <GitBranch className="w-3 h-3" />
                <span>Branch Comparison</span>
              </span>
            ) : isMainMerge ? (
              <>
                {prUrl ? (
                  <a
                    href={prUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40 hover:bg-accent-cyan/30 hover:border-accent-cyan/60 transition-all shadow-xs"
                    title="Open Pull Request on Bitbucket / Git host"
                  >
                    <Rocket className="w-3 h-3" />
                    <span>{meta?.prNumber ? `Pull Request #${meta.prNumber}` : 'PR Merge'}</span>
                    <ExternalLink className="w-2.5 h-2.5 opacity-80" />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40 shadow-xs">
                    <Rocket className="w-3 h-3" />
                    <span>{meta?.prNumber ? `Pull Request #${meta.prNumber}` : 'PR Merge'}</span>
                  </span>
                )}
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-indigo/20 text-accent-indigo border border-accent-indigo/30">
                  First-Parent Cumulative Diff
                </span>
              </>
            ) : (
              commitUrl ? (
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg-card hover:bg-accent-cyan/15 text-text-secondary hover:text-accent-cyan border border-border-subtle transition-colors"
                  title="View commit on Bitbucket / Git host"
                >
                  <GitCommit className="w-3 h-3 text-text-muted" />
                  <span>Commit {shortSha || badgeLabel}</span>
                  <ExternalLink className="w-2.5 h-2.5 opacity-80" />
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg-card text-text-secondary border border-border-subtle">
                  <GitCommit className="w-3 h-3 text-text-muted" />
                  <span>Commit {shortSha || badgeLabel}</span>
                </span>
              )
            )}

            {/* Ticket badges */}
            {meta?.ticketIds.map((ticket) => (
              <span
                key={ticket}
                className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono"
              >
                <Tag className="w-2.5 h-2.5" />
                <span>{ticket}</span>
              </span>
            ))}

            {/* Approver badge */}
            {meta?.approvedBy.map((approver) => (
              <span
                key={approver}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>Approved by {approver}</span>
              </span>
            ))}
          </div>

          {/* Clean Main Title */}
          <div className="flex items-center gap-2 mt-0.5">
            <h2 className="text-sm font-bold text-text-bright tracking-tight leading-snug" title={commitSha || title}>
              {meta ? meta.cleanTitle : title}
            </h2>
            <button
              onClick={() => setIsCompact(!isCompact)}
              className="p-1 rounded-md hover:bg-bg-card text-text-muted hover:text-text-bright transition-colors shrink-0"
              title={isCompact ? 'Show Full Commit Details' : 'Compact View'}
            >
              {isCompact ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          </div>
          {!meta && subtitle && (
            <div className="text-xs text-text-secondary mt-0.5 truncate">{subtitle}</div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FIRST-PARENT INSPECTOR & METADATA DETAILS (UNFOLDED IN NON-COMPACT MODE) */}
      {/* ========================================================================= */}
      {!isCompact && (
        <div className="flex flex-col gap-2 pt-1 border-t border-border-subtle/40 text-xs">
          {/* First-Parent Technical Diff Breakdown */}
          {shortSha && parentSha && !isBranchDiff && (
            <div className="flex items-center justify-between gap-3 px-3 py-1.5 bg-bg-primary/80 border border-border-subtle/80 rounded-lg font-mono text-[11px] flex-wrap">
              <div className="flex items-center gap-2 text-text-secondary">
                <span className="text-text-muted">Target HEAD:</span>
                <code className="text-accent-cyan font-bold bg-bg-card px-1.5 py-0.2 rounded border border-border-subtle">
                  {shortSha}
                </code>
                <span className="text-text-muted flex items-center gap-1">
                  <ArrowLeft className="w-3 h-3 text-accent-cyan" /> comparing against 1st parent baseline:
                </span>
                <code className="text-text-bright font-bold bg-bg-card px-1.5 py-0.2 rounded border border-border-subtle">
                  {parentSha}
                </code>
              </div>

              {parents && parents.length > 1 && (
                <div className="flex items-center gap-2 text-[10px] text-text-muted">
                  <span>Parent 1 (Base): {parents[0].substring(0, 7)}</span>
                  <span>&bull;</span>
                  <span>Parent 2 (PR Head): {parents[1].substring(0, 7)}</span>
                </div>
              )}
            </div>
          )}

          {/* Branch Comparison Info Bar */}
          {isBranchDiff && branchInfo && (
            <div className="flex items-center gap-3 px-3 py-1.5 bg-bg-primary/80 border border-border-subtle/80 rounded-lg text-[11px] font-mono text-text-secondary">
              <span>
                Comparing <strong className="text-text-bright">{branchInfo.compare}</strong> into{' '}
                <strong className="text-accent-cyan">{branchInfo.base}</strong>
              </span>
              <span>&bull;</span>
              <span className="text-accent-emerald font-semibold">{branchInfo.aheadBy} commits ahead</span>
              <span>&bull;</span>
              <span className="text-accent-rose font-semibold">{branchInfo.behindBy} commits behind</span>
            </div>
          )}

          {/* Metadata Row: Source Branch, Author, Date */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
            {meta?.sourceBranch && (
              <span className="flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-accent-cyan" />
                <span>Source Branch:</span>
                <code className="text-text-bright font-mono bg-bg-card px-1.5 py-0.2 rounded border border-border-subtle">
                  {meta.sourceBranch}
                </code>
              </span>
            )}

            {authorName && (
              <span className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-text-muted" />
                <span className="text-text-bright font-medium">{authorName}</span>
              </span>
            )}

            {timestamp && (
              <span className="flex items-center gap-1.5 text-text-muted">
                <Calendar className="w-3.5 h-3.5" />
                <span>{new Date(timestamp).toLocaleString()}</span>
              </span>
            )}

            {meta?.body && (
              <button
                onClick={() => setShowFullBody(!showFullBody)}
                className="text-[11px] text-accent-cyan hover:underline ml-auto font-medium"
              >
                {showFullBody ? 'Hide PR message body' : 'View full PR message'}
              </button>
            )}
          </div>

          {/* Optional: Full Commit / PR Message Body */}
          {showFullBody && meta?.body && (
            <div className="p-2.5 bg-bg-primary border border-border-subtle rounded-lg text-xs font-mono text-text-secondary whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
              {meta.body}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* BOTTOM ROW: STATISTICS COUNTERS & ACTION BUTTONS                          */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border-subtle/50 text-xs">
        {/* Diff Stats Counter */}
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <Files className="w-3.5 h-3.5 text-accent-cyan" />
            <strong className="text-text-bright">{summary.totalFiles}</strong> files changed
          </span>
          <span className="flex items-center gap-0.5 text-accent-emerald font-bold">
            <Plus className="w-3 h-3" />
            {summary.totalAdditions}
          </span>
          <span className="flex items-center gap-0.5 text-accent-rose font-bold">
            <Minus className="w-3 h-3" />
            {summary.totalDeletions}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {isSyncing && (
            <span className="text-[11px] font-medium text-accent-cyan bg-accent-cyan/10 px-2.5 py-1 rounded-lg border border-accent-cyan/30 inline-flex items-center gap-1.5 animate-pulse">
              <RotateCw className="w-3 h-3 animate-spin text-accent-cyan" />
              <span>Syncing repo...</span>
            </span>
          )}

          {/* AI Code Review */}
          <button
            onClick={onAiReview}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-white bg-gradient-to-r from-accent-indigo to-accent-purple hover:opacity-95 transition-all shadow-sm text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            title={isSyncing ? "Repository sync in progress. Please wait..." : undefined}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Code Review</span>
          </button>

          {/* First-Parent PR Merge Restricted Actions */}
          {isMainMerge || isBranchDiff ? (
            <>
              {/* Generate PRD */}
              {onGeneratePrd && (
                cacheStatus?.prd ? (
                  <div className="inline-flex rounded-lg shadow-sm" title="Cached PRD available on branch. Click to view, or click refresh to regenerate.">
                    <button
                      onClick={() => onGeneratePrd(false)}
                      disabled={isSyncing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                      <span>PRD (Cached)</span>
                    </button>
                    <button
                      onClick={() => onGeneratePrd(true)}
                      disabled={isSyncing}
                      className="px-2 py-1.5 rounded-r-lg bg-indigo-700 hover:bg-indigo-800 text-white/80 hover:text-white border-l border-white/20 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Force Regenerate PRD with AI"
                    >
                      <RotateCw className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onGeneratePrd(false)}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 transition-all shadow-sm text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Generate PRD</span>
                  </button>
                )
              )}

              {/* Run Existing Tests */}
              {cacheStatus?.existingTests ? (
                <div className="inline-flex rounded-lg shadow-sm" title="Cached test report available on branch. Click to view, or click refresh to re-run.">
                  <button
                    onClick={() => onRunExistingTests(false)}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg font-semibold text-white bg-gradient-to-r from-sky-600 to-cyan-600 hover:opacity-95 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                    <span>Tests (Cached)</span>
                  </button>
                  <button
                    onClick={() => onRunExistingTests(true)}
                    disabled={isSyncing}
                    className="px-2 py-1.5 rounded-r-lg bg-cyan-700 hover:bg-cyan-800 text-white/80 hover:text-white border-l border-white/20 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Force Re-run Codebase Tests"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onRunExistingTests(false)}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-white bg-gradient-to-r from-sky-600 to-cyan-600 hover:opacity-95 transition-all shadow-sm text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Run pre-existing codebase tests impacted by this diff (Stage 1)"
                >
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>Run Tests</span>
                </button>
              )}

              {/* Generate AI Tests */}
              {cacheStatus?.aiTests ? (
                <div className="inline-flex rounded-lg shadow-sm" title="Cached AI test suite available on branch. Click to view, or click refresh to propose new tests.">
                  <button
                    onClick={() => onGenerateTests(false)}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                    <span>AI Tests (Cached)</span>
                  </button>
                  <button
                    onClick={() => onGenerateTests(true)}
                    disabled={isSyncing}
                    className="px-2 py-1.5 rounded-r-lg bg-teal-700 hover:bg-teal-800 text-white/80 hover:text-white border-l border-white/20 transition-all text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Force Propose & Generate New AI Tests"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onGenerateTests(false)}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 transition-all shadow-sm text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Propose scenarios, write unit tests on dedicated branch, and verify (Stage 2)"
                >
                  <Beaker className="w-3.5 h-3.5" />
                  <span>Generate Tests</span>
                </button>
              )}
            </>
          ) : (
            <span
              className="text-[11px] font-medium text-text-muted bg-bg-card/90 px-3 py-1.5 rounded-lg border border-border-subtle inline-flex items-center gap-1.5 cursor-not-allowed"
              title="PRD generation, test execution, and AI test synthesis are exclusively reserved for First-Parent PR Merge releases."
            >
              <span>PRD & Tests reserved for PR Merges</span>
            </span>
          )}

          {/* Collapse/Expand All Files */}
          <button
            onClick={onToggleAllFiles}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-medium bg-bg-card border border-border-subtle hover:border-border-glow text-text-secondary hover:text-text-bright transition-all text-xs"
          >
            {allExpanded ? <FoldVertical className="w-3.5 h-3.5" /> : <UnfoldVertical className="w-3.5 h-3.5" />}
            <span>{allExpanded ? 'Collapse All' : 'Expand All'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
