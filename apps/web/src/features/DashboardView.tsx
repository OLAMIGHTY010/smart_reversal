import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertOctagon,
  TrendingUp,
} from 'lucide-react';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { StaleDataBanner } from '../components/StateBanners';
import { ChartWrapper } from '../components/ChartWrapper';
import { useApp } from '../context/AppContext';
import { apiClient } from '../services/apiClient';
import type { ReversalProposal, FinancialException } from '../types/domain';

export const DashboardView: React.FC = () => {
  const { setActiveView } = useApp();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [reversals, setReversals] = useState<ReversalProposal[]>([]);
  const [exceptions, setExceptions] = useState<FinancialException[]>([]);

  const loadLiveMetrics = () => {
    apiClient.getReversals().then(setReversals).catch(() => {});
    apiClient.getExceptions().then(setExceptions).catch(() => {});
  };

  useEffect(() => {
    loadLiveMetrics();
    const handleLiveSync = () => loadLiveMetrics();
    window.addEventListener('smartreversal:new_exception', handleLiveSync);
    window.addEventListener('smartreversal:new_reversal', handleLiveSync);
    window.addEventListener('smartreversal:case_resolved', handleLiveSync);
    return () => {
      window.removeEventListener('smartreversal:new_exception', handleLiveSync);
      window.removeEventListener('smartreversal:new_reversal', handleLiveSync);
      window.removeEventListener('smartreversal:case_resolved', handleLiveSync);
    };
  }, []);

  const pendingReversals = reversals.filter((r) => r.status === 'approval');
  const totalPendingExposure = pendingReversals.reduce(
    (sum, r) => sum + (Number(r.reversalAmount) || 0),
    0
  );
  const activeExceptions = exceptions.filter((e) => e.status !== 'resolved');

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadLiveMetrics();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const volumeTrendData = [
    { label: '06:00', value: 120, formattedValue: '₦1.2B' },
    { label: '08:00', value: 340, formattedValue: '₦3.4B' },
    { label: '10:00', value: 890, formattedValue: '₦8.9B' },
    { label: '12:00', value: 650, formattedValue: '₦6.5B' },
    { label: '14:00', value: 920, formattedValue: '₦9.2B' },
    { label: '16:00', value: 1140, formattedValue: '₦11.4B' },
  ];

  return (
    <div className="space-y-6">
      {/* Telemetry Synchronization Stale-Data Banner */}
      <StaleDataBanner
        lastUpdated="12:45:00 WAT"
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-4 bg-[var(--surface)] border border-[var(--surface-border)] rounded-md shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)] font-medium">
            <span>Reconciliation Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-[26px] font-bold font-mono-financial text-[var(--text-primary)]">
            99.63%
          </div>
          <div className="text-[12px] text-emerald-700 font-medium flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>+0.21% vs 24h cycle benchmark</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-4 bg-[var(--surface)] border border-[var(--surface-border)] rounded-md shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)] font-medium">
            <span>Pending Maker-Checker</span>
            <ShieldAlert className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-[26px] font-bold font-mono-financial text-[var(--text-primary)]">
            {pendingReversals.length} Reversals
          </div>
          <div className="text-[12px] text-[var(--text-secondary)]">
            Total Value: <strong className="font-mono-financial">₦{totalPendingExposure.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-4 bg-[var(--surface)] border border-[var(--surface-border)] rounded-md shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)] font-medium">
            <span>Active Exceptions</span>
            <AlertOctagon className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-[26px] font-bold font-mono-financial text-rose-900">
            {activeExceptions.length} Flagged
          </div>
          <div className="text-[12px] text-rose-700 font-medium">
            {activeExceptions.filter((e) => e.severity === 'CRITICAL').length} Critical ({activeExceptions.length} Active)
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-4 bg-[var(--surface)] border border-[var(--surface-border)] rounded-md shadow-xs space-y-2">
          <div className="flex items-center justify-between text-[12px] text-[var(--text-muted)] font-medium">
            <span>Simulated Switch Feed</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <div className="text-[26px] font-bold font-mono-financial text-[var(--text-primary)]">
            ONLINE
          </div>
          <div className="text-[12px] text-[var(--text-muted)] font-mono-financial">
            NIBSS NIP & POS (14ms latency)
          </div>
        </div>
      </div>

      {/* Middle Row: Trend Chart & Urgent Maker-Checker Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settlement Volume Chart */}
        <div className="lg:col-span-2">
          <ChartWrapper
            title="Intraday Clearing & Settlement Volume"
            subtitle="Hourly transaction throughput across NIP, POS, and Card channels"
            data={volumeTrendData}
            metricLabel="Dispatched Ledger Volume"
          />
        </div>

        {/* Action Items List */}
        <div className="p-4 bg-[var(--surface)] border border-[var(--surface-border)] rounded-md shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-[var(--surface-border)]">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Dual-Control Approval Queue
              </h3>
              <span className="text-[11px] font-mono-financial text-sky-700 bg-sky-50 dark:bg-sky-950/40 border border-sky-200/50 px-1.5 py-0.2 rounded font-medium">
                {pendingReversals.length} Pending
              </span>
            </div>

            <div className="divide-y divide-[var(--surface-border-subtle)] mt-2">
              {pendingReversals.length === 0 ? (
                <div className="py-6 text-center text-[12px] text-[var(--text-muted)]">
                  No pending reversals awaiting dual-control authorization.
                </div>
              ) : (
                pendingReversals.map((rev) => (
                  <div key={rev.id} className="py-2.5 space-y-1 text-[12px]">
                    <div className="flex items-center justify-between">
                      <strong className="font-mono-financial text-[var(--text-primary)]">
                        {rev.reference}
                      </strong>
                      <span className="font-bold font-mono-financial text-[var(--text-primary)]">
                        ₦{Number(rev.reversalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[var(--text-muted)]">
                      <span>{rev.channel} • Maker: {rev.proposedBy.split(' ')[0]}</span>
                      <StatusBadge status="approval" size="sm" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setActiveView('reversals')}
            className="w-full"
          >
            Open Maker-Checker Queue
          </Button>
        </div>
      </div>
    </div>
  );
};
