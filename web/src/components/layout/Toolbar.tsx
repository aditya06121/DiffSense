import React, { useState, useRef, useEffect } from 'react';
import { FolderGit2, GitBranch, ChevronDown, CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { Repository } from '../../types';

interface ToolbarProps {
  repositories: Repository[];
  activeRepoId: string;
  onSelectRepo: (repoId: string) => void;
  branches: string[];
  activeBranch: string;
  onSwitchBranch: (branch: string) => Promise<void>;
  onSyncCurrent: () => Promise<void>;
  isSyncing: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  repositories,
  activeRepoId,
  onSelectRepo,
  branches,
  activeBranch,
  onSwitchBranch,
  onSyncCurrent,
  isSyncing,
}) => {
  const [branchSearch, setBranchSearch] = useState(activeBranch);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setBranchSearch(activeBranch);
  }, [activeBranch]);

  // Click outside listener for branch dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredBranches = branches.filter((b) =>
    b.toLowerCase().includes(branchSearch.toLowerCase().trim())
  );

  const activeRepo = repositories.find((r) => r.id === activeRepoId);

  const handleSwitch = async () => {
    if (!branchSearch || branchSearch === activeBranch) return;
    setIsSwitching(true);
    try {
      await onSwitchBranch(branchSearch);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-bg-panel border border-border-subtle rounded-xl text-xs">
      <div className="flex items-center gap-3 flex-wrap flex-1">
        {/* Repository selector */}
        <div className="flex items-center gap-2">
          <FolderGit2 className="w-4 h-4 text-accent-cyan" />
          <span className="font-semibold text-text-secondary">Repo:</span>
          <select
            value={activeRepoId}
            onChange={(e) => onSelectRepo(e.target.value)}
            disabled={isSyncing || isSwitching}
            className="bg-bg-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-text-bright font-medium focus:outline-none focus:border-border-glow transition-colors cursor-pointer disabled:opacity-50"
          >
            {repositories.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} ({r.isCloned ? (r.isSyncing ? 'Syncing...' : 'Synced') : 'Not Cloned'})
              </option>
            ))}
          </select>
        </div>

        <div className="h-4 w-px bg-border-subtle hidden sm:block" />

        {/* Searchable Branch Combobox */}
        <div className="flex items-center gap-2 relative" ref={containerRef}>
          <GitBranch className="w-4 h-4 text-accent-purple" />
          <span className="font-semibold text-text-secondary">Branch:</span>
          <div className="relative">
            <input
              type="text"
              value={branchSearch}
              onChange={(e) => {
                setBranchSearch(e.target.value);
                setDropdownOpen(true);
              }}
              onFocus={() => setDropdownOpen(true)}
              disabled={isSyncing || isSwitching}
              placeholder="Search branch..."
              className="w-48 sm:w-56 bg-bg-card border border-border-subtle rounded-lg pl-2.5 pr-7 py-1.5 text-text-bright font-mono text-xs focus:outline-none focus:border-border-glow transition-colors disabled:opacity-50"
            />
            <ChevronDown
              className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />

            {dropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-64 max-h-60 overflow-y-auto bg-bg-card border border-border-subtle rounded-lg shadow-2xl z-50 py-1">
                {filteredBranches.length > 0 ? (
                  filteredBranches.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        setBranchSearch(b);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 flex items-center justify-between text-xs hover:bg-accent-indigo/15 transition-colors font-mono ${
                        b === activeBranch ? 'text-accent-cyan font-bold bg-accent-cyan/10' : 'text-text-primary'
                      }`}
                    >
                      <span className="truncate">{b}</span>
                      {b === activeBranch && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-cyan/20 text-accent-cyan">
                          Active
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-text-muted text-xs">No branches found</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Switch Branch Button */}
        {branchSearch !== activeBranch && (
          <button
            onClick={handleSwitch}
            disabled={isSwitching || isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold bg-accent-indigo hover:bg-accent-indigo/90 text-white transition-all shadow-sm disabled:opacity-50"
          >
            {isSwitching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            <span>{isSwitching ? 'Switching...' : 'Switch & Sync'}</span>
          </button>
        )}

        {/* Sync Current Button */}
        <button
          onClick={onSyncCurrent}
          disabled={isSyncing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium bg-bg-card border border-border-subtle hover:border-border-glow text-text-primary hover:text-text-bright transition-all shadow-sm disabled:opacity-50"
          title="Fetch and pull remote changes for this branch"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-accent-cyan' : ''}`} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
        </button>
      </div>

      {/* HEAD Commit SHA info */}
      <div className="text-text-secondary flex items-center gap-1.5 ml-auto">
        <span>HEAD:</span>
        <code className="px-2 py-0.5 rounded bg-bg-card border border-border-subtle text-accent-cyan font-mono font-semibold">
          {activeRepo?.currentCommit ? activeRepo.currentCommit.substring(0, 7) : '—'}
        </code>
      </div>
    </div>
  );
};

