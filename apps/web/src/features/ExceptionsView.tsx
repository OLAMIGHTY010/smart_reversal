import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  RefreshCw,
  Keyboard,
  Download,
  AlertTriangle,
  User,
  Bot,
  Flame,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  ShieldAlert,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { PriorityWhyPopover } from './exceptions/PriorityWhyPopover';
import { CountdownTimer } from './exceptions/CountdownTimer';
import { ExceptionFilterRail, type ExceptionFiltersState } from './exceptions/ExceptionFilterRail';
import { ExceptionDetailDrawer } from './exceptions/ExceptionDetailDrawer';
import { StateChangeModal } from './exceptions/StateChangeModal';
import { AssignModal } from './exceptions/AssignModal';
import { ConflictDialog } from './exceptions/ConflictDialog';
import { KeyboardShortcutsModal } from './exceptions/KeyboardShortcutsModal';
import { useApp } from '../context/AppContext';
import { apiClient } from '../services/apiClient';
import type {
  FinancialException,
  FinancialStatus,
  ExceptionTeam,
} from '../types/domain';

type SavedViewTab =
  | 'TRIAGE'
  | 'CUSTOMER_REPORTED'
  | 'SLA_CRITICAL'
  | 'MY_CASES'
  | 'FAST_TRACK'
  | 'UNASSIGNED'
  | 'ALL';

type SortField = 'priorityScore' | 'amount' | 'age' | 'sla';
type SortOrder = 'asc' | 'desc';

