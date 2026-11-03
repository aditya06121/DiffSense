import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-md animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div
        className={`flex items-start gap-3 p-3.5 rounded-xl border shadow-2xl backdrop-blur-md ${
          isSuccess
            ? 'bg-bg-panel/95 border-accent-emerald/40 text-text-primary shadow-accent-emerald/10'
            : isError
            ? 'bg-bg-panel/95 border-accent-rose/40 text-text-primary shadow-accent-rose/10'
            : 'bg-bg-panel/95 border-accent-cyan/40 text-text-primary shadow-accent-cyan/10'
        }`}
      >
        <div className="shrink-0 mt-0.5">
          {isSuccess && <CheckCircle2 className="w-4 h-4 text-accent-emerald" />}
          {isError && <AlertCircle className="w-4 h-4 text-accent-rose" />}
          {!isSuccess && !isError && <Info className="w-4 h-4 text-accent-cyan" />}
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <h4 className="text-xs font-bold text-text-bright tracking-tight leading-tight">
            {toast.title}
          </h4>
          {toast.message && (
            <p className="text-[11px] text-text-secondary mt-1 leading-snug break-words">
              {toast.message}
            </p>
          )}
        </div>

        <button
          onClick={onDismiss}
          className="shrink-0 text-text-muted hover:text-text-bright p-1 rounded-md hover:bg-bg-card transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

