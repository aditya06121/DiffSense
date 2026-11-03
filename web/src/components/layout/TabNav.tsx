import React from 'react';
import { GitCompare, FlaskConical, FileText, Activity, ShieldCheck } from 'lucide-react';

export type TabId = 'diff' | 'studio' | 'prd' | 'monitor' | 'directives';

interface TabNavProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  hasActiveTestRun?: boolean;
  hasActivePrd?: boolean;
}

export const TabNav: React.FC<TabNavProps> = ({
  activeTab,
  onSelectTab,
  hasActiveTestRun,
  hasActivePrd,
}) => {
  const tabs = [
    { id: 'diff' as TabId, label: 'Diff Explorer', icon: GitCompare },
    { id: 'studio' as TabId, label: 'AI Test Studio', icon: FlaskConical, badge: hasActiveTestRun },
    { id: 'prd' as TabId, label: 'PRD & Tech Spec', icon: FileText, badge: hasActivePrd },
    { id: 'monitor' as TabId, label: 'Engine & Job Monitor', icon: Activity },
    { id: 'directives' as TabId, label: 'Engineering Directives', icon: ShieldCheck },
  ];

  return (
    <nav className="flex items-center gap-1 border-b border-border-subtle px-1 text-xs">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelectTab(t.id)}
            className={`relative flex items-center gap-2 px-4 py-2.5 font-medium transition-all rounded-t-lg -mb-px border-b-2 ${
              isActive
                ? 'border-accent-cyan text-text-bright bg-bg-card/50'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-panel/40'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-accent-cyan' : 'text-text-muted'}`} />
            <span>{t.label}</span>
            {t.badge && (
              <span className="w-2 h-2 rounded-full bg-accent-indigo animate-ping ml-0.5" />
            )}
          </button>
        );
      })}
    </nav>
  );
};

