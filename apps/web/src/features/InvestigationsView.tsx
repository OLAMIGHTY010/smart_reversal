import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Send,
  MessageSquare,
  Clock,
  Link as LinkIcon,
  BookOpen,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from '../components/Button';
import { MaskedField } from '../components/MaskedField';
import { StickyCaseHeader } from './investigations/StickyCaseHeader';
import { LifecycleTimeline } from './investigations/LifecycleTimeline';
import { EvidenceDossier } from './investigations/EvidenceDossier';
import { DuplicateComparisonView } from './investigations/DuplicateComparisonView';
import { CustomerReportedAlertCard } from './investigations/CustomerReportedAlertCard';
import { RootCauseTagEditor } from './investigations/RootCauseTagEditor';
import { AICopilotPanel } from './investigations/AICopilotPanel';
import { ExternalDependencyModal } from './investigations/ExternalDependencyModal';
import { CloseCaseModal } from './investigations/CloseCaseModal';
import { useApp } from '../context/AppContext';
import { apiClient } from '../services/apiClient';
import type {
  InvestigationCase,
  RootCause,
  ExternalDependency,
} from '../types/domain';

type CentreTab = 'TIMELINE' | 'EVIDENCE' | 'DUPLICATE_DIFF';

export const InvestigationsView: React.FC = () => {
  const { role, addToast, setActiveView, setSelectedTransactionId } = useApp();

  const [cases, setCases] = useState<InvestigationCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    apiClient.getInvestigations().then((invs) => {
      if (isMounted) {
        setCases(invs);
        if (invs[0] && !selectedCaseId) {
          setSelectedCaseId(invs[0].id);
        }
      }
    }).catch(() => {});

    const handleLiveDispute = () => {
      apiClient.getInvestigations().then((invs) => {
        if (isMounted) {
          setCases(invs);
          if (invs[0] && !selectedCaseId) {
            setSelectedCaseId(invs[0].id);
          }
        }
      }).catch(() => {});
    };

    window.addEventListener('smartreversal:new_exception', handleLiveDispute);
    window.addEventListener('smartreversal:case_resolved', handleLiveDispute);
    return () => {
      isMounted = false;
      window.removeEventListener('smartreversal:new_exception', handleLiveDispute);
      window.removeEventListener('smartreversal:case_resolved', handleLiveDispute);
    };
  }, [selectedCaseId]);
  const [activeCentreTab, setActiveCentreTab] = useState<CentreTab>('TIMELINE');
  const [targetEvidenceId, setTargetEvidenceId] = useState<string | null>(null);

  // Notes
  const [newNote, setNewNote] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);

  // Modals
  const [isDepModalOpen, setIsDepModalOpen] = useState(false);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  const activeCase = cases.find((c) => c.id === selectedCaseId) || cases[0];

  const handleSelectCase = (c: InvestigationCase) => {
    setSelectedCaseId(c.id);
    if (c.duplicateComparison && c.exception.classificationCode === 'DUP001') {
      setActiveCentreTab('DUPLICATE_DIFF');
    } else {
      setActiveCentreTab('TIMELINE');
    }
  };

  if (!activeCase) {
    return (
      <div className="p-12 text-center bg-[var(--surface)] border border-[var(--surface-border)] rounded-md space-y-3 max-w-xl mx-auto my-12 shadow-xs">
        <FileText className="w-10 h-10 text-sky-600 mx-auto opacity-75" />
        <h3 className="text-[16px] font-bold text-[var(--text-primary)]">
          No Active Investigation Cases in Queue
        </h3>
        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
          The investigation workspace is active and listening for live dispute intake reports and operational exception assignments.
        </p>
      </div>
    );
  }

  const isMaker = role === 'ANALYST_MAKER' || role === 'ADMIN';

  // Handlers
  const handleConfirmRootCause = async (cause: RootCause) => {
    const updated = await apiClient.confirmRootCause(
      activeCase.id,
      cause,
      'Olusola Adeyemi (Maker)'
    );
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    addToast({
      type: 'success',
      title: 'Root Cause Confirmed',
      message: `Confirmed root cause for ${activeCase.caseNumber}: ${cause}`,
    });
  };

  const handleConfirmDuplicate = async () => {
    const updated = await apiClient.confirmDuplicateVerdict(
      activeCase.id,
      'CONFIRMED_DUPLICATE',
      'Rule R-DUP-01 matched: verified 480ms sub-second contactless duplicate.',
      'Olusola Adeyemi (Maker)'
    );
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    addToast({
      type: 'warning',
      title: 'Duplicate Confirmed',
      message: `${activeCase.caseNumber}: Suspected duplicate leg flagged for reversal.`,
    });
    // Open Reversals F4 flow
    setSelectedTransactionId(activeCase.exception.transactionId);
    setActiveView('reversals');
  };

  const handleMarkLegitimateRepeat = async (reason: string) => {
    const updated = await apiClient.confirmDuplicateVerdict(
      activeCase.id,
      'LEGITIMATE_RETRY',
      reason,
      'Olusola Adeyemi (Maker)'
    );
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    addToast({
      type: 'info',
      title: 'Marked Legitimate Repeat',
      message: `Exemption logged: ${reason}`,
    });
  };

  const handleRequestMissingCheck = async (evidenceId: string, source: string) => {
    const updated = await apiClient.requestMissingEvidenceCheck(
      activeCase.id,
      evidenceId,
      source,
      'Olusola Adeyemi (Maker)'
    );
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    addToast({
      type: 'success',
      title: 'Check Dispatched',
      message: `Dispatched automated missing evidence query to ${source}.`,
    });
  };

  const handleAddExternalDep = async (dep: Omit<ExternalDependency, 'id'>) => {
    const updated = await apiClient.addExternalDependency(activeCase.id, dep);
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    addToast({
      type: 'info',
      title: 'External Dependency Tracked',
      message: `Pending response from ${dep.namedParty} (Ref: ${dep.ticketReference}).`,
    });
  };

  const handleCloseCase = async (resolutionCode: string, notes: string) => {
    const updated = await apiClient.closeInvestigationCase(
      activeCase.id,
      resolutionCode,
      notes,
      'Olusola Adeyemi (Maker)'
    );
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    addToast({
      type: 'success',
      title: 'Case Resolved & Closed',
      message: `${activeCase.caseNumber} closed with code ${resolutionCode}.`,
    });
  };

  const handleAddNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setIsAddingNote(true);
    try {
      await apiClient.addExceptionNote(
        activeCase.exceptionId,
        'Olusola Adeyemi',
        role,
        newNote.trim()
      );
      setNewNote('');
      // Refresh local case note
      setCases((prev) =>
        prev.map((c) => {
          if (c.id === activeCase.id) {
            return {
              ...c,
              exception: {
                ...c.exception,
                notes: [
                  ...c.exception.notes,
                  {
                    id: `note-${Date.now()}`,
                    author: 'Olusola Adeyemi',
                    authorRole: role,
                    timestamp: new Date().toISOString(),
                    text: newNote.trim(),
                  },
                ],
              },
            };
          }
          return c;
        })
      );
      addToast({
        type: 'success',
        title: 'Note Logged',
        message: 'Investigation finding appended to audit ledger.',
      });
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleAddNoteDirect = async (text: string) => {
    try {
      await apiClient.addExceptionNote(
        activeCase.exceptionId,
        'SmartReversal Copilot',
        'ADMIN',
        text
      );
      setCases((prev) =>
        prev.map((c) => {
          if (c.id === activeCase.id) {
            return {
              ...c,
              exception: {
                ...c.exception,
                notes: [
                  ...c.exception.notes,
                  {
                    id: `note-${Date.now()}`,
                    author: 'SmartReversal Copilot',
                    authorRole: 'ADMIN',
                    timestamp: new Date().toISOString(),
                    text,
                  },
                ],
              },
            };
          }
          return c;
        })
      );
      addToast({
        type: 'info',
        title: 'Copilot Citation Appended',
        message: 'Saved AI finding to case investigation notes.',
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handlePopulateReversalDraft = (_justification: string) => {
    setSelectedTransactionId(activeCase.exception.transactionId);
    setActiveView('reversals');
    addToast({
      type: 'info',
      title: 'Copilot Justification Loaded',
      message: `Pre-populated Maker reversal proposal for ${activeCase.reference}.`,
    });
  };

  const handleJumpToEvidence = (evId: string) => {
    setActiveCentreTab('EVIDENCE');
    setTargetEvidenceId(evId);
    setTimeout(() => {
      const el = document.getElementById(`evidence-${evId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-140px)] bg-[var(--surface)] border border-[var(--surface-border)] rounded-md shadow-xs overflow-hidden">
      {/* Sticky Case Header */}
      <StickyCaseHeader investigationCase={activeCase} />

      {/* Case Selector Tabs Bar */}
      <div className="px-4 py-2 bg-[var(--canvas-subdued)] border-b border-[var(--surface-border)] flex flex-wrap items-center justify-between gap-3 text-[12px]">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-[var(--text-muted)] uppercase tracking-wider text-[11px] flex items-center gap-1">
            <FolderOpen className="w-3.5 h-3.5 text-sky-600" /> Active Dossiers:
          </span>
          <div className="flex items-center gap-1 overflow-x-auto">
            {cases.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelectCase(c)}
                className={clsx(
                  'px-2.5 py-1 rounded font-mono-financial text-[11px] font-bold border transition-colors flex items-center gap-1.5',
                  selectedCaseId === c.id
                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--surface-border)] hover:bg-[var(--surface-raised)]'
                )}
              >
                <span>{c.caseNumber}</span>
                <span
                  className={clsx(
                    'text-[9px] px-1 py-0.2 rounded font-sans',
                    selectedCaseId === c.id ? 'bg-sky-800 text-white' : 'bg-[var(--canvas-subdued)]'
                  )}
                >
                  {c.exception.classificationCode}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono-financial text-[var(--text-muted)]">
            Dossier updated: {new Date(activeCase.updatedAt).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Main 3-Column Architecture */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--surface-border)] overflow-hidden">
        {/* ============================================================== */}
        {/* LEFT COLUMN: Transaction Summary & Debits (Cols 1-3)            */}
        {/* ============================================================== */}
        <div className="lg:col-span-3 p-4 space-y-4 overflow-y-auto bg-[var(--surface)] text-[12px]">
          {/* Transaction Metadata Card */}
          <div className="p-3.5 rounded-md bg-[var(--canvas-subdued)] border border-[var(--surface-border-subtle)] space-y-2">
            <h4 className="font-bold text-[13px] text-[var(--text-primary)] flex items-center justify-between">
              <span>Transaction Summary</span>
              <span className="font-mono-financial text-[11px] text-[var(--text-muted)]">
                {activeCase.exception.channel}
              </span>
            </h4>

            <div className="space-y-1.5 font-mono-financial text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)] font-sans">Reference:</span>
                <span className="font-bold text-[var(--text-primary)]">{activeCase.reference}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)] font-sans">STAN / RRN:</span>
                <span>{activeCase.exception.stan || '009901'} / {activeCase.exception.rrn || '9901847120'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)] font-sans">Timestamp:</span>
                <span>{new Date(activeCase.exception.debitTimestamp).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-muted)] font-sans">Customer Account:</span>
                <MaskedField
                  maskedValue={activeCase.exception.accountNumber ? `${activeCase.exception.accountNumber.slice(0, 3)}••••${activeCase.exception.accountNumber.slice(-3)}` : '012••••789'}
                  revealedValue={activeCase.exception.accountNumber || '0123456789'}
                  fieldLabel="Customer Account Number"
                  entityId={activeCase.reference}
                />
              </div>
              {activeCase.exception.maskedPan && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-muted)] font-sans">Card PAN:</span>
                  <MaskedField
                    maskedValue={activeCase.exception.maskedPan}
                    revealedValue="5399 8812 4491 7711"
                    fieldLabel="Customer Card PAN"
                    entityId={activeCase.reference}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Customer-Reported Case Details (Scope v2) */}
          {activeCase.customerDetails && (
            <CustomerReportedAlertCard details={activeCase.customerDetails} />
          )}

          {/* Core Banking Double-Entry Postings */}
          <div className="space-y-2">
            <h4 className="font-bold text-[12px] uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-sky-600" />
              <span>CBS Ledger Double-Entry Postings ({activeCase.ledgerPostings.length})</span>
            </h4>

            <div className="space-y-1.5">
              {activeCase.ledgerPostings.map((leg) => (
                <div
                  key={leg.id}
                  className="p-2.5 rounded bg-[var(--surface)] border border-[var(--surface-border)] text-[11px] space-y-1 font-mono-financial shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[var(--text-primary)]">{leg.accountName}</span>
                    <span
                      className={clsx(
                        'px-1.5 py-0.2 rounded text-[10px] font-bold font-sans',
                        leg.type === 'DEBIT'
                          ? 'bg-rose-100 text-rose-900 border border-rose-300'
                          : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      )}
                    >
                      {leg.type}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[var(--text-secondary)]">
                    <span>Acct: {leg.account}</span>
                    <strong className="text-[var(--text-primary)]">
                      {leg.currency} {Number(leg.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] font-sans leading-tight">
                    {leg.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Related Records & Linked Incident */}
          <div className="space-y-2 pt-2 border-t border-[var(--surface-border-subtle)]">
            <h4 className="font-bold text-[12px] uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-indigo-600" />
              <span>Related Transactions & Incidents</span>
            </h4>

            {activeCase.exception.incidentId && (
              <div className="p-2.5 rounded bg-amber-50 border border-amber-300 text-amber-950 text-[11px] space-y-1">
                <div className="flex items-center gap-1 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  <span>Master Incident: {activeCase.exception.incidentId}</span>
                </div>
                <p className="opacity-90">{activeCase.exception.incidentTitle}</p>
              </div>
            )}

            {activeCase.relatedTransactions.map((rt) => (
              <div
                key={rt.id}
                className="p-2 rounded bg-[var(--canvas-subdued)] border border-[var(--surface-border-subtle)] text-[11px] space-y-0.5"
              >
                <div className="flex items-center justify-between font-mono-financial">
                  <span className="font-bold text-[var(--text-primary)]">{rt.reference}</span>
                  <span className="text-rose-700 font-bold">{rt.status}</span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)]">{rt.relation}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ============================================================== */}
        {/* CENTRE COLUMN: Timeline, Evidence, Duplicate Diff (Cols 4-8)    */}
        {/* ============================================================== */}
        <div className="lg:col-span-5 p-4 space-y-4 overflow-y-auto bg-[var(--surface)]">
          {/* Navigation View Switcher */}
          <div className="flex items-center justify-between border-b border-[var(--surface-border)] pb-3">
            <div className="flex items-center gap-1.5 bg-[var(--canvas-subdued)] p-1 rounded-md border border-[var(--surface-border)] text-[12px]">
              <button
                type="button"
                onClick={() => setActiveCentreTab('TIMELINE')}
                className={clsx(
                  'px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1.5',
                  activeCentreTab === 'TIMELINE'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                )}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Lifecycle Timeline</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveCentreTab('EVIDENCE')}
                className={clsx(
                  'px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1.5',
                  activeCentreTab === 'EVIDENCE'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                )}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Evidence Dossier ({activeCase.evidence.length})</span>
              </button>

              {activeCase.duplicateComparison && (
                <button
                  type="button"
                  onClick={() => setActiveCentreTab('DUPLICATE_DIFF')}
                  className={clsx(
                    'px-3 py-1.5 rounded font-semibold transition-colors flex items-center gap-1.5',
                    activeCentreTab === 'DUPLICATE_DIFF'
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  )}
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate Diff</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Tab View Rendering */}
          {activeCentreTab === 'TIMELINE' && (
            <LifecycleTimeline
              events={activeCase.timeline}
              onSelectEvidence={handleJumpToEvidence}
            />
          )}

          {activeCentreTab === 'EVIDENCE' && (
            <EvidenceDossier
              evidence={activeCase.evidence}
              onRequestMissingCheck={handleRequestMissingCheck}
              targetEvidenceId={targetEvidenceId}
            />
          )}

          {activeCentreTab === 'DUPLICATE_DIFF' && activeCase.duplicateComparison && (
            <DuplicateComparisonView
              comparison={activeCase.duplicateComparison}
              onConfirmDuplicate={handleConfirmDuplicate}
              onMarkLegitimateRepeat={handleMarkLegitimateRepeat}
              onRequestMoreEvidence={() =>
                handleRequestMissingCheck(
                  'ev-missing-pos',
                  'Mastercard Acquirer Journal Desk'
                )
              }
            />
          )}
        </div>

        {/* ============================================================== */}
        {/* RIGHT COLUMN: AI Summary, Hypotheses, Notes, Actions (Cols 9-12)*/}
        {/* ============================================================== */}
        <div className="lg:col-span-4 p-4 space-y-4 overflow-y-auto bg-[var(--surface)] text-[12px]">
          {/* Prompt F8 / Screen 9: Interactive AI Copilot & Citation Assistant */}
          <AICopilotPanel
            investigationCase={activeCase}
            onAddNote={handleAddNoteDirect}
            onPopulateReversalDraft={handlePopulateReversalDraft}
          />

          {/* Scope v2 Mandatory: Editable Root-Cause Tag */}
          <RootCauseTagEditor
            aiSuggestedRootCause={activeCase.aiSuggestedRootCause}
            confirmedRootCause={activeCase.confirmedRootCause}
            isConfirmed={activeCase.isRootCauseConfirmed}
            onConfirm={handleConfirmRootCause}
          />

          {/* External Dependencies Tracker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1">
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                <span>External Dependencies ({activeCase.externalDependencies.length})</span>
              </span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setIsDepModalOpen(true)}
              >
                + Track Dependency
              </Button>
            </div>

            {activeCase.externalDependencies.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)] italic p-2 rounded bg-[var(--canvas-subdued)]">
                No external third-party dependencies registered.
              </p>
            ) : (
              activeCase.externalDependencies.map((dep) => (
                <div
                  key={dep.id}
                  className="p-2.5 rounded bg-[var(--canvas-subdued)] border border-[var(--surface-border-subtle)] space-y-1 font-mono-financial text-[11px]"
                >
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-[var(--text-primary)] font-sans">{dep.namedParty}</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px]">
                      {dep.status}
                    </span>
                  </div>
                  <div className="text-[var(--text-secondary)]">Ticket: {dep.ticketReference}</div>
                  <p className="text-[10px] text-[var(--text-muted)] font-sans leading-tight">
                    {dep.reason}
                  </p>
                  <div className="pt-1 text-[10px] text-amber-800 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>Expected by: {new Date(dep.expectedBy).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Operational Action Buttons */}
          <div className="space-y-2 pt-2 border-t border-[var(--surface-border-subtle)]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Operations Action Toolbar
            </span>

            <div className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={!isMaker}
                onClick={() => {
                  setSelectedTransactionId(activeCase.exception.transactionId);
                  setActiveView('reversals');
                  addToast({
                    type: 'info',
                    title: 'Drafting Reversal',
                    message: `Pre-populating maker reversal proposal for ${activeCase.reference}`,
                  });
                }}
                leftIcon={<ShieldAlert className="w-3.5 h-3.5" />}
              >
                Propose Reversal
              </Button>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => setIsCloseModalOpen(true)}
                leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              >
                Close Case
              </Button>
            </div>
          </div>

          {/* Investigation Notes & Audit Entry */}
          <div className="space-y-2 pt-2 border-t border-[var(--surface-border-subtle)]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
              <span>Analyst Notes ({activeCase.exception.notes.length})</span>
            </span>

            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {activeCase.exception.notes.length === 0 ? (
                <p className="text-[11px] text-[var(--text-muted)] italic p-2 rounded bg-[var(--canvas-subdued)]">
                  No analyst notes recorded yet.
                </p>
              ) : (
                activeCase.exception.notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-2 rounded bg-[var(--canvas-subdued)] border border-[var(--surface-border-subtle)] text-[11px] space-y-0.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono-financial font-bold">
                      <span>{note.author}</span>
                      <span>{new Date(note.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-[var(--text-primary)]">{note.text}</p>
                  </div>
                ))
              )}
            </div>

            {/* Note entry form */}
            <form onSubmit={handleAddNoteSubmit} className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Log observation or settlement artifact..."
                className="flex-1 px-3 py-1.5 bg-[var(--surface)] border border-[var(--surface-border)] rounded text-[12px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <Button
                type="submit"
                size="xs"
                variant="primary"
                disabled={isAddingNote || !newNote.trim()}
                leftIcon={<Send className="w-3 h-3" />}
              >
                Add
              </Button>
            </form>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ExternalDependencyModal
        isOpen={isDepModalOpen}
        onClose={() => setIsDepModalOpen(false)}
        onSubmit={handleAddExternalDep}
      />

      <CloseCaseModal
        isOpen={isCloseModalOpen}
        caseNumber={activeCase.caseNumber}
        onClose={() => setIsCloseModalOpen(false)}
        onSubmit={handleCloseCase}
      />
    </div>
  );
};
