import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, CheckCircle2, XCircle, Play } from 'lucide-react';
import { api } from '../../api/client';
import { JobResult, Repository } from '../../types';

interface JobMonitorProps {
  repositories: Repository[];
}

export const JobMonitor: React.FC<JobMonitorProps> = ({ repositories }) => {
  const [jobs, setJobs] = useState<JobResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  const fetchHistory = async () => {
    try {
      const data = await api.getJobHistory();
      setJobs(data.reverse()); // latest first
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    try {
      await api.triggerSync();
      await fetchHistory();
    } finally {
      setIsSyncingAll(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Top Banner: Daemon & Concurrency status */}
      <div className="p-4 bg-bg-panel border border-border-subtle rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-cyan/15 border border-accent-cyan/30 flex items-center justify-center text-accent-cyan">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-text-bright">Engine & Job Telemetry</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30">
                On-Demand Synchronization
              </span>
            </div>
            <p className="text-text-secondary mt-0.5">
              Live monitor for on-demand sync cycles, lock concurrency, and job executions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchHistory}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-card border border-border-subtle hover:border-border-glow text-text-primary transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5 text-accent-cyan" />
            <span>Refresh Telemetry</span>
          </button>

          <button
            onClick={handleSyncAll}
            disabled={isSyncingAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-indigo hover:bg-accent-indigo/90 text-white font-semibold transition-all disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isSyncingAll ? 'Triggering...' : 'Sync All Repositories'}</span>
          </button>
        </div>
      </div>

      {/* Managed Repositories Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {repositories.map((r) => (
          <div key={r.id} className="p-3.5 bg-bg-panel border border-border-subtle rounded-xl flex flex-col gap-2 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-text-bright text-sm">{r.id}</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  r.isCloned
                    ? 'bg-accent-emerald/15 text-accent-emerald border border-accent-emerald/30'
                    : 'bg-accent-amber/15 text-accent-amber border border-accent-amber/30'
                }`}
              >
                {r.isCloned ? 'Cloned & Ready' : 'Not Cloned'}
              </span>
            </div>

            <div className="text-[11px] text-text-secondary font-mono truncate">
              Default branch: <span className="text-text-bright">{r.defaultBranch || 'main'}</span>
            </div>

            <div className="text-[11px] text-text-muted font-mono truncate">
              HEAD: <span className="text-accent-cyan">{r.currentCommit?.substring(0, 7) || '—'}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Job Execution History Table */}
      <div className="bg-bg-panel border border-border-subtle rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-border-subtle bg-bg-card/50 flex items-center justify-between">
          <span className="font-bold text-text-bright text-sm">Execution History ({jobs.length})</span>
          <span className="text-text-muted text-[11px]">On-demand telemetry</span>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-center text-text-muted text-xs">Loading execution history...</div>
          ) : jobs.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-xs">No jobs executed yet.</div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border-subtle bg-bg-header/20 text-text-secondary font-semibold">
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Job Name</th>
                  <th className="px-4 py-2.5">Job ID</th>
                  <th className="px-4 py-2.5">Duration</th>
                  <th className="px-4 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/40 font-mono text-[11px]">
                {jobs.map((j, idx) => (
                  <tr key={idx} className="hover:bg-bg-card/40 transition-colors">
                    <td className="px-4 py-2.5">
                      {j.success ? (
                        <span className="inline-flex items-center gap-1 text-accent-emerald font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Success</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-accent-rose font-semibold">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-bold text-text-bright font-sans">{j.jobName}</td>
                    <td className="px-4 py-2.5 text-text-muted">{j.jobId}</td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {(j.durationMs / 1000).toFixed(2)}s
                    </td>
                    <td className="px-4 py-2.5 text-text-muted max-w-xs truncate">
                      {j.error ? (
                        <span className="text-accent-rose">{j.error.message}</span>
                      ) : j.metadata ? (
                        <span>
                          {j.metadata.repoId ? `repo: ${j.metadata.repoId} ` : ''}
                          {j.metadata.commitHash ? `sha: ${j.metadata.commitHash.substring(0, 7)} ` : ''}
                          {j.metadata.skipped ? '(concurrent skip)' : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
