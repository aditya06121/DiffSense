import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { TestScenario } from '../../types';

interface ScenarioSelectorProps {
  scenarios: TestScenario[];
  testBranch: string;
  onConfirm: (selected: TestScenario[]) => void;
  isGenerating: boolean;
}

export const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({
  scenarios,
  testBranch,
  onConfirm,
  isGenerating,
}) => {
  const [selectedIds, setSelectedIds] = useState<number[]>(() =>
    scenarios.filter((s) => s.coverageStatus !== 'already_covered').map((s) => s.id)
  );

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedIds(scenarios.map((s) => s.id));
  const deselectAll = () => setSelectedIds([]);

  const handleSubmit = () => {
    const selected = scenarios.filter((s) => selectedIds.includes(s.id));
    if (selected.length === 0) return;
    onConfirm(selected);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header Info */}
      <div className="p-3.5 bg-bg-card/70 border border-border-subtle rounded-xl text-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-semibold text-text-bright">Select Scenarios to Implement & Verify:</span>
          <p className="text-text-secondary mt-0.5">
            New tests will be generated, executed, and committed to branch{' '}
            <code className="px-1.5 py-0.5 rounded bg-accent-cyan/15 text-accent-cyan font-mono">
              {testBranch}
            </code>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="px-2.5 py-1 rounded bg-bg-panel border border-border-subtle hover:text-text-bright text-text-muted transition-colors"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={deselectAll}
            className="px-2.5 py-1 rounded bg-bg-panel border border-border-subtle hover:text-text-bright text-text-muted transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Scenario List */}
      <div className="flex flex-col gap-2.5 max-h-[460px] overflow-y-auto pr-1">
        {scenarios.map((s) => {
          const isSelected = selectedIds.includes(s.id);
          const isCovered = s.coverageStatus === 'already_covered';
          const isPartial = s.coverageStatus === 'partially_covered';

          const riskSeverityColor =
            s.riskSeverity === 'CRITICAL'
              ? 'bg-accent-rose/15 text-accent-rose border-accent-rose/30'
              : s.riskSeverity === 'HIGH'
              ? 'bg-accent-amber/15 text-accent-amber border-accent-amber/30'
              : 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30';

          return (
            <label
              key={s.id}
              onClick={() => toggleSelect(s.id)}
              className={`p-3.5 rounded-xl border transition-all flex items-start gap-3.5 cursor-pointer text-xs ${
                isSelected
                  ? 'bg-accent-indigo/10 border-accent-indigo/40 shadow-sm'
                  : 'bg-bg-panel border-border-subtle hover:bg-bg-card/60 opacity-80'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {}} // Handled by label click
                className="mt-1 rounded accent-accent-indigo cursor-pointer w-4 h-4"
              />

              <div className="flex-1 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="font-semibold text-text-bright text-sm leading-snug">
                    {s.id}. {s.title}
                  </div>

                  {/* Badges container */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Coverage badge */}
                    {isCovered && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/30">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Already Covered</span>
                      </span>
                    )}
                    {isPartial && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent-amber/15 text-accent-amber border border-accent-amber/30">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Partially Covered</span>
                      </span>
                    )}

                    {/* Alt DRX Risk Rule badge */}
                    {s.riskRuleId && (
                      <span
                        title={s.riskExplanation || ''}
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${riskSeverityColor}`}
                      >
                        <ShieldAlert className="w-3 h-3" />
                        <span>{s.riskRuleId}</span>
                        {s.riskSeverity && <span>({s.riskSeverity})</span>}
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-text-secondary leading-relaxed">{s.description}</p>

                {s.targetFiles && s.targetFiles.length > 0 && (
                  <div className="font-mono text-[11px] text-text-muted mt-0.5">
                    Target: {s.targetFiles.join(', ')}
                  </div>
                )}

                {s.riskExplanation && (
                  <div className="text-[11px] text-accent-amber/90 italic bg-accent-amber/5 px-2.5 py-1 rounded border border-accent-amber/15">
                    Rule context: {s.riskExplanation}
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {/* Confirm Button */}
      <div className="flex items-center justify-between pt-2 border-t border-border-subtle">
        <span className="text-xs text-text-secondary">
          {selectedIds.length} of {scenarios.length} scenarios selected
        </span>

        <button
          onClick={handleSubmit}
          disabled={selectedIds.length === 0 || isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 transition-all shadow-md disabled:opacity-50 text-xs"
        >
          <Sparkles className="w-4 h-4" />
          <span>Generate & Run ({selectedIds.length}) Scenarios</span>
        </button>
      </div>
    </div>
  );
};
