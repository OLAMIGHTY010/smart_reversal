import React, { useState, useEffect } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiClient } from '../services/apiClient';
import { StatusBadge } from '../components/StatusBadge';
import type { Transaction } from '../types/domain';

export const GlobalSearchModal: React.FC = () => {
  const { globalSearchOpen, setGlobalSearchOpen, setActiveView, setSelectedTransactionId } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [liveTransactions, setLiveTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (globalSearchOpen) {
      apiClient.getTransactions().then(setLiveTransactions).catch(() => {});
    }
  }, [globalSearchOpen]);

  if (!globalSearchOpen) return null;

  const filtered = liveTransactions.filter((t) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      t.reference.toLowerCase().includes(q) ||
      t.rrn.includes(q) ||
      t.stan.includes(q) ||
      t.senderAccount.includes(q) ||
      t.beneficiaryAccount.includes(q) ||
      t.amount.includes(q)
    );
  }).slice(0, 6);

  const handleSelect = (id: string) => {
    setSelectedTransactionId(id);
    setActiveView('transactions');
    setGlobalSearchOpen(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Global Transaction & Case Search"
    >
      <div className="w-full max-w-2xl bg-[var(--surface)] border border-[var(--surface-border)] rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
        {/* Search Input Bar */}
        <div className="relative border-b border-[var(--surface-border)] bg-[var(--surface)] flex items-center px-4">
          <Search className="w-5 h-5 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search transactions, exceptions, RRNs, STANs, account numbers... (Esc to close)"
            className="w-full py-3.5 px-3 text-[14px] bg-transparent text-[var(--text-primary)] focus:outline-none placeholder-[var(--text-muted)]"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setGlobalSearchOpen(false)}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto divide-y divide-[var(--surface-border-subtle)] p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-[var(--text-muted)]">
              No matching transactions or switch references found.
            </div>
          ) : (
            filtered.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className="p-3 rounded hover:bg-[var(--canvas-subdued)] cursor-pointer flex items-center justify-between gap-3 text-[13px] transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)] font-mono-financial">
                      {item.reference}
                    </span>
                    <span className="text-[11px] font-mono-financial text-[var(--text-muted)]">
                      RRN: {item.rrn} • STAN: {item.stan}
                    </span>
                  </div>
                  <div className="text-[12px] text-[var(--text-secondary)]">
                    {item.channel} • {item.senderBank} ({item.senderAccount}) → {item.beneficiaryBank}
                  </div>
                </div>

                <div className="text-right flex items-center gap-3">
                  <div>
                    <div className="font-bold font-mono-financial text-[var(--text-primary)]">
                      {item.currency} {Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="mt-0.5">
                      <StatusBadge status={item.status} size="sm" />
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)]" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-[var(--canvas-subdued)] border-t border-[var(--surface-border)] flex items-center justify-between text-[11px] text-[var(--text-muted)] font-mono-financial">
          <div>Navigation: <span className="bg-[var(--surface)] px-1.5 py-0.5 rounded border border-[var(--surface-border)]">↑↓</span> to navigate</div>
          <div>Select: <span className="bg-[var(--surface)] px-1.5 py-0.5 rounded border border-[var(--surface-border)]">Enter</span></div>
          <div>Close: <span className="bg-[var(--surface)] px-1.5 py-0.5 rounded border border-[var(--surface-border)]">Esc</span></div>
        </div>
      </div>
    </div>
  );
};
