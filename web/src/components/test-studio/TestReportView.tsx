import React, { useState } from 'react';
import { CheckCircle2, XCircle, Terminal, FileCode, GitBranch, ChevronDown, ChevronRight } from 'lucide-react';
import { ScenarioTestGeneratorResult } from '../../types';
import { MarkdownViewer } from '../common/MarkdownViewer';

interface TestReportViewProps {
  report: ScenarioTestGeneratorResult;
}

export const TestReportView: React.FC<TestReportViewProps> = ({ report }) => {
  const [expandedScenarios, setExpandedScenarios] = useState<Record<number, boolean>>({ 0: true });

  const toggleScenario = (idx: number) => {
    setExpandedScenarios((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const totalScenarios = report.scenarioResults?.length || 0;
  const passedScenarios = report.scenarioResults?.filter((s) => s.testPassed === true).length || 0;

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Top Banner: Status & Branch info */}
      <div className="p-4 bg-bg-panel border border-border-subtle rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          {report.success ? (
            <div className="w-10 h-10 rounded-xl bg-accent-emerald/15 border border-accent-emerald/30 flex items-center justify-center text-accent-emerald">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-xl bg-accent-rose/15 border border-accent-rose/30 flex items-center justify-center text-accent-rose">
              <XCircle className="w-6 h-6" />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-text-bright">
                {report.success ? 'AI Tests Generated & Verified' : 'AI Test Generation Encountered Issues'}
              </h3>
              <span className="px-2 py-0.5 rounded-full font-mono font-semibold text-[11px] bg-accent-indigo/20 text-accent-cyan border border-accent-indigo/30">
                {passedScenarios}/{totalScenarios} Passed
              </span>
            </div>
            <p className="text-text-secondary mt-0.5">
              Repository: <span className="text-text-bright font-mono">{report.repoId}</span>
            </p>
          </div>
        </div>

        {/* Branch commitment badge */}
        <div className="flex items-center gap-2 font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-card border border-border-subtle text-text-bright">
            <GitBranch className="w-4 h-4 text-accent-purple" />
            <span>{report.testBranch}</span>
          </div>
          {report.committed && (
            <span className="px-2 py-1 rounded bg-accent-emerald/20 text-accent-emerald text-[11px] font-semibold">
              Committed
            </span>
          )}
          {report.pushed ? (
            <span className="px-2 py-1 rounded bg-accent-cyan/20 text-accent-cyan text-[11px] font-semibold">
              Pushed
            </span>
          ) : report.pushError ? (
            <span className="px-2 py-1 rounded bg-accent-rose/20 text-accent-rose text-[11px] font-semibold" title={report.pushError}>
              Push Failed
            </span>
          ) : null}
        </div>
      </div>

      {/* Created Files summary */}
      {report.createdFiles && report.createdFiles.length > 0 && (
        <div className="p-3 bg-bg-card/40 border border-border-subtle rounded-xl flex items-center gap-2">
          <FileCode className="w-4 h-4 text-accent-cyan" />
          <span className="text-text-secondary">Created Test Files:</span>
          <div className="flex gap-1.5 flex-wrap">
            {report.createdFiles.map((f, i) => (
              <code key={i} className="px-2 py-0.5 rounded bg-bg-primary border border-border-subtle text-accent-cyan font-mono text-[11px]">
                {f}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* Individual Scenario Results */}
      <div className="flex flex-col gap-3">
        {report.scenarioResults?.map((sc, idx) => {
          const isExpanded = expandedScenarios[idx];
          return (
            <div
              key={idx}
              className="bg-bg-panel border border-border-subtle rounded-xl overflow-hidden shadow-sm"
            >
              {/* Header */}
              <button
                type="button"
                onClick={() => toggleScenario(idx)}
                className="w-full p-3.5 bg-bg-card/60 hover:bg-bg-card flex items-center justify-between gap-3 text-left transition-colors border-b border-border-subtle"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-accent-cyan shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                  )}
                  {sc.testPassed === true ? (
                    <CheckCircle2 className="w-4 h-4 text-accent-emerald shrink-0" />
                  ) : sc.testPassed === false ? (
                    <XCircle className="w-4 h-4 text-accent-rose shrink-0" />
                  ) : (
                    <Terminal className="w-4 h-4 text-text-muted shrink-0" />
                  )}
                  <div className="font-semibold text-text-bright truncate">
                    {sc.scenarioId ? `${sc.scenarioId}. ` : ''}{sc.scenarioTitle}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {sc.parsedRiskCategory && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-accent-amber/15 text-accent-amber border border-accent-amber/30">
                      {sc.parsedRiskCategory}
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      sc.testPassed === true
                        ? 'bg-accent-emerald/20 text-accent-emerald'
                        : sc.testPassed === false
                        ? 'bg-accent-rose/20 text-accent-rose'
                        : 'bg-bg-card text-text-muted'
                    }`}
                  >
                    {sc.testPassed === true ? 'PASSED' : sc.testPassed === false ? 'FAILED' : 'NO TEST RUN'}
                  </span>
                </div>
              </button>

              {/* Body */}
              {isExpanded && (
                <div className="p-4 flex flex-col gap-3 bg-[#0d1117]">
                  {/* Summary */}
                  {sc.finalSummary && <MarkdownViewer content={sc.finalSummary} />}

                  {/* Terminal Execution Logs */}
                  {sc.executionLogs && sc.executionLogs.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
                        <Terminal className="w-3.5 h-3.5 text-accent-cyan" />
                        <span>Command Execution Output ({sc.executionLogs.length})</span>
                      </div>

                      {sc.executionLogs.map((log, lIdx) => (
                        <div key={lIdx} className="rounded-lg overflow-hidden border border-border-subtle bg-bg-primary text-[11px] font-mono">
                          <div className="px-3 py-1.5 bg-bg-card flex items-center justify-between border-b border-border-subtle/50 text-text-secondary">
                            <span className="text-text-bright font-bold">$ {log.command}</span>
                            <span className={log.exitCode === 0 ? 'text-accent-emerald' : 'text-accent-rose'}>
                              exit {log.exitCode}
                            </span>
                          </div>

                          <div className="p-3 max-h-48 overflow-y-auto leading-relaxed">
                            {log.stdout && (
                              <pre className="text-emerald-300/90 whitespace-pre-wrap">{log.stdout}</pre>
                            )}
                            {log.stderr && (
                              <pre className="text-rose-300/90 whitespace-pre-wrap mt-1">{log.stderr}</pre>
                            )}
                            {!log.stdout && !log.stderr && (
                              <span className="text-text-muted italic">No stdout/stderr output.</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
