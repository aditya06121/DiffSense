import React, { useState } from 'react';
import { Search, FileDiff as FileDiffIcon } from 'lucide-react';
import { FileDiff } from '../../types';

interface FileTreeProps {
  files: FileDiff[];
  activeFileIndex: number | null;
  onSelectFile: (index: number) => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  activeFileIndex,
  onSelectFile,
}) => {
  const [filterQuery, setFilterQuery] = useState('');

  const filtered = files
    .map((f, idx) => ({ ...f, originalIndex: idx }))
    .filter((f) => {
      const p = f.newPath || f.oldPath;
      return p.toLowerCase().includes(filterQuery.toLowerCase().trim());
    });

  const getStatusBadge = (type: FileDiff['type']) => {
    switch (type) {
      case 'ADDED':
        return <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-accent-emerald/20 text-accent-emerald">A</span>;
      case 'DELETED':
        return <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-accent-rose/20 text-accent-rose">D</span>;
      case 'RENAMED':
        return <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-accent-purple/20 text-accent-purple">R</span>;
      case 'MODIFIED':
      default:
        return <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-accent-cyan/20 text-accent-cyan">M</span>;
    }
  };

  return (
    <div className="flex flex-col h-full bg-bg-panel border border-border-subtle rounded-xl overflow-hidden shadow-md">
      {/* File Tree Header */}
      <div className="p-3 border-b border-border-subtle bg-bg-card/40 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-semibold text-xs text-text-bright">
            <FileDiffIcon className="w-3.5 h-3.5 text-accent-cyan" />
            <span>Files Changed ({files.length})</span>
          </div>
        </div>

        {/* Search file filter */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search changed files..."
            className="w-full bg-bg-primary border border-border-subtle rounded-lg pl-8 pr-3 py-1 text-xs text-text-primary focus:outline-none focus:border-border-glow transition-colors font-mono"
          />
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border-subtle/30 text-xs">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-text-muted text-xs">No matching files.</div>
        ) : (
          filtered.map((f) => {
            const filePath = f.newPath || f.oldPath;
            const parts = filePath.split('/');
            const fileName = parts.pop();
            const dirPath = parts.join('/');
            const isSelected = activeFileIndex === f.originalIndex;

            return (
              <button
                key={f.originalIndex}
                onClick={() => onSelectFile(f.originalIndex)}
                className={`w-full text-left p-2.5 transition-all flex items-center justify-between gap-2 group ${
                  isSelected
                    ? 'bg-accent-indigo/15 border-l-4 border-accent-cyan text-text-bright font-medium'
                    : 'hover:bg-bg-card/60 text-text-secondary hover:text-text-primary border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {getStatusBadge(f.type)}
                  <div className="min-w-0 flex-1 font-mono text-[11px] truncate text-left">
                    {dirPath && (
                      <span className="text-text-muted text-[10px] block truncate">{dirPath}/</span>
                    )}
                    <span className="text-text-bright truncate">{fileName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-mono shrink-0">
                  {f.additions > 0 && (
                    <span className="text-accent-emerald">+{f.additions}</span>
                  )}
                  {f.deletions > 0 && (
                    <span className="text-accent-rose">-{f.deletions}</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
