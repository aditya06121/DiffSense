import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, FileCode, Plus, Minus } from 'lucide-react';
import { FileDiff } from '../../types';

interface DiffFileCardProps {
  file: FileDiff;
  fileIndex: number;
  isExpanded: boolean;
}

export const DiffFileCard: React.FC<DiffFileCardProps> = ({
  file,
  fileIndex,
  isExpanded,
}) => {
  const [collapsed, setCollapsed] = useState(!isExpanded);
  const filePath = file.newPath || file.oldPath;

  // React to parent expand/collapse toggle
  useEffect(() => {
    setCollapsed(!isExpanded);
  }, [isExpanded]);

  const getStatusBadge = (type: FileDiff['type']) => {
    switch (type) {
      case 'ADDED':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#2ea043]/20 text-[#3fb950] border border-[#2ea043]/30">
            ADDED
          </span>
        );
      case 'DELETED':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f85149]/20 text-[#f85149] border border-[#f85149]/30">
            DELETED
          </span>
        );
      case 'RENAMED':
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#bc8cff]/20 text-[#bc8cff] border border-[#bc8cff]/30">
            RENAMED
          </span>
        );
      case 'MODIFIED':
      default:
        return (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#58a6ff]/20 text-[#58a6ff] border border-[#58a6ff]/30">
            MODIFIED
          </span>
        );
    }
  };

  return (
    <div
      id={`diff-file-${fileIndex}`}
      className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden shadow-sm transition-all"
    >
      {/* File Card Header */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full px-4 py-2.5 bg-[#21262d] hover:bg-[#2d333b] flex items-center justify-between gap-3 text-xs border-b border-[#30363d] transition-colors text-left select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-[#8b949e] shrink-0 transition-transform" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#58a6ff] shrink-0 transition-transform" />
          )}
          <FileCode className="w-4 h-4 text-[#58a6ff] shrink-0" />
          <span className="font-mono text-[#f0f6fc] font-semibold truncate">{filePath}</span>
          {getStatusBadge(file.type)}
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] shrink-0">
          {file.additions > 0 && (
            <span className="text-[#3fb950] flex items-center gap-0.5 font-bold">
              <Plus className="w-3 h-3" />
              {file.additions}
            </span>
          )}
          {file.deletions > 0 && (
            <span className="text-[#f85149] flex items-center gap-0.5 font-bold">
              <Minus className="w-3 h-3" />
              {file.deletions}
            </span>
          )}
        </div>
      </button>

      {/* Diff Content Table */}
      {!collapsed && (
        <div className="w-full overflow-x-auto bg-[#0d1117]">
          {file.hunks && file.hunks.length > 0 ? (
            <table className="w-full min-w-full border-collapse font-mono text-[12px] leading-5">
              <tbody>
                {file.hunks.map((hunk, hIdx) => (
                  <React.Fragment key={hIdx}>
                    {/* Hunk Header */}
                    <tr className="bg-[#388bfd]/10 text-[#79c0ff] border-y border-[#30363d] select-none">
                      <td
                        colSpan={4}
                        className="px-4 py-1.5 text-[11px] font-semibold text-[#79c0ff]"
                      >
                        {hunk.header}
                      </td>
                    </tr>

                    {/* Hunk Lines */}
                    {hunk.lines.map((line, lIdx) => {
                      const isAdd = line.type === 'ADDITION';
                      const isDel = line.type === 'DELETION';

                      const rowBg = isAdd
                        ? 'bg-[#13231b] hover:bg-[#193223]'
                        : isDel
                        ? 'bg-[#34121a] hover:bg-[#431923]'
                        : 'bg-[#0d1117] hover:bg-[#161b22]';

                      const textColor = isAdd
                        ? 'text-[#7ee787]'
                        : isDel
                        ? 'text-[#ff7b72]'
                        : 'text-[#c9d1d9]';

                      const oldNumBg = isDel ? 'bg-[#f85149]/20 text-[#f85149]' : 'bg-[#0d1117] text-[#484f58]';
                      const newNumBg = isAdd ? 'bg-[#2ea043]/20 text-[#3fb950]' : 'bg-[#0d1117] text-[#484f58]';

                      const sign = isAdd ? '+' : isDel ? '-' : ' ';
                      const signColor = isAdd ? 'text-[#3fb950]' : isDel ? 'text-[#f85149]' : 'text-transparent';

                      return (
                        <tr key={lIdx} className={`${rowBg} transition-colors`}>
                          {/* Old line number */}
                          <td
                            className={`w-[44px] min-w-[44px] max-w-[44px] px-2 py-0.5 text-right select-none font-mono text-[11px] border-r border-[#30363d]/40 ${oldNumBg}`}
                          >
                            {line.oldLineNumber ?? ''}
                          </td>
                          {/* New line number */}
                          <td
                            className={`w-[44px] min-w-[44px] max-w-[44px] px-2 py-0.5 text-right select-none font-mono text-[11px] border-r border-[#30363d]/40 ${newNumBg}`}
                          >
                            {line.newLineNumber ?? ''}
                          </td>
                          {/* Sign (+ / -) */}
                          <td
                            className={`w-[24px] min-w-[24px] max-w-[24px] px-1 py-0.5 text-center select-none font-bold text-[12px] ${signColor}`}
                          >
                            {sign}
                          </td>
                          {/* Code content */}
                          <td
                            className={`px-3 py-0.5 whitespace-pre font-mono text-[12px] leading-5 ${textColor}`}
                          >
                            {line.content !== undefined && line.content !== '' ? line.content : ' '}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-6 text-center text-[#8b949e] text-xs font-mono">
              Binary file or no textual changes recorded in this hunk.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
