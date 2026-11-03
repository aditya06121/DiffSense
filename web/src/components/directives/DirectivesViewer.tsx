import React, { useState } from 'react';
import { BookOpen, Search } from 'lucide-react';

export const DirectivesViewer: React.FC = () => {
  const [search, setSearch] = useState('');

  const rules = [
    {
      id: 'OOP-01',
      category: 'Object-Oriented & Architecture',
      level: 'CRITICAL',
      title: 'Tactical Extension (Open-Closed Principle)',
      desc: 'Modifying a 1000-line live class to inject a single new feature introduces catastrophic regression risk. Extend via composition or inheritance.',
    },
    {
      id: 'OOP-06',
      category: 'Object-Oriented & Architecture',
      level: 'CRITICAL',
      title: 'One Component Per File',
      desc: 'Dumping multiple full-scale React components or Flutter widgets into a single 1000+ line file destroys readability and modularity.',
    },
    {
      id: 'OOP-08',
      category: 'Object-Oriented & Architecture',
      level: 'CRITICAL',
      title: 'Configuration Injection',
      desc: 'Hardcoding values (endpoints, feature toggles, IDs) couples the code to a specific environment. Inject via config.',
    },
    {
      id: 'OOP-15',
      category: 'Object-Oriented & Architecture',
      level: 'CRITICAL',
      title: 'Type Casting Safety',
      desc: 'Blindly casting objects using as (Dart) or any (TypeScript) explicitly tells the compiler to turn off safety checks.',
    },
    {
      id: 'DAT-01',
      category: 'Data Flow & State Management',
      level: 'CRITICAL',
      title: 'Single Source of Truth (SSOT)',
      desc: 'If the users wallet balance exists in the Redux store, a local component variable, and a cache simultaneously, the UI will desync.',
    },
    {
      id: 'DAT-04',
      category: 'Data Flow & State Management',
      level: 'CRITICAL',
      title: 'Immutable State Updates',
      desc: 'Mutating a state object directly (e.g. list.push(item)) does not change memory references, breaking UI change detection.',
    },
    {
      id: 'DAT-08',
      category: 'Data Flow & State Management',
      level: 'CRITICAL',
      title: 'Prevent Race Conditions',
      desc: 'Rapid typing or asynchronous triggers can cause out-of-order response resolutions. Debounce, cancel, or sequence requests.',
    },
    {
      id: 'DAT-24',
      category: 'Data Flow & State Management',
      level: 'CRITICAL',
      title: 'Idempotency on Retries',
      desc: 'If a payment or critical state mutation request drops on network return, retrying must use an idempotent key to avoid double-charging.',
    },
    {
      id: 'DAT-37',
      category: 'Data Flow & State Management',
      level: 'CRITICAL',
      title: 'Transactional Integrity',
      desc: 'If an operation requires deducting a wallet and creating an asset, both steps must occur in a strict atomic database transaction.',
    },
    {
      id: 'DAT-40',
      category: 'Data Flow & State Management',
      level: 'CRITICAL',
      title: 'Circuit Breaker Pattern',
      desc: 'If a core API calls a third-party KYC or payment microservice that goes down, implement a circuit breaker to prevent cascading failures.',
    },
    {
      id: 'OOP-02',
      category: 'Object-Oriented & Architecture',
      level: 'HIGH',
      title: 'Single Responsibility Separation (SRP)',
      desc: 'UI components should not handle raw API fetching, JSON decryption, and storage routing simultaneously.',
    },
    {
      id: 'OOP-09',
      category: 'Object-Oriented & Architecture',
      level: 'HIGH',
      title: 'Avoid God Objects',
      desc: 'Files exceeding 300-500 lines are a red flag for mixed concerns and low cohesion.',
    },
    {
      id: 'DAT-29',
      category: 'Data Flow & State Management',
      level: 'HIGH',
      title: 'Caching Expiration (TTL)',
      desc: 'Storing financial data in localStorage or device cache without a Time-To-Live ensures obsolete data delivery.',
    },
  ];

  const filtered = rules.filter(
    (r) =>
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.desc.toLowerCase().includes(search.toLowerCase()) ||
      r.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 text-xs">
      {/* Banner */}
      <div className="p-4 bg-bg-panel border border-border-subtle rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-indigo/15 border border-accent-indigo/30 flex items-center justify-center text-accent-indigo">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-bright">Alt DRX Engineering Directives Reference</h3>
            <p className="text-text-secondary mt-0.5">
              These architecture & data safety directives guide the AI Test Generator when categorizing risk scenarios.
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search rule ID or topic..."
            className="w-full bg-bg-card border border-border-subtle rounded-lg pl-8 pr-3 py-1.5 text-xs text-text-bright focus:outline-none focus:border-border-glow"
          />
        </div>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map((r) => {
          const isCritical = r.level === 'CRITICAL';
          return (
            <div
              key={r.id}
              className="p-4 bg-bg-panel border border-border-subtle rounded-xl flex flex-col gap-2 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono font-bold text-text-bright">{r.id}</code>
                  <span className="text-[11px] font-semibold text-text-secondary">&bull; {r.category}</span>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    isCritical
                      ? 'bg-accent-rose/15 text-accent-rose border-accent-rose/30'
                      : 'bg-accent-amber/15 text-accent-amber border-accent-amber/30'
                  }`}
                >
                  {r.level}
                </span>
              </div>

              <div className="text-xs font-bold text-text-bright mt-0.5">{r.title}</div>
              <p className="text-text-secondary leading-relaxed text-xs">{r.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
