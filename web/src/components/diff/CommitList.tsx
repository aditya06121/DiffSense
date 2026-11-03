import React, { useState, useMemo } from 'react';
import { Search, GitCommit, Loader2, Rocket, GitBranch, Tag, CheckCircle2, RefreshCw, ExternalLink } from 'lucide-react';
import { CommitInfo } from '../../types';
import { parseCommitMeta, getRepoWebUrls } from '../../utils/commitParser';

interface CommitListProps {
  commits: CommitInfo[];
  selectedSha: string | null;
  onSelectCommit: (sha: string) => void;
  isLoading: boolean;
  activeBranch: string;
  repoSsh?: string;
  isSyncing?: boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}

export const CommitList: React.FC<CommitListProps> = ({
  commits,
  selectedSha,
  onSelectCommit,
  isLoading,
  activeBranch,
  repoSsh,
  isSyncing = false,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTier, setFilterTier] = useState<'all' | 'pr-merge' | 'feature'>('all');

  const webUrls = useMemo(() => getRepoWebUrls(repoSsh), [repoSsh]);

  // Parse all commits once with metadata
  const parsedCommits = useMemo(() => {
    return commits.map((c) => ({
      commit: c,
      meta: parseCommitMeta(c.message, c.isMerge, c.parents?.length || 1),
    }));
  }, [commits]);

  // Filter stats
  const prMergesCount = parsedCommits.filter((p) => p.meta.tier === 'pr-merge').length;
  const featuresCount = parsedCommits.filter((p) => p.meta.tier === 'feature').length;

  const filteredCommits = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return parsedCommits.filter(({ commit, meta }) => {
      // Filter by tier
      if (filterTier === 'pr-merge' && meta.tier !== 'pr-merge') return false;
      if (filterTier === 'feature' && meta.tier !== 'feature') return false;

      // Filter by search query
      if (!q) return true;
      return (
        commit.message.toLowerCase().includes(q) ||
        commit.sha.toLowerCase().includes(q) ||
        commit.authorName.toLowerCase().includes(q) ||
        meta.ticketIds.some((t) => t.toLowerCase().includes(q)) ||
        (meta.sourceBranch && meta.sourceBranch.toLowerCase().includes(q)) ||
        (meta.prNumber && meta.prNumber.includes(q))
      );
    });
  }, [parsedCommits, searchQuery, filterTier]);

  return (
    <div className="flex flex-col h-full bg-bg-panel border border-border-subtle rounded-xl overflow-hidden shadow-md">
      {/* Panel Top Header */}
      <div className="p-3 border-b border-border-subtle bg-bg-card/40 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-text-bright">
            <GitCommit className="w-3.5 h-3.5 text-accent-cyan" />
            <span>Commits ({commits.length})</span>
            {isSyncing && (
              <span className="inline-flex items-center gap-1 text-[10px] text-accent-cyan bg-accent-cyan/15 px-1.5 py-0.5 rounded-full animate-pulse font-normal">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                Syncing...
              </span>
            )}
          </div>
          <span className="text-[11px] text-text-muted font-mono truncate max-w-[140px]" title={activeBranch}>
            {activeBranch}
          </span>
        </div>

        {/* Tier filter tabs */}
        <div className="flex items-center gap-1 p-0.5 bg-bg-primary rounded-lg border border-border-subtle text-[11px]">
          <button
            onClick={() => setFilterTier('all')}
            className={`flex-1 py-1 px-1.5 rounded text-center font-medium transition-colors ${
              filterTier === 'all'
                ? 'bg-bg-card text-text-bright shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            All ({commits.length})
          </button>
          <button
            onClick={() => setFilterTier('pr-merge')}
            className={`flex-1 py-1 px-1.5 rounded text-center font-semibold transition-colors flex items-center justify-center gap-1 ${
              filterTier === 'pr-merge'
                ? 'bg-accent-cyan/15 text-accent-cyan shadow-xs'
                : 'text-text-muted hover:text-accent-cyan'
            }`}
            title="Show only Main PR Merges (1st-Parent Diff Base)"
          >
            <Rocket className="w-3 h-3" />
            <span>PR Merges ({prMergesCount})</span>
          </button>
          <button
            onClick={() => setFilterTier('feature')}
            className={`flex-1 py-1 px-1.5 rounded text-center font-medium transition-colors ${
              filterTier === 'feature'
                ? 'bg-bg-card text-text-bright shadow-xs'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            Commits ({featuresCount})
          </button>
        </div>

        {/* Search filter */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search PR #, message, ticket..."
            className="w-full bg-bg-primary border border-border-subtle rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-border-glow transition-colors font-mono"
          />
        </div>
      </div>

      {/* Commit List Scroll Area */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border-subtle/40">
        {isLoading ? (
          <div className="p-6 flex flex-col items-center justify-center gap-2 text-text-muted text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-accent-cyan" />
            <span>Loading commit history...</span>
          </div>
        ) : filteredCommits.length === 0 ? (
          <div className="p-6 text-center text-text-muted text-xs">No commits matching filter.</div>
        ) : (
          filteredCommits.map(({ commit: c, meta }) => {
            const isSelected = selectedSha === c.sha;

            // ==========================================
            // TIER 1: MAIN PR MERGE COMMIT (MOST HIGHLIGHTED)
            // ==========================================
            if (meta.tier === 'pr-merge') {
              return (
                <button
                  key={c.sha}
                  onClick={() => onSelectCommit(c.sha)}
                  className={`w-full text-left p-3 transition-all flex flex-col gap-2 relative ${
                    isSelected
                      ? 'bg-accent-cyan/15 border-l-4 border-accent-cyan text-text-bright shadow-inner'
                      : 'bg-gradient-to-r from-accent-cyan/[0.08] via-accent-indigo/[0.04] to-transparent hover:from-accent-cyan/[0.14] text-text-primary border-l-4 border-accent-cyan/80'
                  }`}
                >
                  {/* Top Bar: PR Badge + 1st-Parent Diff Pill + Short SHA */}
                  <div className="flex items-center justify-between gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      {webUrls.getPrUrl(meta.prNumber) ? (
                        <a
                          href={webUrls.getPrUrl(meta.prNumber)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40 hover:bg-accent-cyan/30 hover:border-accent-cyan/60 transition-all shadow-xs"
                          title="Open Pull Request on Bitbucket / Git host"
                        >
                          <Rocket className="w-3 h-3" />
                          <span>{meta.prNumber ? `PR #${meta.prNumber}` : 'PR Merge'}</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-80" />
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40">
                          <Rocket className="w-3 h-3" />
                          <span>{meta.prNumber ? `PR #${meta.prNumber}` : 'PR Merge'}</span>
                        </span>
                      )}
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent-indigo/20 text-accent-indigo border border-accent-indigo/30">
                        1st-Parent
                      </span>
                    </div>

                    <code className="text-[11px] font-mono text-accent-cyan font-bold">
                      {c.shortSha}
                    </code>
                  </div>

                  {/* Clean PR Title */}
                  <div className="text-xs font-bold text-text-bright line-clamp-2 leading-snug">
                    {meta.cleanTitle}
                  </div>

                  {/* Rich Metadata Pills Row (Branches, Tickets, Approver) */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                    {meta.sourceBranch && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-card/90 text-text-secondary border border-border-subtle truncate max-w-[170px]" title={meta.sourceBranch}>
                        <GitBranch className="w-2.5 h-2.5 text-accent-cyan shrink-0" />
                        <span className="truncate">{meta.sourceBranch}</span>
                      </span>
                    )}

                    {meta.ticketIds.map((ticket) => (
                      <span key={ticket} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                        <Tag className="w-2.5 h-2.5" />
                        <span>{ticket}</span>
                      </span>
                    ))}

                    {meta.approvedBy.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 truncate max-w-[130px]" title={`Approved by ${meta.approvedBy.join(', ')}`}>
                        <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                        <span className="truncate">{meta.approvedBy[0]}</span>
                      </span>
                    )}
                  </div>

                  {/* Author & Timestamp Footer */}
                  <div className="flex items-center justify-between text-[11px] text-text-muted pt-0.5">
                    <span className="truncate max-w-[140px]">{c.authorName}</span>
                    <span>{new Date(c.timestamp).toLocaleDateString()}</span>
                  </div>
                </button>
              );
            }

            // ==========================================
            // TIER 3: ROUTINE SYNC / PULL MERGE (LEAST HIGHLIGHTED / MUTED)
            // ==========================================
            if (meta.tier === 'sync-merge') {
              return (
                <button
                  key={c.sha}
                  onClick={() => onSelectCommit(c.sha)}
                  className={`w-full text-left px-3 py-2 transition-all flex flex-col gap-1 opacity-60 hover:opacity-100 ${
                    isSelected
                      ? 'bg-bg-card border-l-2 border-text-muted text-text-primary'
                      : 'hover:bg-bg-card/40 text-text-muted border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1 text-text-muted">
                      <RefreshCw className="w-2.5 h-2.5" />
                      <span className="font-medium">sync merge</span>
                    </div>
                    <code className="font-mono text-[10px] text-text-muted">
                      {c.shortSha}
                    </code>
                  </div>

                  <div className="text-[11px] text-text-secondary truncate">
                    {meta.cleanTitle}
                  </div>
                </button>
              );
            }

            // ==========================================
            // TIER 2: COMMITS IN BETWEEN (FEATURE / BUGFIX)
            // ==========================================
            return (
              <button
                key={c.sha}
                onClick={() => onSelectCommit(c.sha)}
                className={`w-full text-left p-3 transition-all flex flex-col gap-1.5 ${
                  isSelected
                    ? 'bg-accent-indigo/15 border-l-4 border-accent-indigo text-text-bright'
                    : 'hover:bg-bg-card/60 text-text-primary border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="text-[11px] font-mono text-accent-cyan font-semibold flex items-center gap-1">
                    <GitCommit className="w-3 h-3 text-text-muted" />
                    <span>{c.shortSha}</span>
                  </code>

                  {meta.ticketIds.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {meta.ticketIds[0]}
                    </span>
                  )}
                </div>

                <div className="text-xs font-medium text-text-bright line-clamp-2 leading-relaxed">
                  {meta.cleanTitle}
                </div>

                <div className="flex items-center justify-between text-[11px] text-text-muted mt-0.5">
                  <span className="truncate max-w-[130px]">{c.authorName}</span>
                  <span>{new Date(c.timestamp).toLocaleDateString()}</span>
                </div>
              </button>
            );
          })
        )}

        {!isLoading && hasMore && (
          <div className="p-3 flex justify-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-card border border-border-subtle text-[11px] font-medium text-text-secondary hover:text-text-bright hover:border-border-glow transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading more...</span>
                </>
              ) : (
                <span>Load more commits</span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