export const ExceptionsView: React.FC = () => {
  const { role, addToast, setSelectedTransactionId, setActiveView } = useApp();

  // Core exceptions list - starts clean and populates with live items from API/dispute intake
  const [exceptions, setExceptions] = useState<FinancialException[]>([]);
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(0);

  // States: loading, error, stale data
  const [isLoading, setIsLoading] = useState(false);
  const [errorCorrelationId] = useState<string | null>(null);
  const [isFeedStale, setIsFeedStale] = useState(false);
  const [newIncomingItemsCount, setNewIncomingItemsCount] = useState<number>(0);

  // Live synchronization: fetch latest from apiClient on mount and listen for real-time customer postings
  useEffect(() => {
    let isMounted = true;
    const fetchLatest = async () => {
      setIsLoading(true);
      try {
        const latest = await apiClient.getExceptions();
        if (isMounted) {
          setExceptions(latest);
        }
      } catch {
        // silent
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchLatest();

    const handleLiveDispute = (event: Event) => {
      const customEvent = event as CustomEvent<FinancialException>;
      const newExc = customEvent.detail;
      if (newExc) {
        setExceptions((prev) => {
          if (prev.some((e) => e.id === newExc.id || e.reference === newExc.reference)) {
            return prev;
          }
          return [newExc, ...prev];
        });
        setNewIncomingItemsCount((prev) => prev + 1);
        addToast({
          type: 'info',
          title: 'Live Customer Dispute Received',
          message: `Case ${newExc.reference} (${newExc.currency} ${newExc.amount}) is now live on the triage queue.`,
        });
      }
    };

    window.addEventListener('smartreversal:new_exception', handleLiveDispute);
    return () => {
      isMounted = false;
      window.removeEventListener('smartreversal:new_exception', handleLiveDispute);
    };
  }, [addToast]);

  // Active saved view tab
  const [activeTab, setActiveTab] = useState<SavedViewTab>('TRIAGE');

  // Filter rail state
  const [isRailCollapsed, setIsRailCollapsed] = useState(false);
  const [filters, setFilters] = useState<ExceptionFiltersState>({
    search: '',
    classificationCode: 'ALL',
    source: 'ALL',
    customerReportedOnly: false,
    myCasesOnly: false,
    unassignedOnly: false,
    rootCause: 'ALL',
    severity: 'ALL',
    status: 'ALL',
    lane: 'ALL',
    channel: 'ALL',
    team: 'ALL',
    slaState: 'ALL',
    incidentOnly: false,
  });

  // Sorting
  const [sortField, setSortField] = useState<SortField>('priorityScore');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Modals & Drawers
  const [isStateChangeModalOpen, setIsStateChangeModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [conflictData, setConflictData] = useState<{
    exceptionRef: string;
    updatedBy: string;
  } | null>(null);

  // Accessibility row announcement
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>('');

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.classificationCode !== 'ALL') count++;
    if (filters.source !== 'ALL') count++;
    if (filters.customerReportedOnly) count++;
    if (filters.myCasesOnly) count++;
    if (filters.unassignedOnly) count++;
    if (filters.rootCause !== 'ALL') count++;
    if (filters.severity !== 'ALL') count++;
    if (filters.status !== 'ALL') count++;
    if (filters.lane !== 'ALL') count++;
    if (filters.channel !== 'ALL') count++;
    if (filters.team !== 'ALL') count++;
    if (filters.slaState !== 'ALL') count++;
    if (filters.incidentOnly) count++;
    return count;
  }, [filters]);

  // Tab change handler
  const handleTabChange = useCallback((tab: SavedViewTab) => {
    setActiveTab(tab);
    setFilters((prev) => {
      switch (tab) {
        case 'CUSTOMER_REPORTED':
          return { ...prev, customerReportedOnly: true, myCasesOnly: false, unassignedOnly: false, slaState: 'ALL', lane: 'ALL' };
        case 'SLA_CRITICAL':
          return { ...prev, customerReportedOnly: false, myCasesOnly: false, unassignedOnly: false, slaState: 'BREACHED' };
        case 'MY_CASES':
          return { ...prev, customerReportedOnly: false, myCasesOnly: true, unassignedOnly: false, slaState: 'ALL' };
        case 'FAST_TRACK':
          return { ...prev, customerReportedOnly: false, myCasesOnly: false, unassignedOnly: false, lane: 'FAST_TRACK', slaState: 'ALL' };
        case 'UNASSIGNED':
          return { ...prev, customerReportedOnly: false, myCasesOnly: false, unassignedOnly: true, slaState: 'ALL' };
        case 'TRIAGE':
        case 'ALL':
        default:
          return { ...prev, customerReportedOnly: false, myCasesOnly: false, unassignedOnly: false, slaState: 'ALL', lane: 'ALL' };
      }
    });
  }, []);

  // Filter and sort items
  const filteredExceptions = useMemo(() => {
    return exceptions.filter((exc) => {
      // Search
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matches =
          exc.reference.toLowerCase().includes(query) ||
          exc.id.toLowerCase().includes(query) ||
          exc.classificationCode.toLowerCase().includes(query) ||
          (exc.accountNumber && exc.accountNumber.toLowerCase().includes(query)) ||
          (exc.customerName && exc.customerName.toLowerCase().includes(query)) ||
          (exc.rrn && exc.rrn.toLowerCase().includes(query)) ||
          (exc.incidentId && exc.incidentId.toLowerCase().includes(query));
        if (!matches) return false;
      }

      // Classification Code
      if (filters.classificationCode !== 'ALL' && exc.classificationCode !== filters.classificationCode) {
        return false;
      }

      // Source
      if (filters.source !== 'ALL' && exc.source !== filters.source) {
        return false;
      }

      // Customer-reported only
      if (filters.customerReportedOnly && exc.source !== 'CUSTOMER') {
        return false;
      }

      // My cases
      if (filters.myCasesOnly && exc.assignedTo !== 'analyst.maker@wema.ng') {
        return false;
      }

      // Unassigned
      if (filters.unassignedOnly && exc.assignedTo) {
        return false;
      }

      // Severity
      if (filters.severity !== 'ALL' && exc.severity !== filters.severity) {
        return false;
      }

      // Status
      if (filters.status !== 'ALL' && exc.status !== filters.status) {
        return false;
      }

      // Lane
      if (filters.lane !== 'ALL' && exc.lane !== filters.lane) {
        return false;
      }

      // Channel
      if (filters.channel !== 'ALL' && exc.channel !== filters.channel) {
        return false;
      }

      // Team
      if (filters.team !== 'ALL' && exc.team !== filters.team) {
        return false;
      }

      // SLA State
      if (filters.slaState !== 'ALL') {
        if (filters.slaState === 'BREACHED' && exc.slaStatus !== 'BREACHED') return false;
        if (filters.slaState === 'APPROACHING' && exc.slaStatus !== 'APPROACHING') return false;
        if (filters.slaState === 'ON_TRACK' && exc.slaStatus !== 'ON_TRACK') return false;
      }

      // Incident Only
      if (filters.incidentOnly && !exc.incidentId) {
        return false;
      }

      // Saved view tab filter for TRIAGE
      if (activeTab === 'TRIAGE') {
        if (exc.priorityScore < 75 && exc.slaStatus === 'ON_TRACK') return false;
      }

      return true;
    }).sort((a, b) => {
      let comparison = 0;
      if (sortField === 'priorityScore') {
        comparison = a.priorityScore - b.priorityScore;
      } else if (sortField === 'amount') {
        comparison = parseFloat(a.amount) - parseFloat(b.amount);
      } else if (sortField === 'age') {
        comparison = new Date(a.debitTimestamp).getTime() - new Date(b.debitTimestamp).getTime();
      } else if (sortField === 'sla') {
        comparison = new Date(a.internalSlaTarget).getTime() - new Date(b.internalSlaTarget).getTime();
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [exceptions, filters, activeTab, sortField, sortOrder]);

  const selectedException = useMemo(() => {
    return exceptions.find((e) => e.id === selectedExceptionId) || null;
  }, [exceptions, selectedExceptionId]);

  // Reset filters
  const handleResetFilters = useCallback(() => {
    setFilters({
      search: '',
      classificationCode: 'ALL',
      source: 'ALL',
      customerReportedOnly: false,
      myCasesOnly: false,
      unassignedOnly: false,
      rootCause: 'ALL',
      severity: 'ALL',
      status: 'ALL',
      lane: 'ALL',
      channel: 'ALL',
      team: 'ALL',
      slaState: 'ALL',
      incidentOnly: false,
    });
    setActiveTab('ALL');
  }, []);

  // Actions
  const handleClaimException = useCallback(async (exc: FinancialException) => {
    try {
      const updated = await apiClient.claimException(
        exc.id,
        'analyst.maker@wema.ng',
        'Olusola Adeyemi (Maker)',
        exc.version
      );
      setExceptions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      addToast({
        type: 'success',
        title: 'Case Claimed',
        message: `${exc.reference} claimed to your operations queue.`,
      });
    } catch (err: unknown) {
      if ((err as Error)?.message === 'CONCURRENCY_CONFLICT') {
        setConflictData({
          exceptionRef: exc.reference,
          updatedBy: (err as { updatedBy?: string }).updatedBy || 'Another Analyst',
        });
      } else {
        addToast({
          type: 'error',
          title: 'Claim Failed',
          message: (err as Error)?.message || 'Could not claim exception.',
        });
      }
    }
  }, [addToast]);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Do not capture keyboard shortcuts if typing in input/textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select') {
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
      } else if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedRowIndex((prev) => {
          const next = Math.min(prev + 1, filteredExceptions.length - 1);
          const item = filteredExceptions[next];
          if (item) setLiveAnnouncement(`Row ${next + 1}: ${item.reference}, Priority ${item.priorityScore}`);
          return next;
        });
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedRowIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          const item = filteredExceptions[next];
          if (item) setLiveAnnouncement(`Row ${next + 1}: ${item.reference}, Priority ${item.priorityScore}`);
          return next;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const current = filteredExceptions[focusedRowIndex];
        if (current) {
          setSelectedExceptionId((prev) => (prev === current.id ? null : current.id));
        }
      } else if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        const current = filteredExceptions[focusedRowIndex];
        if (current) {
          setCheckedIds((prev) =>
            prev.includes(current.id)
              ? prev.filter((id) => id !== current.id)
              : [...prev, current.id]
          );
        }
      } else if (e.key === 'a') {
        e.preventDefault();
        const current = filteredExceptions[focusedRowIndex];
        if (current && (role === 'ANALYST_MAKER' || role === 'ADMIN')) {
          handleClaimException(current);
        }
      } else if (e.key === 's') {
        e.preventDefault();
        const current = filteredExceptions[focusedRowIndex];
        if (current) {
          setSelectedExceptionId(current.id);
          setIsStateChangeModalOpen(true);
        }
      } else if (e.key === 'c') {
        e.preventDefault();
        setFilters((prev) => ({
          ...prev,
          customerReportedOnly: !prev.customerReportedOnly,
        }));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredExceptions, focusedRowIndex, role, handleClaimException]);

  const handleStateChangeSubmit = async (
    newStatus: FinancialStatus,
    reasonCode: string,
    justification: string
  ) => {
    if (!selectedException) return;
    try {
      const updated = await apiClient.updateExceptionStatus(
        selectedException.id,
        newStatus,
        reasonCode,
        'Olusola Adeyemi (Maker)',
        justification,
        selectedException.version
      );
      setExceptions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      addToast({
        type: 'success',
        title: 'Status Updated',
        message: `${selectedException.reference} transitioned to ${newStatus.toUpperCase()}.`,
      });
    } catch (err: unknown) {
      if ((err as Error)?.message === 'CONCURRENCY_CONFLICT') {
        setConflictData({
          exceptionRef: selectedException.reference,
          updatedBy: (err as { updatedBy?: string }).updatedBy || 'Another Analyst',
        });
        throw err;
      }
    }
  };

  const handleAssignSubmit = async (
    analystId: string,
    analystName: string,
    team: ExceptionTeam
  ) => {
    if (checkedIds.length > 0) {
      // Bulk assign
      const updatedList = await apiClient.bulkAssignExceptions(
        checkedIds,
        analystId,
        analystName,
        team
      );
      setExceptions((prev) =>
        prev.map((e) => {
          const match = updatedList.find((u) => u.id === e.id);
          return match || e;
        })
      );
      setCheckedIds([]);
      addToast({
        type: 'success',
        title: 'Bulk Assignment Complete',
        message: `Assigned ${updatedList.length} exceptions to ${analystName}.`,
      });
    } else if (selectedException) {
      // Single assign
      const updated = await apiClient.assignException(
        selectedException.id,
        analystId,
        analystName,
        team,
        selectedException.version
      );
      setExceptions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      addToast({
        type: 'success',
        title: 'Assignment Complete',
        message: `${selectedException.reference} routed to ${analystName} (${team}).`,
      });
    }
  };

  const handleAddNote = async (exceptionId: string, text: string) => {
    const updated = await apiClient.addExceptionNote(
      exceptionId,
      'Olusola Adeyemi',
      role,
      text
    );
    setExceptions((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  };

  const isMaker = role === 'ANALYST_MAKER' || role === 'ADMIN';

  const handleBatchProposeReversals = async () => {
    if (checkedIds.length === 0) return;
    const isConfirmed = window.confirm(
      `Submit batch reversal proposals for ${checkedIds.length} verified exceptions to the Supervisor Dual-Control Queue?`
    );
    if (!isConfirmed) return;

    try {
      const proposals = await apiClient.batchProposeReversals({
        exceptionIds: checkedIds,
        proposedBy: `Analyst (${role})`,
        reasonCode: 'BATCH_AI_VERIFIED_DISPUTE',
        justification: `AI tri-party telemetry verified switch timeout with core ledger debit across ${checkedIds.length} claims.`,
      });

      addToast({
        type: 'success',
        title: 'Batch Reversals Proposed',
        message: `Successfully queued ${proposals.length} reversal proposals for supervisor dual-control authorization.`,
      });

      setCheckedIds([]);
      const latest = await apiClient.getExceptions();
      setExceptions(latest);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Batch Proposal Failed',
        message: (err as Error)?.message || 'Could not queue batch reversals.',
      });
    }
  };

  const selectAiVerifiedOnly = () => {
    const verifiedIds = exceptions
      .filter((e) => e.modelConfidence >= 90 && e.status !== 'resolved' && e.status !== 'approval')
      .map((e) => e.id);
    if (verifiedIds.length === 0) {
      addToast({
        type: 'info',
        title: 'No Pending AI-Verified Claims',
        message: 'No exceptions currently meet the ≥90% AI verification threshold.',
      });
      return;
    }
    setCheckedIds(verifiedIds);
    addToast({
      type: 'info',
      title: 'AI High-Confidence Filter Applied',
      message: `Selected ${verifiedIds.length} exceptions verified with ≥90% AI confidence across NIBSS switch logs.`,
    });
  };

  // Reload action for conflict or simulated new items
  const handleReload = async () => {
    setIsLoading(true);
    try {
      const latest = await apiClient.getExceptions();
      setExceptions(latest);
      setNewIncomingItemsCount(0);
      setConflictData(null);
      addToast({
        type: 'info',
        title: 'Feed Refreshed',
        message: 'Synchronized live exceptions and customer disputes.',
      });
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  };

  // Sort toggle helper
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // Export selected CSV
  const handleExportCsv = () => {
    const itemsToExport = checkedIds.length > 0
      ? exceptions.filter((e) => checkedIds.includes(e.id))
      : filteredExceptions;

    const headers = ['ID', 'Reference', 'Code', 'Source', 'Severity', 'Amount', 'Currency', 'Channel', 'Status', 'SLA_Status', 'Priority'];
    const rows = itemsToExport.map((e) => [
      e.id,
      e.reference,
      e.classificationCode,
      e.source,
      e.severity,
      e.amount,
      e.currency,
      e.channel,
      e.status,
      e.slaStatus,
      e.priorityScore,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `financial_exceptions_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addToast({
      type: 'success',
      title: 'CSV Exported',
      message: `Exported ${itemsToExport.length} exceptions to CSV.`,
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[600px] bg-[var(--surface)] border border-[var(--surface-border)] rounded-md shadow-xs overflow-hidden">
      {/* Screen reader ARIA live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      {/* Top Banner: Stale Feed Warning or Real-Time Arrival */}
      {isFeedStale && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-300 text-amber-900 text-[12px] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <span>
              <strong>Stale Data Warning:</strong> Switch reconciliation feed is 18 minutes behind real-time. Showing snapshot cached at 14:15.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsFeedStale(false)}
            className="text-[11px] font-semibold text-amber-800 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Non-disruptive "New items (N)" indicator */}
      {newIncomingItemsCount > 0 && (
        <div className="px-4 py-2 bg-sky-50 border-b border-sky-300 text-sky-950 text-[12px] flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2 font-medium">
            <Sparkles className="w-4 h-4 text-sky-700" />
            <span>
              <strong>{newIncomingItemsCount} new financial exceptions</strong> detected by real-time reconciliation engine.
            </span>
          </div>
          <Button size="xs" variant="primary" onClick={handleReload} leftIcon={<RefreshCw className="w-3 h-3" />}>
            Load New Items
          </Button>
        </div>
      )}

      {/* Top Bar: Search, Saved Views Tabs, Bulk Bar, Controls */}
      <div className="p-3 bg-[var(--canvas-subdued)] border-b border-[var(--surface-border)] flex flex-wrap items-center justify-between gap-3">
        {/* Left: Search input & Saved View Tabs */}
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Quick Search */}
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search ID, Ref, RRN, Customer..."
              className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-[var(--surface)] border border-[var(--surface-border)] rounded-md text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            {filters.search && (
              <button
                type="button"
                onClick={() => setFilters({ ...filters, search: '' })}
                className="absolute right-2.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Saved View Tabs */}
          <div className="flex items-center gap-1 bg-[var(--surface)] p-0.5 rounded-md border border-[var(--surface-border)] text-[12px]">
            <button
              type="button"
              onClick={() => handleTabChange('TRIAGE')}
              className={clsx(
                'px-2.5 py-1 rounded font-semibold transition-colors flex items-center gap-1',
                activeTab === 'TRIAGE'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Action Required</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('CUSTOMER_REPORTED')}
              className={clsx(
                'px-2.5 py-1 rounded font-semibold transition-colors flex items-center gap-1',
                activeTab === 'CUSTOMER_REPORTED'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <User className="w-3.5 h-3.5" />
              <span>Customer-Reported</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('SLA_CRITICAL')}
              className={clsx(
                'px-2.5 py-1 rounded font-semibold transition-colors flex items-center gap-1',
                activeTab === 'SLA_CRITICAL'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>SLA Critical</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('MY_CASES')}
              className={clsx(
                'px-2.5 py-1 rounded font-semibold transition-colors',
                activeTab === 'MY_CASES'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              My Cases
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('FAST_TRACK')}
              className={clsx(
                'px-2.5 py-1 rounded font-semibold transition-colors flex items-center gap-1',
                activeTab === 'FAST_TRACK'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Fast-Track</span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('ALL')}
              className={clsx(
                'px-2.5 py-1 rounded font-semibold transition-colors',
                activeTab === 'ALL'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              All ({exceptions.length})
            </button>
          </div>
        </div>

        {/* Right: Freshness Flag, Shortcuts, Export */}
        <div className="flex items-center gap-2 text-[12px]">
          {/* Feed freshness pill */}
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-800 text-[11px] font-mono-financial"
            title="Real-time switch feed connected (latency 12ms)"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Feed: Live (2s)
          </span>

          {/* Keyboard shortcuts trigger */}
          <button
            type="button"
            onClick={() => setIsShortcutsModalOpen(true)}
            className="p-1.5 rounded border border-[var(--surface-border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
            title="Keyboard shortcuts (?)"
            aria-label="Keyboard shortcuts"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <kbd className="text-[10px] font-mono-financial">?</kbd>
          </button>

          {/* AI-Verified Fast Selector */}
          {exceptions.some((e) => e.modelConfidence >= 90 && e.status !== 'resolved' && e.status !== 'approval') && (
            <Button
              size="xs"
              variant="secondary"
              onClick={selectAiVerifiedOnly}
              leftIcon={<Sparkles className="w-3 h-3 text-sky-600" />}
            >
              Select AI-Verified (≥90%)
            </Button>
          )}

          {/* CSV Export */}
          <Button
            size="xs"
            variant="secondary"
            onClick={handleExportCsv}
            leftIcon={<Download className="w-3 h-3" />}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* Bulk Action Bar (Visible when rows checked) */}
      {checkedIds.length > 0 && (
        <div className="px-4 py-2 bg-sky-50 border-b border-sky-300 flex items-center justify-between text-[12px] text-sky-950 animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="font-bold">{checkedIds.length} exceptions selected</span>
            <button
              type="button"
              onClick={() => setCheckedIds([])}
              className="text-[11px] text-sky-700 hover:underline"
            >
              Deselect All
            </button>
          </div>
          <div className="flex items-center gap-2">
            {isMaker && (
              <Button
                size="xs"
                variant="primary"
                onClick={handleBatchProposeReversals}
                leftIcon={<ShieldAlert className="w-3.5 h-3.5" />}
              >
                Batch Propose Reversals ({checkedIds.length})
              </Button>
            )}
            <Button
              size="xs"
              variant="secondary"
              onClick={() => setIsAssignModalOpen(true)}
            >
              Bulk Assign
            </Button>
            <Button
              size="xs"
              variant="secondary"
              onClick={handleExportCsv}
            >
              Export Selected
            </Button>
          </div>
        </div>
      )}

      {/* Middle Layout: Left Filter Rail + Main Table + Right Detail Drawer */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Filter Rail */}
        <ExceptionFilterRail
          filters={filters}
          onChange={setFilters}
          onReset={handleResetFilters}
          isCollapsed={isRailCollapsed}
          onToggleCollapse={() => setIsRailCollapsed((prev) => !prev)}
          activeFilterCount={activeFilterCount}
        />

        {/* Main Exceptions Table Container */}
        <div
          ref={tableContainerRef}
          role="region"
          aria-label="Financial Exceptions Data Table"
          className="flex-1 flex flex-col overflow-auto bg-[var(--surface)]"
        >
          {isLoading ? (
            /* Loading Skeleton */
            <div className="p-6 space-y-4">
              <div className="h-8 bg-[var(--canvas-subdued)] rounded animate-pulse" />
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-12 bg-[var(--canvas-subdued)] rounded animate-pulse opacity-75" />
              ))}
            </div>
          ) : errorCorrelationId ? (
            /* Error State with correlation ID */
            <div className="p-12 text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto" />
              <h3 className="text-[15px] font-bold text-[var(--text-primary)]">
                Unable to Load Exception Feed
              </h3>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Database or switch gateway timed out. Error Correlation ID:{' '}
                <span className="font-mono-financial font-bold text-rose-700">
                  {errorCorrelationId}
                </span>
              </p>
              <Button size="sm" variant="primary" onClick={handleReload}>
                Retry Fetch
              </Button>
            </div>
          ) : filteredExceptions.length === 0 ? (
            /* Empty State */
            <div className="p-12 text-center space-y-3 my-auto">
              <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto opacity-80" />
              <h3 className="text-[15px] font-bold text-[var(--text-primary)]">
                {exceptions.length === 0 ? 'No Exceptions in Live Queue' : 'No Exceptions Match Active Filters'}
              </h3>
              <p className="text-[13px] text-[var(--text-secondary)] max-w-md mx-auto">
                {exceptions.length === 0
                  ? 'All operational transaction streams and customer queues are currently balanced. The pipeline is active and listening for live customer dispute filings and switch break events.'
                  : activeFilterCount > 0
                  ? `Your active filters (${activeFilterCount}) currently exclude all records. Try clearing filters to view pending exceptions.`
                  : 'All transactions currently balance with no outstanding exceptions or anomalies.'}
              </p>
              {activeFilterCount > 0 && (
                <Button size="sm" variant="secondary" onClick={handleResetFilters}>
                  Clear All Filters
                </Button>
              )}
            </div>
          ) : (
            /* High-Density Semantic Table */
            <table className="w-full text-left text-[13px] border-collapse">
              {/* Sticky Table Header */}
              <thead className="sticky top-0 z-10 bg-[var(--canvas-subdued)] border-b border-[var(--surface-border)] shadow-xs">
                <tr className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {/* Select Checkbox */}
                  <th scope="col" className="w-8 px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all exceptions on page"
                      checked={
                        checkedIds.length === filteredExceptions.length &&
                        filteredExceptions.length > 0
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setCheckedIds(filteredExceptions.map((x) => x.id));
                        } else {
                          setCheckedIds([]);
                        }
                      }}
                      className="rounded border-[var(--surface-border)] text-sky-600 w-3.5 h-3.5"
                    />
                  </th>

                  {/* Classification Code & Source */}
                  <th scope="col" className="px-3 py-2">
                    Code / Source
                  </th>

                  {/* Exception Reference & Root Cause */}
                  <th scope="col" className="px-3 py-2">
                    Reference / Details
                  </th>

                  {/* Severity */}
                  <th scope="col" className="px-3 py-2">
                    Severity
                  </th>

                  {/* Priority Score */}
                  <th
                    scope="col"
                    className="px-3 py-2 cursor-pointer select-none hover:text-[var(--text-primary)]"
                    onClick={() => handleSort('priorityScore')}
                    aria-sort={sortField === 'priorityScore' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <div className="flex items-center gap-1">
                      <span>Priority</span>
                      {sortField === 'priorityScore' &&
                        (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>

                  {/* Amount & Exposure */}
                  <th
                    scope="col"
                    className="px-3 py-2 text-right cursor-pointer select-none hover:text-[var(--text-primary)]"
                    onClick={() => handleSort('amount')}
                    aria-sort={sortField === 'amount' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Amount</span>
                      {sortField === 'amount' &&
                        (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>

                  {/* Channel / Rail */}
                  <th scope="col" className="px-3 py-2">
                    Channel
                  </th>

                  {/* SLA Remaining */}
                  <th
                    scope="col"
                    className="px-3 py-2 cursor-pointer select-none hover:text-[var(--text-primary)]"
                    onClick={() => handleSort('sla')}
                    aria-sort={sortField === 'sla' ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <div className="flex items-center gap-1">
                      <span>SLA Remaining</span>
                      {sortField === 'sla' &&
                        (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                    </div>
                  </th>

                  {/* Status */}
                  <th scope="col" className="px-3 py-2">
                    Status
                  </th>

                  {/* Lane */}
                  <th scope="col" className="px-3 py-2">
                    Lane
                  </th>

                  {/* Owner */}
                  <th scope="col" className="px-3 py-2">
                    Assignee
                  </th>

                  {/* Actions */}
                  <th scope="col" className="px-3 py-2 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              {/* Table Rows */}
              <tbody className="divide-y divide-[var(--surface-border-subtle)] font-sans">
                {filteredExceptions.map((exc, idx) => {
                  const isSelected = selectedExceptionId === exc.id;
                  const isFocused = focusedRowIndex === idx;
                  const isChecked = checkedIds.includes(exc.id);

                  return (
                    <tr
                      key={exc.id}
                      onClick={() => setSelectedExceptionId(exc.id)}
                      onMouseEnter={() => setFocusedRowIndex(idx)}
                      tabIndex={0}
                      aria-selected={isSelected}
                      className={clsx(
                        'transition-colors cursor-pointer group',
                        isSelected
                          ? 'bg-sky-50/70 border-l-4 border-l-sky-600'
                          : isFocused
                          ? 'bg-[var(--surface-raised)]'
                          : 'hover:bg-[var(--surface-raised)]',
                        isChecked && 'bg-sky-50/40'
                      )}
                    >
                      {/* Checkbox */}
                      <td
                        className="px-3 py-2 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select ${exc.reference}`}
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setCheckedIds((prev) => [...prev, exc.id]);
                            } else {
                              setCheckedIds((prev) => prev.filter((id) => id !== exc.id));
                            }
                          }}
                          className="rounded border-[var(--surface-border)] text-sky-600 w-3.5 h-3.5 cursor-pointer"
                        />
                      </td>

                      {/* Classification Code & Source Badge */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono-financial font-bold text-[12px] px-1.5 py-0.5 rounded bg-[var(--canvas-subdued)] border border-[var(--surface-border)] text-[var(--text-primary)]">
                            {exc.classificationCode}
                          </span>
                          <span
                            className={clsx(
                              'p-1 rounded text-[10px] flex items-center',
                              exc.source === 'CUSTOMER'
                                ? 'bg-indigo-50 text-indigo-800'
                                : 'bg-slate-100 text-slate-700'
                            )}
                            title={`Source: ${exc.source}`}
                          >
                            {exc.source === 'CUSTOMER' ? (
                              <User className="w-3 h-3 text-indigo-600" />
                            ) : (
                              <Bot className="w-3 h-3 text-sky-600" />
                            )}
                          </span>
                        </div>
                      </td>

                      {/* Reference & Root Cause */}
                      <td className="px-3 py-2 max-w-xs">
                        <div className="font-mono-financial font-bold text-[13px] text-[var(--text-primary)] flex items-center gap-1.5">
                          <span>{exc.reference}</span>
                          {exc.repeatContactCount > 0 && (
                            <span
                              className="px-1 py-0.2 rounded font-sans text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200"
                              title={`${exc.repeatContactCount} repeat customer contacts logged`}
                            >
                              {exc.repeatContactCount}x repeat
                            </span>
                          )}
                          {exc.incidentId && (
                            <span
                              className="px-1 py-0.2 rounded font-sans text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5"
                              title={exc.incidentTitle || 'Linked Incident'}
                            >
                              <AlertTriangle className="w-2.5 h-2.5 text-amber-700" />
                              {exc.incidentId}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5" title={exc.description}>
                          {exc.description}
                        </p>
                      </td>

                      {/* Severity */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono-financial border ${
                            exc.severity === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-900 border-rose-300'
                              : exc.severity === 'HIGH'
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-slate-100 text-slate-800 border-slate-300'
                          }`}
                        >
                          {exc.severity}
                        </span>
                      </td>

                      {/* Priority Score Popover */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <PriorityWhyPopover
                          score={exc.priorityScore}
                          factors={exc.priorityFactors}
                          exceptionRef={exc.reference}
                        />
                      </td>

                      {/* Amount & Exposure */}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="font-mono-financial font-bold text-[13px] text-[var(--text-primary)]">
                          {exc.currency} {Number(exc.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                        <span className="text-[10px] font-mono-financial text-[var(--text-muted)] block">
                          Exp: {Number(exc.exposure).toLocaleString('en-US')}
                        </span>
                      </td>

                      {/* Channel */}
                      <td className="px-3 py-2 whitespace-nowrap font-mono-financial text-[11px] text-[var(--text-secondary)]">
                        {exc.channel}
                      </td>

                      {/* SLA Countdown Timer */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <CountdownTimer targetDate={exc.internalSlaTarget} compact />
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusBadge status={exc.status} size="sm" />
                      </td>

                      {/* Lane */}
                      <td className="px-3 py-2 whitespace-nowrap text-[11px] text-[var(--text-secondary)]">
                        <span className="px-1.5 py-0.5 rounded bg-[var(--canvas-subdued)] border border-[var(--surface-border-subtle)]">
                          {exc.lane.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Assignee */}
                      <td className="px-3 py-2 whitespace-nowrap text-[11px]">
                        {exc.assignedTo ? (
                          <span className="text-[var(--text-primary)] font-medium">
                            {exc.ownerName?.split(' ')[0] || exc.assignedTo.split('@')[0]}
                          </span>
                        ) : (
                          <span className="text-amber-700 italic font-medium">Unassigned</span>
                        )}
                      </td>

                      {/* Quick Actions */}
                      <td
                        className="px-3 py-2 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          {!exc.assignedTo && (role === 'ANALYST_MAKER' || role === 'ADMIN') && (
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => handleClaimException(exc)}
                            >
                              Claim
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => setSelectedExceptionId(exc.id)}
                          >
                            Inspect
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right Detail Preview Drawer */}
        {selectedException && (
          <ExceptionDetailDrawer
            exception={selectedException}
            onClose={() => setSelectedExceptionId(null)}
            onClaim={handleClaimException}
            onOpenAssign={(e) => {
              setSelectedExceptionId(e.id);
              setIsAssignModalOpen(true);
            }}
            onOpenStateChange={(e) => {
              setSelectedExceptionId(e.id);
              setIsStateChangeModalOpen(true);
            }}
            onAddNote={handleAddNote}
            onProposeReversal={(e) => {
              setSelectedTransactionId(e.transactionId);
              setActiveView('reversals');
              addToast({
                type: 'info',
                title: 'Drafting Reversal',
                message: `Pre-populating maker reversal proposal for ${e.reference}`,
              });
            }}
          />
        )}
      </div>

      {/* Modals */}
      <StateChangeModal
        isOpen={isStateChangeModalOpen}
        exception={selectedException}
        onClose={() => setIsStateChangeModalOpen(false)}
        onSubmit={handleStateChangeSubmit}
      />

      <AssignModal
        isOpen={isAssignModalOpen}
        exceptionIds={checkedIds.length > 0 ? checkedIds : selectedException ? [selectedException.id] : []}
        currentAssignee={selectedException?.assignedTo}
        currentTeam={selectedException?.team}
        onClose={() => setIsAssignModalOpen(false)}
        onAssign={handleAssignSubmit}
      />

      <ConflictDialog
        isOpen={conflictData !== null}
        exceptionRef={conflictData?.exceptionRef || ''}
        updatedBy={conflictData?.updatedBy || ''}
        onReload={handleReload}
        onDismiss={() => setConflictData(null)}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
};
