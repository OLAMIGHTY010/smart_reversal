import React from 'react';
import {
  Clock,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  ExternalLink,
  HelpCircle,
} from 'lucide-react';
import { Button } from '../../components/Button';
import type { CustomerDisputeCase } from './reverseitTypes';

export interface S8CaseTrackerProps {
  disputeCase: CustomerDisputeCase;
  onBack: () => void;
  onViewEscalation: () => void;
}

export const S8CaseTracker: React.FC<S8CaseTrackerProps> = ({
  disputeCase,
  onBack,
  onViewEscalation,
}) => {
  return (
    <div className="max-w-2xl mx-auto py-2 px-2 sm:px-4 space-y-6 animate-in fade-in duration-200">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to My Cases</span>
      </button>

      {/* Case Header Card */}
      <div className="p-5 sm:p-6 bg-[var(--surface)] border border-[var(--surface-border)] rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-[20px] font-extrabold text-[var(--text-primary)] font-mono-financial">
                {disputeCase.caseNumber}
              </h1>
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider bg-sky-100 text-sky-800">
                {disputeCase.channel} Channel
              </span>
            </div>
            <p className="text-[12px] text-[var(--text-muted)] font-mono-financial">
              Ref: <span className="text-[var(--text-secondary)]">{disputeCase.reference}</span> &bull; Reported {new Date(disputeCase.reportedAt).toLocaleDateString()}
            </p>
          </div>

          <div className="text-right">
            <span className="text-[22px] font-extrabold font-mono-financial text-[var(--text-primary)] block">
              {disputeCase.currency} {disputeCase.amount}
            </span>
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border inline-block mt-0.5 ${
                disputeCase.status === 'VERIFIED_RESOLVED'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-sky-50 text-sky-800 border-sky-200'
              }`}
            >
              {disputeCase.status === 'VERIFIED_RESOLVED' ? '✓ ' + disputeCase.statusLabel : disputeCase.statusLabel}
            </span>
          </div>
        </div>

        {/* Customer Safe Notice Box */}
        <div
          className={`p-4 rounded-xl border text-[12px] flex items-start gap-3 ${
            disputeCase.status === 'VERIFIED_RESOLVED'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-100'
              : 'bg-sky-50 border-sky-200 text-sky-950'
          }`}
        >
          <ShieldCheck
            className={`w-5 h-5 shrink-0 mt-0.5 ${
              disputeCase.status === 'VERIFIED_RESOLVED' ? 'text-emerald-600' : 'text-sky-700'
            }`}
          />
          <div className="space-y-0.5">
            <strong className="font-bold">
              {disputeCase.status === 'VERIFIED_RESOLVED' ? 'Issue Resolved: ' : 'Official Status Notice: '}
            </strong>
            <p
              className={
                disputeCase.status === 'VERIFIED_RESOLVED'
                  ? 'text-emerald-900 dark:text-emerald-200 leading-relaxed font-medium'
                  : 'text-sky-900 leading-relaxed'
              }
            >
              {disputeCase.customerSafeStatusText}
            </p>
          </div>
        </div>
      </div>

      {/* Live SLA & Regulatory Deadlines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
        <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--surface-border)] space-y-1 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-sky-600" />
            <span>Bank Target Window</span>
          </span>
          <span className="text-[15px] font-extrabold font-mono-financial text-[var(--text-primary)] block">
            {disputeCase.status === 'VERIFIED_RESOLVED' ? 'Resolution Complete' : disputeCase.timeRemainingText}
          </span>
          <p className="text-[11px] text-[var(--text-muted)]">
            {disputeCase.status === 'VERIFIED_RESOLVED' ? 'Closed by Bank Operations' : `Target: ${new Date(disputeCase.bankTargetDeadline).toLocaleTimeString()} WAT`}
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--surface)] border border-[var(--surface-border)] space-y-1 shadow-2xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-emerald-600" />
            <span>CBN Regulatory Max</span>
          </span>
          <span className="text-[15px] font-extrabold font-mono-financial text-emerald-700 block">
            {disputeCase.status === 'VERIFIED_RESOLVED' ? 'Statutory SLA Met' : 'Statutory Refund Mandate'}
          </span>
          <p className="text-[11px] text-[var(--text-muted)]">
            {disputeCase.status === 'VERIFIED_RESOLVED' ? 'Settled within mandated timeline' : `Deadline: ${new Date(disputeCase.regulatoryDeadline).toLocaleTimeString()} WAT`}
          </p>
        </div>
      </div>

      {/* Vertical Status Timeline */}
      <div className="p-5 sm:p-6 bg-[var(--surface)] border border-[var(--surface-border)] rounded-2xl space-y-4 shadow-xs">
        <h2 className="text-[15px] font-bold text-[var(--text-primary)]">
          Case Investigation Lifecycle
        </h2>

        <div className="space-y-6 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200">
          {disputeCase.history.map((hist, i) => (
            <div key={hist.stage} className="relative flex items-start gap-4">
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 font-bold text-[11px] transition-all ${
                  hist.verified
                    ? hist.stage === 'VERIFIED_RESOLVED'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-400 border border-slate-300'
                }`}
              >
                {hist.verified ? <CheckCircle2 className="w-4 h-4 stroke-[2.5]" /> : i + 1}
              </span>
              <div className="space-y-0.5 pt-0.5 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[13px] text-[var(--text-primary)]">
                    {hist.label}
                  </span>
                  <span className="text-[11px] font-mono-financial text-[var(--text-muted)]">
                    {hist.timestamp}
                  </span>
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                  {hist.details}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Escalation Ladder Action */}
      <div className="p-4 sm:p-5 bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="space-y-0.5">
          <span className="text-[13px] font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4 text-sky-600" />
            <span>Resolution Past Target or Stalled?</span>
          </span>
          <p className="text-[11px] text-[var(--text-muted)]">
            View the official 3-step escalation ladder (Bank Ombudsman & CBN Consumer Protection).
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={onViewEscalation}
          rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
        >
          View Escalation Ladder &rarr;
        </Button>
      </div>
    </div>
  );
};
