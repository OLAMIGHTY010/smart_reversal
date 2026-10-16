import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  FileText,
  CheckSquare,
  Square,
  XOctagon,
  Layers,
  Plus,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { ApprovalDialog } from '../components/ApprovalDialog';
import { IrreversibleConfirmDialog } from '../components/IrreversibleConfirmDialog';
import { ReversalDetailDrawer } from './reversals/ReversalDetailDrawer';
import { useApp } from '../context/AppContext';
import { apiClient } from '../services/apiClient';
import type { ReversalProposal, ReversalDetailRecord } from '../types/domain';

type StatusFilter = 'ALL' | 'approval' | 'resolved' | 'failed';

export const ReversalsView: React.FC = () => {
  const { role, addToast, selectedTransactionId, setSelectedTransactionId } = useApp();
  const [reversals, setReversals] = useState<ReversalProposal[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('approval');

  // Draft Proposal State (Maker Step)
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const [draftTxnId, setDraftTxnId] = useState('');
  const [draftReasonCode, setDraftReasonCode] = useState('SWITCH_TIMEOUT');
  const [draftJustification, setDraftJustification] = useState('');
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);

  // Batch Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBatchIrreversibleOpen, setIsBatchIrreversibleOpen] = useState(false);

  // Screen 8 Detail Drawer state
  const [selectedDetail, setSelectedDetail] = useState<ReversalDetailRecord | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Screen 11 Approval Dialog state
  const [selectedProposal, setSelectedProposal] = useState<ReversalProposal | null>(null);
  const [isApprovalOpen, setIsApprovalOpen] = useState(false);
  const [isIrreversibleOpen, setIsIrreversibleOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ id: string; decision: 'APPROVE' | 'REJECT'; notes?: string } | null>(null);

  const fetchReversals = async () => {
    try {
      const list = await apiClient.getReversals();
      setReversals(list);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetchReversals();

    const handleLiveSync = () => {
      if (isMounted) fetchReversals();
    };

    window.addEventListener('smartreversal:new_reversal', handleLiveSync);
    window.addEventListener('smartreversal:case_resolved', handleLiveSync);
    return () => {
      isMounted = false;
      window.removeEventListener('smartreversal:new_reversal', handleLiveSync);
      window.removeEventListener('smartreversal:case_resolved', handleLiveSync);
    };
  }, []);

  useEffect(() => {
    if (selectedTransactionId) {
      setDraftTxnId(selectedTransactionId);
      setIsDraftOpen(true);
    }
  }, [selectedTransactionId]);

  const handleOpenDetail = async (proposal: ReversalProposal) => {
    const detail = await apiClient.getReversalDetail(proposal.id);
    if (detail) {
      setSelectedDetail(detail);
      setSelectedProposal(proposal);
      setIsDetailOpen(true);
    } else {
      setSelectedProposal(proposal);
      setIsApprovalOpen(true);
    }
  };

  const handleOpenReview = (proposal: ReversalProposal) => {
    setSelectedProposal(proposal);
    setIsApprovalOpen(true);
  };

  const handleAuthorizeStep = async (proposalId: string, decision: 'APPROVE' | 'REJECT', notes?: string) => {
    if (decision === 'APPROVE') {
      // Require irreversible confirmation dialog
      setPendingAction({ id: proposalId, decision, notes });
      setIsIrreversibleOpen(true);
    } else {
      await apiClient.authorizeReversal({
        reversalId: proposalId,
        authorizedBy: `Supervisor (${role})`,
        decision: 'REJECT',
        notes,
      });
      addToast({
        type: 'warning',
        title: 'Reversal Proposal Rejected',
        message: 'The proposed reversal was rejected and logged to the audit trail.',
      });
      setIsDetailOpen(false);
      fetchReversals();
    }
  };

  const handleFinalIrreversibleConfirm = async () => {
    if (!pendingAction) return;
    await apiClient.authorizeReversal({
      reversalId: pendingAction.id,
      authorizedBy: `Supervisor (${role})`,
      decision: 'APPROVE',
      notes: pendingAction.notes,
    });
    addToast({
      type: 'success',
      title: 'Reversal Authorized — Removed From Queue',
      message: 'Dual-control authorization complete. Item has left the pending queue and customer has been notified that their issue is resolved.',
    });
    setPendingAction(null);
    setIsDetailOpen(false);
    fetchReversals();
  };

  const isChecker = role === 'SUPERVISOR_CHECKER' || role === 'ADMIN';

  // Filtered proposals
  const filteredReversals = reversals.filter((r) => {
    const matchesStatus = statusFilter === 'ALL' || r.status === statusFilter;
    const matchesSearch =
      !searchQuery ||
      r.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reasonCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.destinationAccount.includes(searchQuery) ||
      r.proposedBy.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Batch selection helpers
  const pendingProposals = filteredReversals.filter((r) => r.status === 'approval');
  const areAllPendingSelected =
    pendingProposals.length > 0 && pendingProposals.every((p) => selectedIds.includes(p.id));

  const toggleSelectAllPending = () => {
    if (areAllPendingSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pendingProposals.some((p) => p.id === id)));
    } else {
      const allPendingIds = pendingProposals.map((p) => p.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allPendingIds])));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectedProposals = reversals.filter((r) => selectedIds.includes(r.id));
  const totalBatchExposure = selectedProposals.reduce(
    (sum, r) => sum + (Number(r.reversalAmount) || 0),
    0
  );

  const handleBatchAuthorizeConfirm = async () => {
    if (selectedIds.length === 0) return;
    await apiClient.batchAuthorizeReversals({
      reversalIds: selectedIds,
      authorizedBy: `Supervisor (${role})`,
      decision: 'APPROVE',
      notes: `Dual-control batch authorization of ${selectedIds.length} proposals.`,
    });
    addToast({
      type: 'success',
      title: 'Batch Reversals Authorized — Removed From Queue',
      message: `Batch authorization complete: ${selectedIds.length} proposals totaling ₦${totalBatchExposure.toLocaleString('en-US', { minimumFractionDigits: 2 })} have left the pending queue. Customer portal notified that issues are resolved.`,
    });
    setSelectedIds([]);
    setIsBatchIrreversibleOpen(false);
    fetchReversals();
  };

  const handleBatchReject = async () => {
    if (selectedIds.length === 0) return;
    const confirmReject = window.confirm(
      `Are you sure you want to reject ${selectedIds.length} selected reversal proposals?`
    );
    if (!confirmReject) return;

    await apiClient.batchAuthorizeReversals({
      reversalIds: selectedIds,
      authorizedBy: `Supervisor (${role})`,
      decision: 'REJECT',
      notes: 'Batch rejected by supervisor checker',
    });
    addToast({
      type: 'warning',
      title: 'Batch Proposals Rejected',
      message: `${selectedIds.length} reversal proposals were rejected and recorded in the immutable audit trail.`,
    });
    setSelectedIds([]);
    fetchReversals();
  };

  const handleCreateProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTxnId.trim()) return;
    setIsSubmittingDraft(true);
    try {
      await apiClient.proposeReversal({
        transactionId: draftTxnId.trim(),
        reasonCode: draftReasonCode,
        justification: draftJustification || 'Discrepancy confirmed during investigation.',
        proposedBy: `Analyst (${role})`,
      });
      addToast({
        type: 'success',
        title: 'Reversal Proposal Submitted',
        message: `Dual-control proposal submitted for ${draftTxnId}. Awaiting supervisor authorization.`,
      });
      setIsDraftOpen(false);
      setDraftTxnId('');
      setDraftJustification('');
      setSelectedTransactionId(null);
      fetchReversals();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Submission Failed',
        message: err.message || 'Could not draft reversal proposal.',
      });
    } finally {
      setIsSubmittingDraft(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Header Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[var(--surface)] border border-[var(--surface-border)] rounded-md shadow-xs">
        <div>
          <h2 className="text-[16px] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-sky-600" />
            <span>Reversal Queue, Audit Dossier & Dual-Control Approval</span>
          </h2>
          <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
            Strict dual-authorization protocol: No single operator can both propose and authorize a financial reversal. 8-point safety gate enforced.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isChecker && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsDraftOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Draft Reversal Proposal
            </Button>
          )}
          <div className="text-[12px] px-3 py-1 bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded font-mono-financial">
            Active Role: <strong className="text-[var(--text-primary)]">{role}</strong>
          </div>
        </div>
      </div>

      {/* Batch Action Toolbar */}
      {selectedIds.length > 0 && (
        <div className="p-3 bg-[var(--surface)] text-[var(--text-primary)] rounded-md flex flex-wrap items-center justify-between gap-3 shadow-xs border border-[var(--surface-border)] animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="p-1.5 rounded bg-[var(--canvas-subdued)] border border-[var(--surface-border)] text-sky-600">
              <Layers className="w-4 h-4" />
            </span>
            <div>
              <div className="font-bold text-[13px] flex items-center gap-2">
                <span>{selectedIds.length} Pending {selectedIds.length === 1 ? 'Proposal' : 'Proposals'} Selected</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-[var(--canvas-subdued)] border border-[var(--surface-border)] font-mono-financial text-[var(--text-secondary)]">
                  Total Exposure: ₦{totalBatchExposure.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                Dual-control checker protocol: Authorize all selected reversals simultaneously.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isChecker ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsBatchIrreversibleOpen(true)}
                  leftIcon={<ShieldCheck className="w-4 h-4" />}
                >
                  Batch Authorize Selected ({selectedIds.length})
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleBatchReject}
                  leftIcon={<XOctagon className="w-4 h-4 text-rose-600" />}
                >
                  Batch Reject ({selectedIds.length})
                </Button>
              </>
            ) : (
              <span className="text-[11px] px-2.5 py-1 bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded text-[var(--text-muted)] font-medium">
                Supervisor / Checker role required to authorize batch
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds([])}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* 2. Screen 7: Reversal Queue with Filters */}
      <div className="border border-[var(--surface-border)] rounded-md bg-[var(--surface)] shadow-xs divide-y divide-[var(--surface-border)]">
        {/* Controls Bar */}
        <div className="p-3 bg-[var(--canvas-subdued)] flex flex-wrap items-center justify-between gap-3 text-[12px]">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Queue Status:
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={clsx(
                'px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors',
                statusFilter === 'ALL'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--surface-border)] hover:bg-[var(--surface-raised)]'
              )}
            >
              All ({reversals.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('approval')}
              className={clsx(
                'px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors',
                statusFilter === 'approval'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--surface-border)] hover:bg-[var(--surface-raised)]'
              )}
            >
              Pending Approval ({reversals.filter((r) => r.status === 'approval').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('resolved')}
              className={clsx(
                'px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors',
                statusFilter === 'resolved'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--surface-border)] hover:bg-[var(--surface-raised)]'
              )}
            >
              Settled / Dispatched ({reversals.filter((r) => r.status === 'resolved').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('failed')}
              className={clsx(
                'px-2.5 py-1 rounded font-semibold cursor-pointer transition-colors',
                statusFilter === 'failed'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--surface-border)] hover:bg-[var(--surface-raised)]'
              )}
            >
              Rejected ({reversals.filter((r) => r.status === 'failed').length})
            </button>

            {pendingProposals.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAllPending}
                className="ml-2 px-2.5 py-1 rounded font-semibold text-[11px] bg-[var(--canvas-subdued)] text-[var(--text-secondary)] border border-[var(--surface-border)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                {areAllPendingSelected ? (
                  <>
                    <CheckSquare className="w-3.5 h-3.5 text-sky-600" />
                    <span>Deselect All Pending</span>
                  </>
                ) : (
                  <>
                    <Square className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    <span>Select All Pending ({pendingProposals.length})</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by ref, reason, account..."
              className="pl-8 pr-3 py-1.5 bg-[var(--surface)] border border-[var(--surface-border)] rounded text-[12px] font-mono-financial focus:outline-none focus:ring-1 focus:ring-sky-500 w-64"
            />
          </div>
        </div>

        {/* Proposals List */}
        <div className="divide-y divide-[var(--surface-border-subtle)]">
          {filteredReversals.length === 0 ? (
            <div className="p-10 text-center space-y-2 text-[13px]">
              <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto opacity-75" />
              <div className="font-semibold text-[var(--text-primary)]">
                {statusFilter === 'approval'
                  ? 'No Reversal Proposals Pending Authorization'
                  : 'No Reversal Proposals in Selected View'}
              </div>
              <p className="text-[var(--text-muted)] text-[12px] max-w-sm mx-auto">
                {statusFilter === 'approval'
                  ? 'The dual-control supervisor queue is clean. When maker analysts propose a reversal, it will appear here immediately for review.'
                  : 'Switch queue filter or draft a new reversal to inspect operational records.'}
              </p>
            </div>
          ) : (
            filteredReversals.map((rev) => {
              const isPending = rev.status === 'approval';
              const isSelected = selectedIds.includes(rev.id);
              return (
                <div
                  key={rev.id}
                  className={clsx(
                    "p-4 hover:bg-[var(--surface-raised)] transition-colors flex flex-wrap items-center justify-between gap-4 text-[13px]",
                    isSelected && "bg-sky-50/40 dark:bg-sky-950/20"
                  )}
                >
                  <div className="flex items-start sm:items-center gap-3 max-w-xl">
                    {isPending ? (
                      <button
                        type="button"
                        onClick={() => toggleSelect(rev.id)}
                        aria-label={`Select reversal ${rev.reference}`}
                        className="mt-1 sm:mt-0 p-1 text-[var(--text-secondary)] hover:text-sky-600 cursor-pointer rounded transition-colors focus:outline-none"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-sky-600 dark:text-sky-400 fill-sky-100 dark:fill-sky-900/30" />
                        ) : (
                          <Square className="w-5 h-5 text-[var(--text-muted)] hover:text-sky-600" />
                        )}
                      </button>
                    ) : (
                      <div className="w-5 h-5 opacity-0 hidden sm:block shrink-0" />
                    )}

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <strong className="font-mono-financial text-[14px] text-[var(--text-primary)]">
                          {rev.reference}
                        </strong>
                        <span className="text-[11px] font-mono-financial px-1.5 py-0.2 rounded bg-[var(--canvas-subdued)] border border-[var(--surface-border)]">
                          {rev.channel}
                        </span>
                        <StatusBadge status={rev.status} size="sm" />
                      </div>

                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                        Reason: <strong className="text-[var(--text-primary)] font-mono-financial">{rev.reasonCode}</strong> &bull; &ldquo;{rev.justification}&rdquo;
                      </p>

                      <div className="text-[11px] text-[var(--text-muted)] font-mono-financial flex flex-wrap items-center gap-3">
                        <span>Maker: {rev.proposedBy}</span>
                        <span>&bull; At: {new Date(rev.proposedAt).toLocaleTimeString()}</span>
                        <span>&bull; Idempotency: {rev.idempotencyKey.substring(0, 16)}...</span>
                        <span>&bull; Destination: {rev.destinationAccount} ({rev.destinationBank})</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-[11px] text-[var(--text-muted)] font-medium">Reversal Exposure</div>
                      <div className="text-[18px] font-bold font-mono-financial text-[var(--text-primary)]">
                        {rev.currency} {Number(rev.reversalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleOpenDetail(rev)}
                        leftIcon={<FileText className="w-3.5 h-3.5" />}
                      >
                        View Dossier
                      </Button>

                      {isPending ? (
                        <Button
                          variant={isChecker ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => handleOpenReview(rev)}
                          leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}
                        >
                          {isChecker ? 'Authorize Reversal' : 'Review Proposal'}
                        </Button>
                      ) : (
                        <span className="px-2.5 py-1 text-[11px] font-semibold rounded bg-emerald-50 text-emerald-900 border border-emerald-300 font-mono-financial">
                          Executed by {rev.authorizedBy?.split(' ')[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Screen 8: Reversal Detail Drawer with 8 Safety Checks */}
      <ReversalDetailDrawer
        detail={selectedDetail}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        onProceedToAuthorize={() => {
          setIsDetailOpen(false);
          setIsApprovalOpen(true);
        }}
        isChecker={isChecker}
      />

      {/* Screen 11: Maker-Checker Review Dialog */}
      <ApprovalDialog
        proposal={selectedProposal}
        isOpen={isApprovalOpen}
        onClose={() => setIsApprovalOpen(false)}
        onAuthorize={handleAuthorizeStep}
      />

      {/* Irreversible Confirm Dialog (Single) */}
      <IrreversibleConfirmDialog
        isOpen={isIrreversibleOpen}
        onClose={() => setIsIrreversibleOpen(false)}
        onConfirm={handleFinalIrreversibleConfirm}
        title="High-Stakes Financial Reversal Dispatch"
        description="Executing this transaction will permanently credit the originator account and post an irreversible reversal journal entry to Core Banking Switch ledger. This action cannot be undone."
        confirmKeyword="CONFIRM REVERSAL"
        actionButtonText="Permanently Execute Reversal"
      />

      {/* Batch Irreversible Confirm Dialog */}
      <IrreversibleConfirmDialog
        isOpen={isBatchIrreversibleOpen}
        onClose={() => setIsBatchIrreversibleOpen(false)}
        onConfirm={handleBatchAuthorizeConfirm}
        title={`Batch Dual-Control Reversal Authorization (${selectedIds.length} Items)`}
        description={`You are about to batch authorize and execute ${selectedIds.length} reversal proposals totaling ₦${totalBatchExposure.toLocaleString('en-US', { minimumFractionDigits: 2 })}. This will permanently credit the customer accounts and post irreversible settlement reversal entries to the Core Banking Switch. This action cannot be undone.`}
        confirmKeyword="CONFIRM BATCH"
        actionButtonText={`Permanently Execute Batch (${selectedIds.length})`}
      />

      {/* Screen 10: Draft Reversal Proposal Modal (Maker Step) */}
      {isDraftOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="draft-reversal-title"
        >
          <div className="w-full max-w-md bg-[var(--surface)] border border-[var(--surface-border)] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-[var(--surface-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-md bg-sky-50 dark:bg-sky-950 text-sky-600">
                  <ShieldAlert className="w-4 h-4" />
                </span>
                <h3 id="draft-reversal-title" className="text-[15px] font-bold text-[var(--text-primary)]">
                  Draft Reversal Proposal
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDraftOpen(false);
                  setSelectedTransactionId(null);
                }}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProposal} className="p-4 space-y-4 text-[13px]">
              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[var(--text-secondary)]">
                  Target Transaction ID or Dispute Reference *
                </label>
                <input
                  type="text"
                  required
                  value={draftTxnId}
                  onChange={(e) => setDraftTxnId(e.target.value)}
                  placeholder="e.g. REF-NIP-2026-004417 or tx-cus-..."
                  className="w-full px-3 py-2 bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded-md font-mono-financial text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[var(--text-secondary)]">
                  Reversal Reason Code *
                </label>
                <select
                  value={draftReasonCode}
                  onChange={(e) => setDraftReasonCode(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded-md text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="SWITCH_TIMEOUT">SWITCH_TIMEOUT — Counterparty Timeout Without Credit</option>
                  <option value="DUPLICATE_DEBIT">DUPLICATE_DEBIT — Verified Double Processing</option>
                  <option value="CUSTOMER_CLAIM_VERIFIED">CUSTOMER_CLAIM_VERIFIED — Customer Debit Dispute Validated</option>
                  <option value="LATE_REVERSAL">LATE_REVERSAL — Settlement Auto-Reversal Window Breached</option>
                  <option value="INCORRECT_AMOUNT">INCORRECT_AMOUNT — Discrepancy in Ledger Debit Amount</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[12px] font-semibold text-[var(--text-secondary)]">
                  Investigation Justification & Evidence Summary *
                </label>
                <textarea
                  required
                  rows={3}
                  value={draftJustification}
                  onChange={(e) => setDraftJustification(e.target.value)}
                  placeholder="Provide audit-trail rationale. E.g. Telemetry confirms debit from core ledger, but switch responded code 91 timeout. Beneficiary institution confirms non-credit."
                  className="w-full px-3 py-2 bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded-md text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div className="p-2.5 rounded-md bg-[var(--canvas-subdued)] border border-[var(--surface-border)] text-[11px] text-[var(--text-muted)] space-y-1">
                <div className="font-semibold text-[var(--text-secondary)]">Dual-Control Compliance Check</div>
                <p>
                  As an Analyst Maker, this submission initiates an 8-point safety check and routes to the Supervisor Checker queue for dual authorization.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--surface-border)]">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsDraftOpen(false);
                    setSelectedTransactionId(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmittingDraft || !draftTxnId.trim()}
                  leftIcon={<ShieldAlert className="w-3.5 h-3.5" />}
                >
                  {isSubmittingDraft ? 'Submitting Proposal...' : 'Submit to Supervisor Queue'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
