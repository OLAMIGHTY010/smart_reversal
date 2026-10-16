import React, { useState } from 'react';
import {
  Clock,
  ArrowRight,
  Plus,
  Search,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../../components/Button';
import type { CustomerDisputeCase } from './reverseitTypes';

export interface MyCasesViewProps {
  cases: CustomerDisputeCase[];
  onSelectCase: (disputeCase: CustomerDisputeCase) => void;
  onStartNewReport: () => void;
}

export const MyCasesView: React.FC<MyCasesViewProps> = ({
  cases,
  onSelectCase,
  onStartNewReport,
}) => {
  const [trackingQuery, setTrackingQuery] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Live cases submitted by customer
  const displayedCases = cases;

  const handleLookup = (e: React.FormEvent) => {
    e.preventDefault();
    const query = trackingQuery.trim().toLowerCase();
    if (!query) return;

    // Search within customer's own reports first, then match by exact tracking ID / Case reference
    const found = displayedCases.find(
      (c) =>
        c.caseNumber.toLowerCase() === query ||
        c.trackingId.toLowerCase() === query ||
        c.reference.toLowerCase() === query
    );

    if (found) {
      setLookupError(null);
      onSelectCase(found);
    } else {
      setLookupError('No dispute case found matching that Tracking ID or Case Reference.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-2 px-2 sm:px-4 space-y-6 animate-in fade-in duration-200">
      {/* Title & Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-[var(--text-primary)]">
            My Dispute Cases ({displayedCases.length})
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
            Real-time status tracking, switch queries, and Central Bank of Nigeria (CBN) resolution clocks.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onStartNewReport}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Report New Dispute
        </Button>
      </div>

      {/* Private Tracking Lookup by Reference / Tracking ID */}
      <div className="p-4 bg-[var(--surface)] border border-[var(--surface-border)] rounded-2xl space-y-2 shadow-2xs">
        <label htmlFor="tracking-search-input" className="block text-xs font-bold text-[var(--text-primary)]">
          Track a Case by Tracking ID or Reference Number
        </label>
        <form onSubmit={handleLookup} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5 pointer-events-none" />
            <input
              id="tracking-search-input"
              type="text"
              value={trackingQuery}
              onChange={(e) => {
                setTrackingQuery(e.target.value);
                setLookupError(null);
              }}
              placeholder="e.g. TRK-990142 or CUS-2026-004417"
              className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded-xl font-mono-financial focus:outline-none focus:border-[var(--primary)] text-[var(--text-primary)]"
            />
          </div>
          <Button variant="secondary" size="sm" type="submit">
            Search
          </Button>
        </form>
        {lookupError && (
          <div className="flex items-center gap-1.5 text-xs text-rose-600 mt-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{lookupError}</span>
          </div>
        )}
      </div>

      {/* Cases List */}
      {displayedCases.length === 0 ? (
        <div className="p-8 sm:p-12 text-center bg-[var(--surface)] border border-[var(--surface-border)] rounded-2xl space-y-4 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mx-auto">
            <Clock className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-[17px] font-bold text-[var(--text-primary)]">
              No active disputes filed yet
            </h2>
            <p className="text-[13px] text-[var(--text-muted)] max-w-sm mx-auto leading-relaxed">
              Whenever money leaves your account without value, report your debit alert here to initiate an automated investigation.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Button variant="primary" size="md" onClick={onStartNewReport}>
              Report a Transaction Problem &rarr;
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5">
          {displayedCases.map((c) => (
            <div
              key={c.id}
              onClick={() => onSelectCase(c)}
              className="p-5 bg-[var(--surface)] border border-[var(--surface-border)] hover:border-sky-500 rounded-2xl shadow-xs hover:shadow-md transition-all cursor-pointer space-y-3.5 group"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-[15px] font-mono-financial text-[var(--text-primary)] group-hover:text-sky-700 transition-colors">
                      {c.caseNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800">
                      {c.channel} Channel
                    </span>
                    <span className="text-[11px] font-mono-financial text-[var(--text-muted)]">
                      {c.trackingId}
                    </span>
                  </div>
                  <div className="text-[12px] font-mono-financial text-[var(--text-muted)]">
                    Ref: <span className="text-[var(--text-secondary)]">{c.reference}</span> &bull; Reported {new Date(c.reportedAt).toLocaleDateString()}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[20px] font-extrabold font-mono-financial text-[var(--text-primary)] block">
                    {c.currency} {c.amount}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border inline-block mt-0.5 ${
                      c.status === 'VERIFIED_RESOLVED'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-sky-50 text-sky-800 border-sky-200'
                    }`}
                  >
                    {c.status === 'VERIFIED_RESOLVED' ? '✓ ' + c.statusLabel : c.statusLabel}
                  </span>
                </div>
              </div>

              {/* Status summary box */}
              <div
                className={`p-3 rounded-xl border text-[12px] flex items-start gap-2.5 ${
                  c.status === 'VERIFIED_RESOLVED'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 dark:bg-emerald-950/20 dark:border-emerald-800 dark:text-emerald-200'
                    : 'bg-[var(--canvas-subdued)] border-[var(--surface-border-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    c.status === 'VERIFIED_RESOLVED' ? 'text-emerald-600' : 'text-sky-700'
                  }`}
                />
                <span className="leading-relaxed">{c.customerSafeStatusText}</span>
              </div>

              {/* Countdown & details pill */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--surface-border-subtle)] text-[11px]">
                <div className="flex items-center gap-1.5 font-bold text-sky-700">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{c.timeRemainingText}</span>
                </div>
                <span className="text-sky-600 group-hover:translate-x-1 transition-transform flex items-center gap-1 font-semibold">
                  <span>Track lifecycle & escalation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
