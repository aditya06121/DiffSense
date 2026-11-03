import React, { useState, useMemo } from 'react';
import { marked } from 'marked';
import { Copy, Check } from 'lucide-react';

interface MarkdownViewerProps {
  content: string;
  className?: string;
  showCopyButton?: boolean;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({
  content,
  className = '',
  showCopyButton = true,
}) => {
  const [copied, setCopied] = useState(false);

  // Configure marked for clean, GitHub-flavored markdown parsing
  const htmlContent = useMemo(() => {
    try {
      return marked.parse(content || '', {
        gfm: true,
        breaks: true,
        async: false,
      }) as string;
    } catch (err) {
      console.error('Failed to parse markdown:', err);
      return `<p>${content}</p>`;
    }
  }, [content]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className={`relative group ${className}`}>
      {showCopyButton && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bg-card/90 border border-border-subtle hover:border-border-glow text-text-secondary hover:text-text-bright transition-all text-xs opacity-75 hover:opacity-100 shadow-sm backdrop-blur-xs"
          title="Copy markdown content"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-accent-emerald" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      )}

      <div
        className="markdown-body p-5 bg-bg-card rounded-xl border border-border-subtle overflow-x-auto selection:bg-accent-indigo selection:text-white"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  );
};

