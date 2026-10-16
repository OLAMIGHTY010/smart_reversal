import React, { useState, useEffect, useMemo } from 'react';
import { ShieldAlert, Sparkles } from 'lucide-react';
import { DataTable, type ColumnDef } from '../components/DataTable';
import { SearchFilterBar, type SavedView } from '../components/SearchFilterBar';
import { StatusBadge } from '../components/StatusBadge';
import { RiskConfidenceIndicator } from '../components/RiskConfidenceIndicator';
import { SideDrawer } from '../components/SideDrawer';
import { MaskedField } from '../components/MaskedField';
import { Timeline } from '../components/Timeline';
import { Button } from '../components/Button';
import { useApp } from '../context/AppContext';
import { apiClient } from '../services/apiClient';
import type { Transaction, Channel, FinancialStatus } from '../types/domain';

export const TransactionsView: React.FC = () => {
  const { selectedTransactionId, setSelectedTransactionId, role, setActiveView, addToast } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    let isMounted = true;
    apiClient.getTransactions().then((txs) => {
      if (isMounted) setTransactions(txs);
    }).catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Filters
  const [query, setQuery] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<Channel | undefined>();
  const [selectedStatus, setSelectedStatus] = useState<FinancialStatus | undefined>();
  const [activeSavedViewId, setActiveSavedViewId] = useState<string | undefined>();

  // Selected row for inspection drawer
  const [drawerTab, setDrawerTab] = useState<'overview' | 'timeline' | 'actions'>('overview');

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (t) =>
          t.reference.toLowerCase().includes(q) ||
          t.rrn.includes(q) ||
          t.stan.includes(q) ||
          t.senderAccount.includes(q) ||
          t.beneficiaryAccount.includes(q)
      );
    }
    if (selectedChannel) {
      result = result.filter((t) => t.channel === selectedChannel);
    }
    if (selectedStatus) {
      result = result.filter((t) => t.status === selectedStatus);
    }
    return result;
  }, [transactions, query, selectedChannel, selectedStatus]);

  const inspectingTxn = useMemo(() => {
    if (!selectedTransactionId) return null;
    return transactions.find((t) => t.id === selectedTransactionId) || null;
  }, [selectedTransactionId, transactions]);

  const handleSavedViewSelect = (sv: SavedView) => {
    setActiveSavedViewId(sv.id);
    setQuery(sv.filters.query || '');
    setSelectedChannel(sv.filters.channel);
    setSelectedStatus(sv.filters.status);
  };

  const handleClearFilters = () => {
    setQuery('');
    setSelectedChannel(undefined);
    setSelectedStatus(undefined);
    setActiveSavedViewId(undefined);
  };

  // Define Columns
  const columns: ColumnDef<Transaction>[] = [
    {
      id: 'reference',
      header: 'Reference',
      accessorKey: 'reference',
      cell: ({ row }) => (
        <span className="font-mono-financial font-semibold text-[var(--primary)] hover:underline">
          {row.reference}
        </span>
      ),
      minWidth: 180,
    },
    {
      id: 'amount',
      header: 'Amount',
      accessorKey: 'amount',
      cell: ({ row }) => (
        <div className="font-mono-financial font-bold">
          {row.currency} {Number(row.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
      ),
      minWidth: 130,
    },
    {
      id: 'channel',
      header: 'Channel',
      accessorKey: 'channel',
      cell: ({ row }) => (
        <span className="px-1.5 py-0.5 rounded bg-[var(--canvas-subdued)] border border-[var(--surface-border)] text-[11px] font-mono-financial font-medium">
          {row.channel}
        </span>
      ),
      minWidth: 90,
    },
    {
      id: 'status',
      header: 'Lifecycle Status',
      accessorKey: 'status',
      cell: ({ row }) => <StatusBadge status={row.status} size="sm" />,
      minWidth: 150,
    },
    {
      id: 'confidence',
      header: 'Model / Verification',
      cell: ({ row }) => (
        <RiskConfidenceIndicator
          modelConfidence={row.modelConfidence}
          isVerified={row.isVerified}
        />
      ),
      minWidth: 180,
    },
    {
      id: 'senderAccount',
      header: 'Originator Account',
      accessorKey: 'senderAccount',
      cell: ({ row }) => (
        <span className="font-mono-financial text-[12px]">{row.senderAccount} ({row.senderBank.split(' ')[0]})</span>
      ),
      minWidth: 170,
    },
    {
      id: 'beneficiaryAccount',
      header: 'Beneficiary Account',
      accessorKey: 'beneficiaryAccount',
      cell: ({ row }) => (
        <span className="font-mono-financial text-[12px]">{row.beneficiaryAccount} ({row.beneficiaryBank.split(' ')[0]})</span>
      ),
      minWidth: 170,
    },
    {
      id: 'maskedPan',
      header: 'Card PAN (Masked)',
      cell: ({ row }) =>
        row.maskedPan ? (
          <MaskedField
            maskedValue={row.maskedPan}
            revealedValue="5399 1042 8819 4019"
            fieldLabel="Card PAN"
            entityId={row.id}
          />
        ) : (
          <span className="text-[var(--text-muted)] text-[11px]">—</span>
        ),
      minWidth: 180,
    },
    {
      id: 'createdAt',
      header: 'Timestamp',
      accessorKey: 'createdAt',
      cell: ({ row }) => (
        <span className="text-[12px] font-mono-financial text-[var(--text-muted)]">
          {new Date(row.createdAt).toLocaleTimeString()}
        </span>
      ),
      minWidth: 100,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <SearchFilterBar
        query={query}
        onQueryChange={setQuery}
        selectedChannel={selectedChannel}
        onChannelChange={setSelectedChannel}
        selectedStatus={selectedStatus}
        onStatusChange={setSelectedStatus}
        activeSavedViewId={activeSavedViewId}
        onSelectSavedView={handleSavedViewSelect}
        onClearFilters={handleClearFilters}
      />

      {/* Main Dense / Comfortable Data Table */}
      <DataTable
        data={filteredTransactions}
        columns={columns}
        pageSize={10}
        onRowClick={(row) => {
          setSelectedTransactionId(row.id);
        }}
        exportFilename="smartreversal_transactions.csv"
        bulkActions={[
          {
            id: 'batch-export',
            label: 'Export Selected',
            variant: 'secondary',
            onClick: (rows) => {
              addToast({
                type: 'success',
                title: 'Export Generated',
                message: `Exported ${rows.length} transactions to CSV`,
              });
            },
          },
        ]}
      />

      {/* Deep Inspection Side Drawer */}
      <SideDrawer
        isOpen={Boolean(inspectingTxn)}
        onClose={() => setSelectedTransactionId(null)}
        title="Transaction Investigation Dossier"
        subtitle={inspectingTxn ? `${inspectingTxn.reference} • RRN: ${inspectingTxn.rrn} • STAN: ${inspectingTxn.stan}` : ''}
        width="lg"
      >
        {inspectingTxn && (
          <div className="space-y-5">
            {/* Drawer Tabs */}
            <div className="flex items-center gap-1 border-b border-[var(--surface-border)] text-[13px]">
              <button
                type="button"
                onClick={() => setDrawerTab('overview')}
                className={`px-3 py-2 font-medium border-b-2 cursor-pointer ${
                  drawerTab === 'overview'
                    ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Overview & Ledger
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('timeline')}
                className={`px-3 py-2 font-medium border-b-2 cursor-pointer ${
                  drawerTab === 'timeline'
                    ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Audit Chain Timeline
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('actions')}
                className={`px-3 py-2 font-medium border-b-2 cursor-pointer ${
                  drawerTab === 'actions'
                    ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                Maker Resolution Actions
              </button>
            </div>

            {/* Tab 1: Overview */}
            {drawerTab === 'overview' && (
              <div className="space-y-4 text-[13px]">
                {/* Financial Summary Box */}
                <div className="p-4 bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded-md flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-[var(--text-muted)] font-medium">Posted Ledger Amount</span>
                    <div className="text-[22px] font-bold font-mono-financial text-[var(--text-primary)]">
                      {inspectingTxn.currency} {Number(inspectingTxn.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <StatusBadge status={inspectingTxn.status} />
                </div>

                {/* Details Grid */}
                <div className="border border-[var(--surface-border)] rounded-md p-3 divide-y divide-[var(--surface-border-subtle)] space-y-2 text-[12px]">
                  <div className="flex justify-between pt-1">
                    <span className="text-[var(--text-muted)]">Switch RRN:</span>
                    <strong className="font-mono-financial">{inspectingTxn.rrn}</strong>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="text-[var(--text-muted)]">System Trace Audit Number (STAN):</span>
                    <strong className="font-mono-financial">{inspectingTxn.stan}</strong>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="text-[var(--text-muted)]">Payment Channel:</span>
                    <span className="font-semibold">{inspectingTxn.channel}</span>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="text-[var(--text-muted)]">Originator:</span>
                    <span className="font-mono-financial">{inspectingTxn.senderAccount} ({inspectingTxn.senderBank})</span>
                  </div>
                  <div className="flex justify-between pt-2">
                    <span className="text-[var(--text-muted)]">Beneficiary:</span>
                    <span className="font-mono-financial">{inspectingTxn.beneficiaryAccount} ({inspectingTxn.beneficiaryBank})</span>
                  </div>
                  <div className="flex justify-between pt-2 items-center">
                    <span className="text-[var(--text-muted)]">Masked Card PAN:</span>
                    {inspectingTxn.maskedPan ? (
                      <MaskedField
                        maskedValue={inspectingTxn.maskedPan}
                        revealedValue="5399 1042 8819 4019"
                        fieldLabel="Card PAN"
                        entityId={inspectingTxn.id}
                      />
                    ) : (
                      <span>N/A</span>
                    )}
                  </div>
                </div>

                {/* AI Model Intelligence */}
                <div className="p-3 bg-sky-50/60 border border-sky-200 rounded-md text-sky-950 space-y-1 text-[12px]">
                  <div className="flex items-center gap-1.5 font-semibold text-sky-900">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>AI Model Diagnosis:</span>
                  </div>
                  <p className="text-sky-800">
                    {inspectingTxn.exceptionType
                      ? `Classified as ${inspectingTxn.exceptionType.replace(/_/g, ' ')}. Confidence: ${inspectingTxn.modelConfidence}%.`
                      : 'No discrepancy detected. Transaction cleared and verified.'}
                  </p>
                </div>
              </div>
            )}

            {/* Tab 2: Timeline */}
            {drawerTab === 'timeline' && (
              <Timeline
                events={[
                  {
                    id: 'e-1',
                    timestamp: inspectingTxn.createdAt,
                    actorId: 'core-banking-switch',
                    actorRole: 'ADMIN',
                    action: 'TRANSACTION_INGESTED',
                    entityType: 'TRANSACTION',
                    entityId: inspectingTxn.id,
                    prevHash: '000000000000',
                    entryHash: 'b49281a8c9103e',
                    details: { channel: inspectingTxn.channel, rrn: inspectingTxn.rrn },
                    ipAddress: '10.0.4.1',
                  },
                ]}
              />
            )}

            {/* Tab 3: Actions */}
            {drawerTab === 'actions' && (
              <div className="space-y-4 text-[13px]">
                <p className="text-[var(--text-secondary)]">
                  As an <strong>{role}</strong>, you can initiate a Maker reversal proposal for this transaction. This requires Checker approval before dispatching.
                </p>
                <Button
                  variant="primary"
                  onClick={() => {
                    setActiveView('reversals');
                    addToast({
                      type: 'info',
                      title: 'Drafting Reversal',
                      message: `Initiating Maker reversal proposal for ${inspectingTxn.reference}`,
                    });
                  }}
                  leftIcon={<ShieldAlert className="w-4 h-4" />}
                >
                  Draft Maker Reversal Proposal
                </Button>
              </div>
            )}
          </div>
        )}
      </SideDrawer>
    </div>
  );
};
