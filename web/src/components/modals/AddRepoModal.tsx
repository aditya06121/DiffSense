import React, { useState } from 'react';
import { X, Plus, FolderGit2, Loader2 } from 'lucide-react';
import { api } from '../../api/client';

interface AddRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddRepoModal: React.FC<AddRepoModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [repoId, setRepoId] = useState('');
  const [sshUrl, setSshUrl] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoId.trim() || !sshUrl.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await api.addRepository({
        id: repoId.trim(),
        ssh: sshUrl.trim(),
        defaultBranch: defaultBranch.trim() || 'main',
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add repository.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-bg-panel border border-border-subtle rounded-2xl shadow-2xl overflow-hidden text-xs">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle bg-bg-card flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-accent-cyan" />
            <h3 className="text-sm font-bold text-text-bright">Add Bitbucket Repository</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-bright hover:bg-bg-panel transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          {error && (
            <div className="p-3 rounded-lg bg-accent-rose/15 border border-accent-rose/30 text-accent-rose">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-text-bright">Repository ID</label>
            <input
              type="text"
              value={repoId}
              onChange={(e) => setRepoId(e.target.value)}
              placeholder="e.g. altdrx-nodejs-microservice"
              required
              className="px-3 py-2 rounded-lg bg-bg-card border border-border-subtle text-text-bright focus:outline-none focus:border-border-glow font-mono text-xs"
            />
            <span className="text-[11px] text-text-muted">Unique local identifier for the repository</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-text-bright">Bitbucket SSH Clone URL</label>
            <input
              type="text"
              value={sshUrl}
              onChange={(e) => setSshUrl(e.target.value)}
              placeholder="git@bitbucket.org:owner/repo.git"
              required
              className="px-3 py-2 rounded-lg bg-bg-card border border-border-subtle text-text-bright focus:outline-none focus:border-border-glow font-mono text-xs"
            />
            <span className="text-[11px] text-text-muted">SSH clone address for Bitbucket repo</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-semibold text-text-bright">Default Branch</label>
            <input
              type="text"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              placeholder="main or master"
              className="px-3 py-2 rounded-lg bg-bg-card border border-border-subtle text-text-bright focus:outline-none focus:border-border-glow font-mono text-xs"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-border-subtle hover:bg-bg-card text-text-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-semibold text-white bg-accent-indigo hover:bg-accent-indigo/90 transition-all shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{isSubmitting ? 'Cloning & Adding...' : 'Add Repository'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

