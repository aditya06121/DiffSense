import React, { useState, useEffect } from 'react';
import { GitCompare, ArrowRight, Loader2 } from 'lucide-react';

interface BranchCompareProps {
  branches: string[];
  activeBranch: string;
  defaultBranch?: string;
  onCompare: (base: string, compare: string) => Promise<void>;
  isLoading: boolean;
  activeComparison: { base: string; compare: string } | null;
}

export const BranchCompare: React.FC<BranchCompareProps> = ({
  branches,
  activeBranch,
  defaultBranch,
  onCompare,
  isLoading,
  activeComparison,
}) => {
  const [baseBranch, setBaseBranch] = useState(defaultBranch || 'main');
  const [compareBranch, setCompareBranch] = useState(activeBranch);

  useEffect(() => {
    if (defaultBranch && branches.includes(defaultBranch)) {
      setBaseBranch(defaultBranch);
    } else if (branches.length > 0) {
      setBaseBranch(branches[0]);
    }
  }, [defaultBranch, branches]);

  useEffect(() => {
    if (activeBranch && branches.includes(activeBranch)) {
      setCompareBranch(activeBranch);
    }
  }, [activeBranch, branches]);

  const handleRunCompare = () => {
    if (!baseBranch || !compareBranch || baseBranch === compareBranch) return;
    onCompare(baseBranch, compareBranch);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-bg-panel border border-border-subtle rounded-xl text-xs">
      <div className="flex items-center gap-2.5 flex-wrap flex-1">
        <div className="flex items-center gap-1.5 font-semibold text-text-bright">
          <GitCompare className="w-4 h-4 text-accent-purple" />
          <span>Branch Diff:</span>
        </div>

        {/* Base Branch (Target / Merge Into) */}
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">base:</span>
          <select
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            className="bg-bg-card border border-border-subtle rounded-lg px-2 py-1 text-text-bright font-mono text-xs focus:outline-none focus:border-border-glow cursor-pointer"
          >
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        <ArrowRight className="w-3.5 h-3.5 text-text-muted" />

        {/* Compare Branch (Feature / Source) */}
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">compare:</span>
          <select
            value={compareBranch}
            onChange={(e) => setCompareBranch(e.target.value)}
            className="bg-bg-card border border-border-subtle rounded-lg px-2 py-1 text-text-bright font-mono text-xs focus:outline-none focus:border-border-glow cursor-pointer"
          >
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {/* Action Button */}
        <button
          onClick={handleRunCompare}
          disabled={isLoading || baseBranch === compareBranch}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold bg-accent-purple hover:bg-accent-purple/90 text-white transition-all shadow-sm disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <GitCompare className="w-3.5 h-3.5" />
          )}
          <span>Compare</span>
        </button>

        {baseBranch === compareBranch && (
          <span className="text-accent-amber text-[11px]">Select two different branches to diff</span>
        )}
      </div>

      {activeComparison && (
        <div className="text-[11px] text-text-muted font-mono ml-auto">
          Diffing <span className="text-accent-purple font-semibold">{activeComparison.compare}</span> relative to common ancestor with <span className="text-accent-cyan font-semibold">{activeComparison.base}</span>
        </div>
      )}
    </div>
  );
};

