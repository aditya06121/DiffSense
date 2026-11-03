import React from 'react';
import { RefreshCw, GitBranch, Loader2 } from 'lucide-react';

interface SyncBannerProps {
  isSyncing: boolean;
  repoId: string;
  branch: string;
  statusText?: string;
}

export const SyncBanner: React.FC<SyncBannerProps> = ({
  isSyncing,
  repoId,
  branch,
  statusText,
}) => {
  if (!isSyncing) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-accent-cyan/40 bg-gradient-to-r from-accent-indigo/15 via-accent-cyan/10 to-accent-purple/15 p-3 text-xs shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-300">
      {/* Top Animated Gradient Pulse Stripe */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent-indigo via-accent-cyan to-accent-purple animate-pulse" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-accent-cyan/20 border border-accent-cyan/40 flex items-center justify-center text-accent-cyan shrink-0">
            <RefreshCw className="w-4 h-4 animate-spin text-accent-cyan" />
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-text-bright tracking-tight">
                Repository Sync in Progress
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-bg-card border border-border-subtle text-accent-cyan">
                <GitBranch className="w-3 h-3" />
                <span>{branch}</span>
              </span>
            </div>
            <p className="text-[11px] text-text-secondary truncate mt-0.5">
              {statusText ||
                `Fetching remote changes for '${repoId}', resetting working tree, and refreshing commit history...`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bg-card/80 border border-border-subtle text-[11px] font-medium text-accent-cyan">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Updating UI...</span>
          </span>
        </div>
      </div>
    </div>
  );
};
