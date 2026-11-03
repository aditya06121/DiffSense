import React, { useState, useEffect } from 'react';
import { GitFork, KeyRound, Plus, RefreshCw, CheckCircle2, ChevronUp } from 'lucide-react';
import { api } from '../../api/client';
import { SystemHealth } from '../../types';

interface NavbarProps {
  onOpenAddModal: () => void;
  onRefreshAll: () => void;
  onToggleCollapse?: () => void;
  isSyncing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAddModal,
  onRefreshAll,
  onToggleCollapse,
  isSyncing = false,
}) => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Check health on mount and every 15 seconds
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const data = await api.getHealth();
        if (mounted) setHealth(data);
      } catch {
        if (mounted) setHealth(null);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleCopySshKey = async () => {
    // Default public key or query from backend if available
    const sshKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPqA1W/Q/Jv3m9f0fG/Y1G7b1lDq+8L0jG5n6K9Y0v7+ automation-bit';
    await navigator.clipboard.writeText(sshKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefreshAll();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const isUp = health?.status === 'UP';

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 bg-bg-panel border border-border-subtle rounded-xl shadow-lg">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-accent-indigo to-accent-cyan flex items-center justify-center text-white shadow-md">
          <GitFork className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-text-bright tracking-tight">automation-framework</h1>
            <span className="text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-accent-indigo/20 text-accent-indigo border border-accent-indigo/30">
              v3.0
            </span>
          </div>
          <p className="text-xs text-text-secondary">Repository Intelligence, Diff Studio & AI Test Agent</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Backend status pill */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            isUp
              ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald'
              : 'bg-accent-rose/10 border-accent-rose/30 text-accent-rose'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isUp ? 'bg-accent-emerald animate-pulse' : 'bg-accent-rose'}`} />
          <span>{isUp ? 'Engine Operational' : 'Engine Offline'}</span>
        </div>

        {/* Copy SSH Key button */}
        <button
          onClick={handleCopySshKey}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-card border border-border-subtle hover:border-border-glow text-text-primary hover:text-text-bright transition-all shadow-sm"
          title="Copy deployment SSH public key"
        >
          {copiedKey ? <CheckCircle2 className="w-3.5 h-3.5 text-accent-emerald" /> : <KeyRound className="w-3.5 h-3.5 text-accent-cyan" />}
          <span>{copiedKey ? 'Copied Key!' : 'SSH Key'}</span>
        </button>

        {/* Global Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing || isSyncing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-bg-card border border-border-subtle hover:border-border-glow text-text-primary hover:text-text-bright transition-all shadow-sm disabled:opacity-50"
          title="Refresh All Data"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || isSyncing ? 'animate-spin text-accent-cyan' : ''}`} />
          <span>{isSyncing ? 'Syncing...' : 'Refresh'}</span>
        </button>

        {/* Add Repository button */}
        <button
          onClick={onOpenAddModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-indigo hover:bg-accent-indigo/90 text-white transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Repo</span>
        </button>

        {/* Compact Mode Toggle */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-bg-card border border-border-subtle hover:border-border-glow text-text-secondary hover:text-text-bright transition-all"
            title="Compact Header Mode (Zen)"
          >
            <ChevronUp className="w-3.5 h-3.5 text-accent-cyan" />
            <span>Compact</span>
          </button>
        )}
      </div>
    </header>
  );
};
