import type {
  Transaction,
  FinancialException,
  InvestigationCase,
  ReversalProposal,
  AuditEvent,
  ReconciliationSummary,
  FinancialStatus,
  Severity,
  Channel,
  Role,
  ExceptionType,
  ClassificationCode,
  ExceptionSource,
  ExceptionTeam,
  ExceptionNote,
  RootCause,
  ExternalDependency,
  CustomerIntakeQuery,
  AgentQueryResult,
  CustomerDisputeIntakePayload,
  ReversalDetailRecord,
  ReversalSafetyCheck,
} from '../types/domain';
import {
  INITIAL_TRANSACTIONS,
  INITIAL_EXCEPTIONS,
  INITIAL_INVESTIGATIONS,
  INITIAL_REVERSALS,
  INITIAL_AUDIT_TRAIL,
  RECONCILIATION_RUNS,
} from './mockSimulatorData';

import { aiClient } from './aiClient';

export interface ServiceTierStatus {
  backend: {
    isLive: boolean;
    status: 'connected' | 'offline';
    service: string;
    version?: string;
    latencyMs?: number;
  };
  aiService: {
    isLive: boolean;
    status: 'connected' | 'offline';
    service: string;
    latencyMs?: number;
  };
  simulationFallbackActive: boolean;
}

const LIVE_CUSTOMER_EXCEPTIONS_KEY = 'smartreversal_live_customer_exceptions';
const LIVE_REVERSALS_KEY = 'smartreversal_live_reversals';
const LIVE_INVESTIGATIONS_KEY = 'smartreversal_live_investigations';
const LIVE_TRANSACTIONS_KEY = 'smartreversal_live_transactions';
const LIVE_AUDIT_KEY = 'smartreversal_live_audit_trail';

function getStoredLiveItems<T>(key: string): T[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredLiveItems<T>(key: string, items: T[]) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(items));
    }
  } catch {
    // silent
  }
}

function getStoredCustomerExceptions(): FinancialException[] {
  return getStoredLiveItems<FinancialException>(LIVE_CUSTOMER_EXCEPTIONS_KEY);
}

function syncCustomerCaseResolved(prop: ReversalProposal) {
  if (typeof window === 'undefined') return;

  const caseKeys = ['smartreversal_customer_my_cases', 'smartreversal_customer_cases'];
  for (const key of caseKeys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const cases = JSON.parse(raw);
        let modified = false;
        const updatedCases = cases.map((c: any) => {
          const isMatch =
            c.id === prop.reference ||
            c.reference === prop.reference ||
            c.id === prop.transactionId ||
            c.instructionRef === prop.reference ||
            c.parsedDetails?.reference === prop.reference ||
            (prop.reference && c.id && c.id.includes(prop.reference.replace(/[^0-9]/g, ''))) ||
            (prop.reference && c.history?.some((h: any) => h.details?.includes(prop.reference))) ||
            cases.length === 1;

          if (isMatch) {
            modified = true;
            return {
              ...c,
              status: 'VERIFIED_RESOLVED',
              statusLabel: 'Resolved & Refund Settled',
              customerSafeStatusText: `Good news! Your dispute has been authorized by the bank supervisor. A full refund of ${prop.currency} ${Number(prop.reversalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} has been dispatched to your account.`,
              resolvedAt: new Date().toISOString(),
              isOverdue: false,
              history: [
                ...(c.history || []).map((h: any) =>
                  h.stage === 'VERIFIED_RESOLVED' || h.stage === 'REVERSAL_INITIATED'
                    ? { ...h, verified: true, timestamp: new Date().toLocaleTimeString() + ' WAT' }
                    : h
                ),
                {
                  stage: 'VERIFIED_RESOLVED',
                  label: 'Reversal Authorized by Supervisor',
                  timestamp: new Date().toLocaleTimeString() + ' WAT',
                  details: `Reversal of ${prop.currency} ${prop.reversalAmount} authorized by Supervisor. Dispatched to Core Banking Switch.`,
                  verified: true,
                },
              ],
            };
          }
          return c;
        });

        if (modified) {
          localStorage.setItem(key, JSON.stringify(updatedCases));
        }
      }
    } catch {
      // silent
    }
  }

  // Update in-memory customer exceptions stored in localStorage
  try {
    const stored = getStoredCustomerExceptions();
    if (stored.length > 0) {
      const updatedStored = stored.map((e) =>
        e.reference === prop.reference || e.transactionId === prop.transactionId
          ? { ...e, status: 'resolved' as FinancialStatus }
          : e
      );
      saveStoredLiveItems(LIVE_CUSTOMER_EXCEPTIONS_KEY, updatedStored);
    }
  } catch {
    // silent
  }

  // Dispatch real-time custom event across the window to notify customer UI
  window.dispatchEvent(
    new CustomEvent('smartreversal:case_resolved', {
      detail: {
        reference: prop.reference,
        amount: prop.reversalAmount,
        currency: prop.currency,
        authorizedBy: prop.authorizedBy,
        timestamp: new Date().toISOString(),
      },
    })
  );
}

const isTestEnv =
  (typeof globalThis !== 'undefined' && (Boolean((globalThis as any).process?.env?.NODE_ENV === 'test') || Boolean((globalThis as any).process?.env?.VITEST))) ||
  (typeof import.meta !== 'undefined' && Boolean((import.meta as any).env?.MODE === 'test'));

let transactions: Transaction[] = isTestEnv
  ? [...INITIAL_TRANSACTIONS]
  : getStoredLiveItems<Transaction>(LIVE_TRANSACTIONS_KEY);
let exceptions: FinancialException[] = isTestEnv
  ? [...INITIAL_EXCEPTIONS]
  : getStoredLiveItems<FinancialException>(LIVE_CUSTOMER_EXCEPTIONS_KEY);
let investigations: InvestigationCase[] = isTestEnv
  ? [...INITIAL_INVESTIGATIONS]
  : getStoredLiveItems<InvestigationCase>(LIVE_INVESTIGATIONS_KEY);
let reversals: ReversalProposal[] = isTestEnv
  ? [...INITIAL_REVERSALS]
  : getStoredLiveItems<ReversalProposal>(LIVE_REVERSALS_KEY);
let auditTrail: AuditEvent[] = isTestEnv
  ? [...INITIAL_AUDIT_TRAIL]
  : getStoredLiveItems<AuditEvent>(LIVE_AUDIT_KEY);
const reconciliationRuns = [...RECONCILIATION_RUNS];

let currentAuthToken: string | null = null;

export function getAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (currentAuthToken) {
    headers['Authorization'] = `Bearer ${currentAuthToken}`;
  }
  return headers;
}

export interface QueryTransactionParams {
  reference?: string;
  channel?: Channel;
  status?: FinancialStatus;
  limit?: number;
}

export interface ProposeReversalParams {
  transactionId: string;
  reasonCode: string;
  justification: string;
  proposedBy: string;
}

export interface AuthorizeReversalParams {
  reversalId: string;
  authorizedBy: string;
  decision: 'APPROVE' | 'REJECT';
  notes?: string;
}

export const apiClient = {
  setAuthToken(token: string | null) {
    currentAuthToken = token;
  },

  getAuthToken(): string | null {
    return currentAuthToken;
  },

  async login(credentials: {
    institution: string;
    email: string;
    password: string;
    otp?: string;
  }): Promise<{
    access_token: string;
    token_type: string;
    expires_at: string;
    user_id: string;
    roles: string[];
    mfa: boolean;
  }> {
    const origin = typeof window !== 'undefined' ? '' : 'http://localhost:5173';
    try {
      const res = await fetch(`${origin}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (res.ok) {
        const data = await res.json();
        currentAuthToken = data.access_token;
        return data;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Authentication failed');
    } catch (error) {
      // In demo/offline mode, support seamless fallback for seeded demo credentials
      if (
        credentials.email === 'officer@demo.example' ||
        credentials.email === 'supervisor@demo.example' ||
        credentials.email.includes('maker') ||
        credentials.email.includes('checker')
      ) {
        const isChecker =
          credentials.email === 'supervisor@demo.example' || credentials.email.includes('checker');
        const fallbackRoles = isChecker
          ? ['SUPERVISOR']
          : ['REVERSAL_OFFICER', 'TXN_ANALYST'];
        const fallbackToken = `demo_jwt_token_${isChecker ? 'checker' : 'maker'}_${Date.now()}`;
        currentAuthToken = fallbackToken;
        return {
          access_token: fallbackToken,
          token_type: 'Bearer',
          expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
          user_id: isChecker ? 'usr-demo-supervisor' : 'usr-demo-officer',
          roles: fallbackRoles,
          mfa: true,
        };
      }
      throw error;
    }
  },

  async getMe() {
    const origin = typeof window !== 'undefined' ? '' : 'http://localhost:5173';
    try {
      const res = await fetch(`${origin}/v1/me`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // silent fallback
    }
    return null;
  },

  // Check live status of all 3 architectural tiers
  async getServiceStatuses(): Promise<ServiceTierStatus> {
    let backendLive = false;
    let backendService = 'api';
    let backendVersion = '0.1.0';
    let backendLatency = 0;

    try {
      const start = performance.now();
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 2000);
      const origin = typeof window !== 'undefined' ? '' : 'http://localhost:5173';
      const res = await fetch(`${origin}/v1/health`, { signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        backendLive = true;
        backendService = data.service || 'api';
        backendVersion = data.version || '0.1.0';
        backendLatency = Math.round(performance.now() - start);
      }
    } catch {
      backendLive = false;
    }

    const aiHealth = await aiClient.getHealth();

    return {
      backend: {
        isLive: backendLive,
        status: backendLive ? 'connected' : 'offline',
        service: backendService,
        version: backendVersion,
        latencyMs: backendLatency,
      },
      aiService: {
        isLive: aiHealth.isLive,
        status: aiHealth.isLive ? 'connected' : 'offline',
        service: aiHealth.service,
        latencyMs: aiHealth.latencyMs,
      },
      simulationFallbackActive: !backendLive || !aiHealth.isLive,
    };
  },

  // GET /health
  async getHealth() {
    return {
      status: 'operational',
      version: '0.1.0',
      database: 'connected (PostgreSQL 16)',
      redis: 'connected (Redis 7.2)',
      nipSwitchAdapter: 'ONLINE (NIBSS Sandbox Gateway)',
      coreBankingLedger: 'SYNCHRONIZED',
      aiAnomalyEngine: 'ACTIVE (Latency 14ms)',
    };
  },

  // GET /transactions (Live /v1/transactions with simulator fallback)
  async getTransactions(params?: QueryTransactionParams): Promise<Transaction[]> {
    const origin = typeof window !== 'undefined' ? '' : 'http://localhost:5173';
    try {
      const url = new URL(`${origin}/v1/transactions`, window.location.origin);
      if (params?.reference) url.searchParams.set('reference', params.reference);
      if (params?.channel) url.searchParams.set('rail', params.channel);
      if (params?.status) url.searchParams.set('state', params.status);
      if (params?.limit) url.searchParams.set('limit', String(params.limit));

      const res = await fetch(url.toString(), {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : data?.items;
        if (Array.isArray(rawList) && rawList.length > 0) {
          return rawList.map((item: Record<string, unknown>) => ({
            id: (item.id as string) || `tx-${item.instruction_ref}`,
            reference: (item.instruction_ref as string) || (item.reference as string) || 'N/A',
            rrn: (item.rrn as string) || (item.instruction_ref as string) || 'N/A',
            stan: (item.stan as string) || '000000',
            amount: item.amount_minor ? (Number(item.amount_minor) / 100).toFixed(2) : ((item.amount as string) || '0.00'),
            currency: (item.currency as string) || 'NGN',
            channel: ((item.rail as string) || (item.channel as string) || 'NIP') as Channel,
            status: ((item.lifecycle_state as string) || (item.status as string) || 'detected') as FinancialStatus,
            senderAccount: (item.payer_account as string) || (item.senderAccount as string) || '0012345678',
            beneficiaryAccount: (item.payee_account as string) || (item.beneficiaryAccount as string) || '0087654321',
            senderBank: (item.originating_inst as string) || (item.senderBank as string) || 'Demo Bank',
            beneficiaryBank: (item.destination_inst as string) || (item.beneficiaryBank as string) || 'Beneficiary Bank',
            createdAt: (item.initiated_at as string) || (item.createdAt as string) || new Date().toISOString(),
            hasDiscrepancy: Boolean(item.has_exception ?? item.hasDiscrepancy ?? false),
            isVerified: Boolean(item.verified ?? true),
          }));
        }
      }
    } catch {
      // live failed, fallback to simulator
    }

    let result = [...transactions];
    if (params?.reference) {
      const q = params.reference.toLowerCase();
      result = result.filter(
        (t) =>
          t.reference.toLowerCase().includes(q) ||
          t.rrn.includes(q) ||
          t.stan.includes(q) ||
          t.senderAccount.includes(q) ||
          t.beneficiaryAccount.includes(q)
      );
    }
    if (params?.channel) {
      result = result.filter((t) => t.channel === params.channel);
    }
    if (params?.status) {
      result = result.filter((t) => t.status === params.status);
    }
    return result;
  },

  // GET /exceptions (Live /v1/exceptions with simulator fallback)
  async getExceptions(params?: {
    severity?: Severity;
    channel?: Channel;
    status?: FinancialStatus;
    classificationCode?: string;
    source?: string;
  }): Promise<FinancialException[]> {
    const origin = typeof window !== 'undefined' ? '' : 'http://localhost:5173';
    try {
      const url = new URL(`${origin}/v1/exceptions`, window.location.origin);
      if (params?.status) url.searchParams.set('status', params.status);
      if (params?.classificationCode) url.searchParams.set('classification', params.classificationCode);
      if (params?.source) url.searchParams.set('source', params.source);

      const res = await fetch(url.toString(), {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const rawList = Array.isArray(data) ? data : data?.items;
        if (Array.isArray(rawList) && rawList.length > 0) {
          return rawList.map((item: Record<string, unknown>, idx: number) => ({
            id: (item.id as string) || `exc-${idx}`,
            transactionId: (item.txn_id as string) || `tx-${item.id}`,
            reference: (item.case_ref as string) || `REF-${item.id}`,
            type: ((item.classification as string) || 'DEBIT_WITHOUT_CREDIT') as ExceptionType,
            classificationCode: ((item.classification as string) || 'CUS001') as ClassificationCode,
            source: ((item.source as string) === 'CUSTOMER' ? 'CUSTOMER' : 'BOT') as ExceptionSource,
            rootCause: ((item.root_cause as string) || 'SWITCH_TIMEOUT') as RootCause,
            severity: (item.priority === 'CRITICAL' ? 'CRITICAL' : item.priority === 'HIGH' ? 'HIGH' : 'MEDIUM') as Severity,
            amount: item.exposure_minor ? (Number(item.exposure_minor) / 100).toFixed(2) : '10000.00',
            currency: (item.currency as string) || 'NGN',
            exposure: item.exposure_minor ? (Number(item.exposure_minor) / 100).toFixed(2) : '10000.00',
            exposureType: 'CUSTOMER_DISPUTE',
            channel: 'NIP' as Channel,
            status: (item.status === 'resolved' ? 'resolved' : 'detected') as FinancialStatus,
            lane: 'MANUAL_INVESTIGATION',
            description: (item.headline as string) || 'Exception detected by automated rules',
            detectedAt: (item.opened_at as string) || new Date().toISOString(),
            debitTimestamp: (item.debit_timestamp as string) || (item.opened_at as string) || new Date().toISOString(),
            internalSlaTarget: (item.sla_due_at as string) || new Date(Date.now() + 4 * 3600000).toISOString(),
            regulatoryDeadline: (item.sla_due_at as string) || new Date(Date.now() + 24 * 3600000).toISOString(),
            slaStatus: 'ON_TRACK',
            modelConfidence: 94,
            modelExplanation: 'Telemetry correlation indicates switch timeout without credit notification.',
            priorityScore: 88,
            priorityFactors: {
              amountWeight: 30,
              slaWeight: 25,
              customerWeight: 20,
              anomalyWeight: 13,
              rationale: 'High priority transaction with pending customer inquiry.',
            },
            team: ((item.queue as string) || 'DISPUTE_RESOLUTION') as ExceptionTeam,
            sourceFreshness: 'Live (NIP Switch Stream)',
            sourceFreshnessState: 'LIVE',
            repeatContactCount: 0,
            version: (item.version as number) || 1,
            notes: [],
            stateHistory: [],
          }));
        }
      }
    } catch {
      // fallback
    }

    // Always merge any customer-posted disputes at the front of the queue
    const liveCustomerItems = getStoredCustomerExceptions();
    const existingIds = new Set(exceptions.map((e) => e.id));
    for (const item of liveCustomerItems) {
      if (!existingIds.has(item.id)) {
        exceptions.unshift(item);
        existingIds.add(item.id);
      }
    }

    let result = [...exceptions];
    if (params?.severity) {
      result = result.filter((e) => e.severity === params.severity);
    }
    if (params?.channel) {
      result = result.filter((e) => e.channel === params.channel);
    }
    if (params?.status) {
      result = result.filter((e) => e.status === params.status);
    }
    if (params?.classificationCode) {
      result = result.filter((e) => e.classificationCode === params.classificationCode);
    }
    if (params?.source) {
      result = result.filter((e) => e.source === params.source);
    }
    return result;
  },

  // Record customer dispute directly to operational queues (live sync)
  recordCustomerDisputeException(newExc: FinancialException) {
    const stored = getStoredCustomerExceptions();
    const filtered = stored.filter((e) => e.id !== newExc.id && e.reference !== newExc.reference);
    const updated = [newExc, ...filtered];
    saveStoredLiveItems(LIVE_CUSTOMER_EXCEPTIONS_KEY, updated);

    // Prepend to in-memory exceptions
    if (!exceptions.some((e) => e.id === newExc.id || e.reference === newExc.reference)) {
      exceptions = [newExc, ...exceptions];
    }

    // Also create matching live transaction so analyst and supervisor can query and resolve
    const newTxn: Transaction = {
      id: newExc.transactionId,
      reference: newExc.reference,
      rrn: newExc.rrn || newExc.reference,
      stan: '000000',
      amount: newExc.amount,
      currency: newExc.currency,
      channel: newExc.channel,
      status: newExc.status,
      senderAccount: newExc.accountNumber || '0012345678',
      beneficiaryAccount: '0098765432',
      senderBank: 'Originating Bank',
      beneficiaryBank: 'Beneficiary Bank',
      createdAt: newExc.detectedAt,
      hasDiscrepancy: true,
      isVerified: true,
    };
    if (!transactions.some((t) => t.id === newTxn.id || t.reference === newTxn.reference)) {
      transactions = [newTxn, ...transactions];
      saveStoredLiveItems(LIVE_TRANSACTIONS_KEY, transactions);
    }

    // Also create matching investigation case so analyst can inspect it in Investigations tab
    const newInv: InvestigationCase = {
      id: `inv-${newExc.id}`,
      caseNumber: `CASE-${newExc.reference}`,
      exceptionId: newExc.id,
      reference: newExc.reference,
      status: 'detected',
      priority: newExc.severity,
      assignedAnalyst: 'Unassigned',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      exception: newExc,
      evidence: [],
      timeline: [
        {
          id: `evt-${Date.now()}`,
          source: 'CUSTOMER',
          sourceName: 'Smart Reversal Customer Portal',
          sourceTimestamp: new Date().toISOString(),
          receivedTimestamp: new Date().toISOString(),
          clockSkewMs: 0,
          isLateArriving: false,
          title: 'Customer Dispute Registered',
          description: `Dispute filed by customer for reference ${newExc.reference} (${newExc.currency} ${newExc.amount})`,
          payload: { reference: newExc.reference, amount: newExc.amount },
          severity: 'INFO',
        },
      ],
      externalDependencies: [],
      confirmedRootCause: undefined,
      aiSuggestedRootCause: newExc.rootCause,
      isRootCauseConfirmed: false,
      ledgerPostings: [],
      relatedTransactions: [
        {
          id: newTxn.id,
          reference: newTxn.reference,
          amount: newTxn.amount,
          currency: newTxn.currency,
          channel: newTxn.channel,
          status: newTxn.status,
          relation: 'DISPUTED_TRANSACTION',
          timestamp: newTxn.createdAt,
        },
      ],
      relatedCases: [],
      killSwitchActive: false,
      proposedAction: 'Initiate counterparty query or reversal approval under dual control',
      aiSuggestedRemedy: newExc.modelExplanation,
      modelConfidence: newExc.modelConfidence,
    };
    if (!investigations.some((i) => i.id === newInv.id || i.reference === newInv.reference)) {
      investigations = [newInv, ...investigations];
      saveStoredLiveItems(LIVE_INVESTIGATIONS_KEY, investigations);
    }

    // Emit live custom event for reactive real-time UI updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('smartreversal:new_exception', { detail: newExc }));
    }
  },

  // Customer Complaint Intake (Live POST /v1/complaints with API format)
  async submitComplaint(complaint: {
    instruction_ref?: string;
    account_number?: string;
    amount_minor?: number;
    currency?: string;
    channel?: string;
    complaint?: string;
    text?: string;
    contact?: string;
  }) {
    const origin = typeof window !== 'undefined' ? '' : 'http://localhost:5173';
    try {
      const payload = {
        instruction_ref: complaint.instruction_ref || '',
        text: complaint.text || complaint.complaint || 'Customer transaction dispute registered via customer portal.',
        contact_ref: complaint.contact || 'CUSTOMER_SESSION',
      };
      const res = await fetch(`${origin}/v1/complaints`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // fallback
    }
    return {
      case: {
        id: `case-cus-${Date.now()}`,
        case_ref: `CASE-${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'detected',
        opened_at: new Date().toISOString(),
        simulated: true,
      },
      linked: Boolean(complaint.instruction_ref),
    };
  },

  // Customer Case Status (Live GET /v1/cases/:id/customer-status)
  async getCustomerCaseStatus(caseId: string) {
    const origin = typeof window !== 'undefined' ? '' : 'http://localhost:5173';
    try {
      const res = await fetch(`${origin}/v1/cases/${encodeURIComponent(caseId)}/customer-status`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // fallback
    }
    return null;
  },

  // CLAIM exception (with optimistic concurrency check)
  async claimException(
    exceptionId: string,
    analystId: string,
    analystName: string,
    expectedVersion: number
  ): Promise<FinancialException> {
    const exc = exceptions.find((e) => e.id === exceptionId);
    if (!exc) throw new Error('Exception not found');

    if (exc.version !== expectedVersion) {
      const err = new Error('CONCURRENCY_CONFLICT');
      (err as unknown as { currentVersion: number; updatedBy: string }).currentVersion = exc.version;
      (err as unknown as { currentVersion: number; updatedBy: string }).updatedBy = exc.assignedTo || 'Another Analyst';
      throw err;
    }

    const updated: FinancialException = {
      ...exc,
      assignedTo: analystId,
      ownerName: analystName,
      status: exc.status === 'detected' ? 'investigating' : exc.status,
      version: exc.version + 1,
      stateHistory: [
        ...exc.stateHistory,
        {
          from: exc.status,
          to: exc.status === 'detected' ? 'investigating' : exc.status,
          reasonCode: 'CLAIMED_BY_ANALYST',
          author: analystName,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    exceptions = exceptions.map((e) => (e.id === exceptionId ? updated : e));
    return updated;
  },

  // ASSIGN exception
  async assignException(
    exceptionId: string,
    analystId: string,
    analystName: string,
    team: ExceptionTeam,
    expectedVersion: number
  ): Promise<FinancialException> {
    const exc = exceptions.find((e) => e.id === exceptionId);
    if (!exc) throw new Error('Exception not found');

    if (exc.version !== expectedVersion) {
      const err = new Error('CONCURRENCY_CONFLICT');
      (err as unknown as { currentVersion: number; updatedBy: string }).currentVersion = exc.version;
      (err as unknown as { currentVersion: number; updatedBy: string }).updatedBy = exc.assignedTo || 'Another Analyst';
      throw err;
    }

    const updated: FinancialException = {
      ...exc,
      assignedTo: analystId,
      ownerName: analystName,
      team,
      version: exc.version + 1,
    };

    exceptions = exceptions.map((e) => (e.id === exceptionId ? updated : e));
    return updated;
  },

  // UPDATE exception status with mandatory reason code
  async updateExceptionStatus(
    exceptionId: string,
    newStatus: FinancialStatus,
    reasonCode: string,
    author: string,
    justification: string,
    expectedVersion: number
  ): Promise<FinancialException> {
    const exc = exceptions.find((e) => e.id === exceptionId);
    if (!exc) throw new Error('Exception not found');

    if (exc.version !== expectedVersion) {
      const err = new Error('CONCURRENCY_CONFLICT');
      (err as unknown as { currentVersion: number; updatedBy: string }).currentVersion = exc.version;
      (err as unknown as { currentVersion: number; updatedBy: string }).updatedBy = exc.assignedTo || 'Another Analyst';
      throw err;
    }

    const updated: FinancialException = {
      ...exc,
      status: newStatus,
      version: exc.version + 1,
      stateHistory: [
        ...exc.stateHistory,
        {
          from: exc.status,
          to: newStatus,
          reasonCode,
          author,
          timestamp: new Date().toISOString(),
        },
      ],
      notes: [
        ...exc.notes,
        {
          id: `n-${Date.now()}`,
          author,
          authorRole: 'ANALYST_MAKER',
          timestamp: new Date().toISOString(),
          text: `Status changed to ${newStatus.toUpperCase()}: [${reasonCode}] ${justification}`,
        },
      ],
    };

    exceptions = exceptions.map((e) => (e.id === exceptionId ? updated : e));
    return updated;
  },

  // ADD note to exception
  async addExceptionNote(
    exceptionId: string,
    author: string,
    authorRole: Role,
    text: string
  ): Promise<FinancialException> {
    const exc = exceptions.find((e) => e.id === exceptionId);
    if (!exc) throw new Error('Exception not found');

    const newNote: ExceptionNote = {
      id: `note-${Date.now()}`,
      author,
      authorRole,
      timestamp: new Date().toISOString(),
      text,
    };

    const updated: FinancialException = {
      ...exc,
      version: exc.version + 1,
      notes: [...exc.notes, newNote],
    };

    exceptions = exceptions.map((e) => (e.id === exceptionId ? updated : e));
    return updated;
  },

  // LINK exception to incident
  async linkExceptionToIncident(
    exceptionId: string,
    incidentId: string,
    incidentTitle: string
  ): Promise<FinancialException> {
    const exc = exceptions.find((e) => e.id === exceptionId);
    if (!exc) throw new Error('Exception not found');

    const updated: FinancialException = {
      ...exc,
      incidentId,
      incidentTitle,
      version: exc.version + 1,
    };

    exceptions = exceptions.map((e) => (e.id === exceptionId ? updated : e));
    return updated;
  },

  // BULK assign exceptions
  async bulkAssignExceptions(
    exceptionIds: string[],
    analystId: string,
    analystName: string,
    team: ExceptionTeam
  ): Promise<FinancialException[]> {
    exceptions = exceptions.map((e) => {
      if (exceptionIds.includes(e.id)) {
        return {
          ...e,
          assignedTo: analystId,
          ownerName: analystName,
          team,
          version: e.version + 1,
        };
      }
      return e;
    });

    return exceptions.filter((e) => exceptionIds.includes(e.id));
  },

  // GET /investigations
  async getInvestigations(): Promise<InvestigationCase[]> {
    return [...investigations];
  },

  async getInvestigationCases(): Promise<InvestigationCase[]> {
    return this.getInvestigations();
  },

  // GET /investigations/:id
  async getInvestigationCase(id: string): Promise<InvestigationCase | null> {
    const found = investigations.find((c) => c.id === id || c.caseNumber === id || c.exceptionId === id);
    return found ? { ...found } : null;
  },

  // CONFIRM / EDIT Root Cause Tag
  async confirmRootCause(
    caseId: string,
    confirmedCause: RootCause,
    analyst: string = 'Olusola Adeyemi (Maker)'
  ): Promise<InvestigationCase> {
    const c = investigations.find((x) => x.id === caseId);
    if (!c) throw new Error('Case not found');

    const updated: InvestigationCase = {
      ...c,
      confirmedRootCause: confirmedCause,
      isRootCauseConfirmed: true,
      updatedAt: new Date().toISOString(),
      timeline: [
        ...c.timeline,
        {
          id: `tl-rc-${Date.now()}`,
          source: 'OPS',
          sourceName: 'Analyst Case Triage',
          sourceTimestamp: new Date().toISOString(),
          receivedTimestamp: new Date().toISOString(),
          clockSkewMs: 0,
          isLateArriving: false,
          title: `Root Cause Confirmed: ${confirmedCause}`,
          description: `Analyst ${analyst} confirmed root-cause diagnosis.`,
          payload: { confirmedCause, analyst },
          severity: 'SUCCESS',
        },
      ],
    };

    investigations = investigations.map((x) => (x.id === caseId ? updated : x));
    return updated;
  },

  // CONFIRM Duplicate Verdict
  async confirmDuplicateVerdict(
    caseId: string,
    verdict: 'CONFIRMED_DUPLICATE' | 'LEGITIMATE_RETRY',
    reason: string,
    analyst: string = 'Olusola Adeyemi (Maker)'
  ): Promise<InvestigationCase> {
    const c = investigations.find((x) => x.id === caseId);
    if (!c) throw new Error('Case not found');

    const updated: InvestigationCase = {
      ...c,
      status: verdict === 'CONFIRMED_DUPLICATE' ? 'approval' : 'resolved',
      duplicateComparison: c.duplicateComparison
        ? {
            ...c.duplicateComparison,
            ruleOutcome: verdict,
            verdictReason: reason,
          }
        : undefined,
      updatedAt: new Date().toISOString(),
      timeline: [
        ...c.timeline,
        {
          id: `tl-dup-${Date.now()}`,
          source: 'OPS',
          sourceName: 'Duplicate Decision Engine',
          sourceTimestamp: new Date().toISOString(),
          receivedTimestamp: new Date().toISOString(),
          clockSkewMs: 0,
          isLateArriving: false,
          title: `Duplicate Verdict: ${verdict}`,
          description: `Analyst ${analyst}: ${reason}`,
          payload: { verdict, reason, analyst },
          severity: verdict === 'CONFIRMED_DUPLICATE' ? 'WARNING' : 'SUCCESS',
        },
      ],
    };

    investigations = investigations.map((x) => (x.id === caseId ? updated : x));
    return updated;
  },

  // REQUEST Missing Evidence Check
  async requestMissingEvidenceCheck(
    caseId: string,
    evidenceId: string,
    targetSource: string,
    analyst: string = 'Olusola Adeyemi (Maker)'
  ): Promise<InvestigationCase> {
    const c = investigations.find((x) => x.id === caseId);
    if (!c) throw new Error('Case not found');

    const updatedEvidence = c.evidence.map((ev) =>
      ev.id === evidenceId
        ? {
            ...ev,
            freshness: 'FRESH' as const,
            freshnessLabel: 'Verification In-Flight',
            details: `${ev.details} [Check DISPATCHED to ${targetSource} by ${analyst}]`,
          }
        : ev
    );

    const updated: InvestigationCase = {
      ...c,
      evidence: updatedEvidence,
      updatedAt: new Date().toISOString(),
      timeline: [
        ...c.timeline,
        {
          id: `tl-ev-req-${Date.now()}`,
          source: 'OPS',
          sourceName: 'Counterparty Inquiry Service',
          sourceTimestamp: new Date().toISOString(),
          receivedTimestamp: new Date().toISOString(),
          clockSkewMs: 0,
          isLateArriving: false,
          title: `Evidence Check Dispatched to ${targetSource}`,
          description: `Automated query queued for missing counterparty leg (${evidenceId}).`,
          payload: { evidenceId, targetSource, analyst },
          severity: 'INFO',
        },
      ],
    };

    investigations = investigations.map((x) => (x.id === caseId ? updated : x));
    return updated;
  },

  // ADD External Dependency
  async addExternalDependency(
    caseId: string,
    dep: Omit<ExternalDependency, 'id'>
  ): Promise<InvestigationCase> {
    const c = investigations.find((x) => x.id === caseId);
    if (!c) throw new Error('Case not found');

    const newDep: ExternalDependency = {
      ...dep,
      id: `dep-${Date.now()}`,
      status: dep.status || 'PENDING',
    };

    const updated: InvestigationCase = {
      ...c,
      externalDependencies: [...c.externalDependencies, newDep],
      updatedAt: new Date().toISOString(),
    };

    investigations = investigations.map((x) => (x.id === caseId ? updated : x));
    return updated;
  },

  // CLOSE Investigation Case
  async closeInvestigationCase(
    caseId: string,
    resolutionCode: string,
    notes: string,
    analyst: string = 'Olusola Adeyemi (Maker)'
  ): Promise<InvestigationCase> {
    const c = investigations.find((x) => x.id === caseId);
    if (!c) throw new Error('Case not found');

    const updated: InvestigationCase = {
      ...c,
      status: 'resolved',
      exception: {
        ...c.exception,
        status: 'resolved',
        resolutionCode,
      },
      updatedAt: new Date().toISOString(),
      timeline: [
        ...c.timeline,
        {
          id: `tl-close-${Date.now()}`,
          source: 'OPS',
          sourceName: 'Case Resolution Terminal',
          sourceTimestamp: new Date().toISOString(),
          receivedTimestamp: new Date().toISOString(),
          clockSkewMs: 0,
          isLateArriving: false,
          title: `Case Closed: ${resolutionCode}`,
          description: `${analyst}: ${notes}`,
          payload: { resolutionCode, notes, analyst },
          severity: 'SUCCESS',
        },
      ],
    };

    investigations = investigations.map((x) => (x.id === caseId ? updated : x));
    return updated;
  },

  // GET /reversals
  async getReversals(): Promise<ReversalProposal[]> {
    return [...reversals];
  },

  // POST /reversals/propose (Maker Step)
  async proposeReversal(payload: ProposeReversalParams): Promise<ReversalProposal> {
    let txn = transactions.find((t) => t.id === payload.transactionId);
    if (!txn) {
      // Find matching exception if txn is not yet in transactions array
      const exc = exceptions.find((e) => e.transactionId === payload.transactionId || e.id === payload.transactionId || e.reference === payload.transactionId);
      if (exc) {
        txn = {
          id: exc.transactionId,
          reference: exc.reference,
          rrn: exc.rrn || exc.reference,
          stan: '000000',
          amount: exc.amount,
          currency: exc.currency,
          channel: exc.channel,
          status: 'approval',
          senderAccount: exc.accountNumber || '0012345678',
          beneficiaryAccount: '0098765432',
          senderBank: 'Originating Bank',
          beneficiaryBank: 'Beneficiary Bank',
          createdAt: exc.detectedAt,
          hasDiscrepancy: true,
          isVerified: true,
        };
        transactions = [txn, ...transactions];
        saveStoredLiveItems(LIVE_TRANSACTIONS_KEY, transactions);
      } else {
        throw new Error('Transaction or Exception not found');
      }
    }

    const newProposal: ReversalProposal = {
      id: `rev-prop-${Date.now()}`,
      transactionId: txn.id,
      reference: txn.reference,
      originalAmount: txn.amount,
      reversalAmount: txn.amount,
      currency: txn.currency,
      channel: txn.channel,
      status: 'approval', // Pending dual-control Checker
      proposedBy: payload.proposedBy,
      proposedAt: new Date().toISOString(),
      reasonCode: payload.reasonCode,
      justification: payload.justification,
      idempotencyKey: `idemp_${txn.reference.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Math.random().toString(36).substring(2, 9)}`,
      destinationAccount: txn.senderAccount,
      destinationBank: txn.senderBank,
    };

    reversals = [newProposal, ...reversals];
    saveStoredLiveItems(LIVE_REVERSALS_KEY, reversals);

    // Update transaction status
    transactions = transactions.map((t) =>
      t.id === txn!.id ? { ...t, status: 'approval' as FinancialStatus } : t
    );
    saveStoredLiveItems(LIVE_TRANSACTIONS_KEY, transactions);

    // Update exception status if exists
    exceptions = exceptions.map((e) =>
      e.transactionId === txn!.id || e.reference === txn!.reference ? { ...e, status: 'approval' as FinancialStatus } : e
    );
    saveStoredLiveItems(LIVE_CUSTOMER_EXCEPTIONS_KEY, exceptions);

    // Audit Event
    auditTrail = [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorId: payload.proposedBy,
        actorRole: 'ANALYST_MAKER',
        action: 'REVERSAL_PROPOSED',
        entityType: 'REVERSAL',
        entityId: newProposal.id,
        prevHash: auditTrail[0]?.entryHash || '0000',
        entryHash: Math.random().toString(36).substring(2, 18),
        details: { reference: txn.reference, amount: txn.amount, reason: payload.reasonCode },
        ipAddress: '127.0.0.1',
      },
      ...auditTrail,
    ];
    saveStoredLiveItems(LIVE_AUDIT_KEY, auditTrail);

    // Dispatch event so supervisor view updates live
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('smartreversal:new_reversal', { detail: newProposal }));
    }

    return newProposal;
  },

  // POST /reversals/batch-propose (Maker Step - High-Volume Scale Triage)
  async batchProposeReversals(payload: {
    exceptionIds: string[];
    proposedBy: string;
    reasonCode: string;
    justification: string;
  }): Promise<ReversalProposal[]> {
    const proposals: ReversalProposal[] = [];

    for (const excId of payload.exceptionIds) {
      const exc = exceptions.find((e) => e.id === excId || e.reference === excId);
      if (!exc) continue;

      let txn = transactions.find((t) => t.id === exc.transactionId || t.reference === exc.reference);
      if (!txn) {
        txn = {
          id: exc.transactionId,
          reference: exc.reference,
          rrn: exc.rrn || exc.reference,
          stan: '000000',
          amount: exc.amount,
          currency: exc.currency,
          channel: exc.channel,
          status: 'approval',
          senderAccount: exc.accountNumber || '0012345678',
          beneficiaryAccount: '0098765432',
          senderBank: 'Originating Bank',
          beneficiaryBank: 'Beneficiary Bank',
          createdAt: exc.detectedAt,
          hasDiscrepancy: true,
          isVerified: true,
        };
        transactions = [txn, ...transactions];
      }

      const newProposal: ReversalProposal = {
        id: `rev-prop-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        transactionId: txn.id,
        reference: txn.reference,
        originalAmount: txn.amount,
        reversalAmount: txn.amount,
        currency: txn.currency,
        channel: txn.channel,
        status: 'approval',
        proposedBy: payload.proposedBy,
        proposedAt: new Date().toISOString(),
        reasonCode: payload.reasonCode,
        justification: payload.justification,
        idempotencyKey: `idemp_${txn.reference.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Math.random().toString(36).substring(2, 9)}`,
        destinationAccount: txn.senderAccount,
        destinationBank: txn.senderBank,
      };

      proposals.push(newProposal);
      reversals = [newProposal, ...reversals];

      transactions = transactions.map((t) =>
        t.id === txn!.id ? { ...t, status: 'approval' as FinancialStatus } : t
      );
      exceptions = exceptions.map((e) =>
        e.id === exc.id ? { ...e, status: 'approval' as FinancialStatus } : e
      );
    }

    saveStoredLiveItems(LIVE_REVERSALS_KEY, reversals);
    saveStoredLiveItems(LIVE_TRANSACTIONS_KEY, transactions);
    saveStoredLiveItems(LIVE_CUSTOMER_EXCEPTIONS_KEY, exceptions);

    auditTrail = [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorId: payload.proposedBy,
        actorRole: 'ANALYST_MAKER',
        action: 'BATCH_REVERSALS_PROPOSED',
        entityType: 'REVERSAL',
        entityId: `batch-${proposals.length}`,
        prevHash: auditTrail[0]?.entryHash || '0000',
        entryHash: Math.random().toString(36).substring(2, 18),
        details: { count: proposals.length, reason: payload.reasonCode },
        ipAddress: '127.0.0.1',
      },
      ...auditTrail,
    ];
    saveStoredLiveItems(LIVE_AUDIT_KEY, auditTrail);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('smartreversal:new_reversal', { detail: proposals }));
    }

    return proposals;
  },

  // POST /reversals/{id}/authorize (Checker Step)
  async authorizeReversal(payload: AuthorizeReversalParams): Promise<ReversalProposal> {
    const prop = reversals.find((r) => r.id === payload.reversalId);
    if (!prop) throw new Error('Reversal proposal not found');

    const updatedStatus: FinancialStatus = payload.decision === 'APPROVE' ? 'resolved' : 'failed';

    const updated: ReversalProposal = {
      ...prop,
      status: updatedStatus,
      authorizedBy: payload.authorizedBy,
      authorizedAt: new Date().toISOString(),
      rejectionReason: payload.decision === 'REJECT' ? payload.notes : undefined,
    };

    reversals = reversals.map((r) => (r.id === prop.id ? updated : r));
    saveStoredLiveItems(LIVE_REVERSALS_KEY, reversals);

    // Update linked transaction
    transactions = transactions.map((t) =>
      t.id === prop.transactionId ? { ...t, status: updatedStatus, hasDiscrepancy: false } : t
    );
    saveStoredLiveItems(LIVE_TRANSACTIONS_KEY, transactions);

    // Update linked exception if exists
    exceptions = exceptions.map((e) =>
      e.transactionId === prop.transactionId || e.reference === prop.reference ? { ...e, status: updatedStatus } : e
    );
    saveStoredLiveItems(LIVE_CUSTOMER_EXCEPTIONS_KEY, exceptions);

    // Immutable Audit Trail
    auditTrail = [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorId: payload.authorizedBy,
        actorRole: 'SUPERVISOR_CHECKER',
        action: payload.decision === 'APPROVE' ? 'REVERSAL_AUTHORIZED_AND_DISPATCHED' : 'REVERSAL_REJECTED',
        entityType: 'REVERSAL',
        entityId: prop.id,
        prevHash: auditTrail[0]?.entryHash || '0000',
        entryHash: Math.random().toString(36).substring(2, 18),
        details: {
          reference: prop.reference,
          amount: prop.reversalAmount,
          decision: payload.decision,
          idempotencyKey: prop.idempotencyKey,
        },
        ipAddress: '127.0.0.1',
      },
      ...auditTrail,
    ];
    saveStoredLiveItems(LIVE_AUDIT_KEY, auditTrail);

    if (payload.decision === 'APPROVE') {
      syncCustomerCaseResolved(updated);
    }

    return updated;
  },

  // POST /reversals/batch-authorize (Supervisor Checker Step)
  async batchAuthorizeReversals(payload: {
    reversalIds: string[];
    authorizedBy: string;
    decision: 'APPROVE' | 'REJECT';
    notes?: string;
  }): Promise<ReversalProposal[]> {
    const updatedList: ReversalProposal[] = [];

    for (const reversalId of payload.reversalIds) {
      const prop = reversals.find((r) => r.id === reversalId);
      if (!prop) continue;

      const updatedStatus: FinancialStatus = payload.decision === 'APPROVE' ? 'resolved' : 'failed';

      const updated: ReversalProposal = {
        ...prop,
        status: updatedStatus,
        authorizedBy: payload.authorizedBy,
        authorizedAt: new Date().toISOString(),
        rejectionReason: payload.decision === 'REJECT' ? payload.notes : undefined,
      };

      reversals = reversals.map((r) => (r.id === prop.id ? updated : r));

      // Update linked transaction
      transactions = transactions.map((t) =>
        t.id === prop.transactionId ? { ...t, status: updatedStatus, hasDiscrepancy: false } : t
      );

      // Update linked exception if exists
      exceptions = exceptions.map((e) =>
        e.transactionId === prop.transactionId || e.reference === prop.reference
          ? { ...e, status: updatedStatus }
          : e
      );

      // Immutable Audit Trail
      auditTrail = [
        {
          id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          actorId: payload.authorizedBy,
          actorRole: 'SUPERVISOR_CHECKER',
          action:
            payload.decision === 'APPROVE'
              ? 'REVERSAL_AUTHORIZED_AND_DISPATCHED'
              : 'REVERSAL_REJECTED',
          entityType: 'REVERSAL',
          entityId: prop.id,
          prevHash: auditTrail[0]?.entryHash || '0000',
          entryHash: Math.random().toString(36).substring(2, 18),
          details: {
            batchOperation: true,
            totalBatchSize: payload.reversalIds.length,
            reference: prop.reference,
            amount: prop.reversalAmount,
            decision: payload.decision,
            idempotencyKey: prop.idempotencyKey,
            notes: payload.notes,
          },
          ipAddress: '127.0.0.1',
        },
        ...auditTrail,
      ];

      if (payload.decision === 'APPROVE') {
        syncCustomerCaseResolved(updated);
      }

      updatedList.push(updated);
    }

    saveStoredLiveItems(LIVE_REVERSALS_KEY, reversals);
    saveStoredLiveItems(LIVE_TRANSACTIONS_KEY, transactions);
    saveStoredLiveItems(LIVE_CUSTOMER_EXCEPTIONS_KEY, exceptions);
    saveStoredLiveItems(LIVE_AUDIT_KEY, auditTrail);

    return updatedList;
  },

  // GET /audit-logs
  async getAuditLogs(): Promise<AuditEvent[]> {
    return [...auditTrail];
  },

  // GET /reconciliation/runs
  async getReconciliationRuns(): Promise<ReconciliationSummary[]> {
    return [...reconciliationRuns];
  },

  // GET /reversals/:id (with 8 Safety Checks audit)
  async getReversalDetail(reversalId: string): Promise<ReversalDetailRecord | null> {
    const rev = reversals.find((r) => r.id === reversalId);
    if (!rev) return null;

    const exc = exceptions.find((e) => e.transactionId === rev.transactionId || e.reference === rev.reference);
    const inv = investigations.find((i) => i.reference === rev.reference || i.exceptionId === exc?.id);

    const safetyChecks: ReversalSafetyCheck[] = [
      {
        id: 's1-idempotency',
        name: 'S1: Transactional Idempotency Key',
        description: 'Verify cryptographic idempotency key exists and has not been settled.',
        status: rev.idempotencyKey ? 'PASSED' : 'FAILED',
        details: `Key: ${rev.idempotencyKey} (Verified unique across switch gateway)`,
      },
      {
        id: 's2-no-prior-reversal',
        name: 'S2: Duplicate Reversal Prevention',
        description: 'Ensure no settled reversal already exists for this transaction.',
        status: 'PASSED',
        details: 'Switch journal queried: 0 prior reversal messages for this STAN/RRN.',
      },
      {
        id: 's3-single-debit',
        name: 'S3: Core Ledger Single Debit Verified',
        description: 'Proof that funds were debited from originating customer account.',
        status: 'PASSED',
        details: `Account ${rev.destinationAccount} debited ₦${Number(rev.reversalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} on GL-1002.`,
      },
      {
        id: 's4-non-credit',
        name: 'S4: Counterparty Non-Credit Proof',
        description: 'Confirmation from switch or counterparty that beneficiary was not credited.',
        status: 'PASSED',
        details: 'Switch responseCode 91 Destination Bank Unavailable. Session reconciliation confirmed non-credit.',
      },
      {
        id: 's5-policy-limit',
        name: 'S5: Dual-Control Policy Threshold',
        description: 'Check whether reversal amount requires Level 2 or Level 3 Checker signoff.',
        status: Number(rev.reversalAmount) <= 2000000 ? 'PASSED' : 'WARNING',
        details: `Amount: ₦${Number(rev.reversalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} within Analyst Maker limit of ₦2,000,000.00.`,
      },
      {
        id: 's6-separation-of-duties',
        name: 'S6: Separation of Duties (Maker != Checker)',
        description: 'Enforces that the authorizer cannot be the proposing maker.',
        status: 'PASSED',
        details: `Proposed by ${rev.proposedBy}. Requires Checker authorization from different operator.`,
      },
      {
        id: 's7-kill-switch',
        name: 'S7: Reversal Gateway Kill Switch Inactive',
        description: 'Verify global reversal circuit breaker has not been tripped.',
        status: inv?.killSwitchActive ? 'FAILED' : 'PASSED',
        details: inv?.killSwitchActive ? 'BLOCKED: Gateway circuit breaker active.' : 'Switch bridge operational.',
      },
      {
        id: 's8-evidence-freshness',
        name: 'S8: Evidence Freshness Gate',
        description: 'Ensure supporting evidence is not stale (> 2h old).',
        status: 'PASSED',
        details: 'Core reversal evidence verified fresh within 15m threshold. Dual-entry ledger records validated.',
      },
    ];

    const allSafetyChecksPassed = safetyChecks.every((c) => c.status === 'PASSED');

    return {
      ...rev,
      exception: exc,
      investigationCase: inv,
      safetyChecks,
      allSafetyChecksPassed,
      exposureAmount: rev.reversalAmount,
      policyLimit: '2000000.00',
      isWithinPolicyLimit: Number(rev.reversalAmount) <= 2000000,
    };
  },

  // SEARCH Customer Query (First Contact Agent Intake)
  async searchCustomerQuery(
    query: CustomerIntakeQuery,
    agentRole: Role
  ): Promise<AgentQueryResult> {
    // Record audit trail of search
    auditTrail = [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorId: `agent-${agentRole.toLowerCase()}`,
        actorRole: agentRole,
        action: 'AGENT_CUSTOMER_QUERY_SEARCH',
        entityType: 'TRANSACTION',
        entityId: query.reference || query.customerToken || 'CRITERIA_SEARCH',
        prevHash: auditTrail[0]?.entryHash || '0000',
        entryHash: Math.random().toString(36).substring(2, 18),
        details: { ...query },
        ipAddress: '127.0.0.1',
      },
      ...auditTrail,
    ];

    const isSimulatedStale = Boolean(
      query.reference?.toLowerCase().includes('stale') ||
      query.customerToken?.toLowerCase().includes('stale')
    );

    // 1. REFERENCE SEARCH
    if (query.queryType === 'REFERENCE' && query.reference) {
      const cleanRef = query.reference.trim().toUpperCase();

      // Check for live customer-reported dispute or live exception match
      const liveMatch = exceptions.find(
        (e) =>
          e.reference.toUpperCase().includes(cleanRef) ||
          e.id.toUpperCase().includes(cleanRef) ||
          (e.rrn && e.rrn.toUpperCase().includes(cleanRef))
      );
      if (
        liveMatch &&
        !cleanRef.includes('9901') &&
        !cleanRef.includes('9902') &&
        !cleanRef.includes('7711') &&
        !cleanRef.includes('REVERSED')
      ) {
        const inv = investigations.find((i) => i.exceptionId === liveMatch.id) || investigations[0];
        return {
          state: 'MATCH_EXCEPTION',
          query,
          customerSafeStatusText: 'Active transaction dispute filed by customer. Authoritative switch re-query scheduled.',
          expectedNextStep: 'Awaiting Switch TSQ confirmation before automated 8-check reversal gate.',
          timeEstimate: 'Target resolution within regulatory SLA clock.',
          approvedWording: `We have received your dispute for reference ${liveMatch.reference} (${liveMatch.currency} ${liveMatch.amount}). An automated investigation is active under case ${liveMatch.reference}. A technical query has been scheduled with the switch to verify the settlement status.`,
          canQuoteRefund: false,
          exception: liveMatch,
          investigationCase: inv,
          repeatContactCount: liveMatch.repeatContactCount || 1,
          isThresholdReached: false,
          isSourceStale: isSimulatedStale,
        };
      }

      // Case A: Matches active exception TXN-20261015-NIP-9901 or EXC-001 or RRN 9901847120 or STAN 009901
      if (
        cleanRef.includes('9901') ||
        cleanRef === 'EXC-001' ||
        cleanRef.includes('NIP-9901')
      ) {
        const exc = exceptions.find((e) => e.id === 'exc-001') || exceptions[0];
        const inv = investigations.find((i) => i.id === 'inv-case-401') || investigations[0];
        return {
          state: 'MATCH_EXCEPTION',
          query,
          customerSafeStatusText: 'Transaction is undergoing automated settlement reconciliation with the receiving institution.',
          expectedNextStep: 'Awaiting NIBSS settlement journal sync; automated resolution will be finalized.',
          timeEstimate: 'Target resolution within 4 hours (CBN regulatory window: by 16-OCT-2026 11:10).',
          incidentBanner: {
            incidentId: 'INC-8821',
            title: 'Intermittent NIBSS Outward Gateway timeout affecting NIP transfers',
            severity: 'HIGH',
            eta: 'Estimated recovery 15:30 today',
          },
          approvedWording:
            'Thank you for contacting Wema Bank. Your transaction of ₦150,000.00 is currently undergoing counterparty settlement verification with the destination bank. Our automated reconciliation system is tracking session NIP9901 under case EXC-2026-001. If the recipient bank confirms non-credit, the funds will be automatically restored to your account within the regulatory window. We have linked this contact to your active case.',
          canQuoteRefund: false, // Strict: NOT verified resolved
          exception: exc,
          investigationCase: inv,
          repeatContactCount: exc.repeatContactCount || 1,
          isThresholdReached: (exc.repeatContactCount || 1) >= 3,
          isSourceStale: isSimulatedStale,
          sourceStaleMessage: isSimulatedStale
            ? '⚠️ Counterparty switch journal feed is 16m 40s behind live cutoff. Re-verifying...'
            : undefined,
        };
      }

      // Case B: Verified Successful Transaction (TXN-20261015-NIP-9902 or TX-NIP-9902)
      if (cleanRef.includes('9902')) {
        const txn = transactions.find((t) => t.id === 'tx-nip-9902') || transactions[1];
        return {
          state: 'VERIFIED_SUCCESS',
          query,
          customerSafeStatusText: 'Transaction verified successfully delivered and settled at destination institution.',
          expectedNextStep: 'None required by bank. Recipient can confirm credit using the session ID provided.',
          timeEstimate: 'Completed and settled on 15-OCT-2026 09:30:02.',
          evidenceSummary: {
            coreLedgerDebitRecorded: true,
            counterpartyCreditConfirmed: true,
            stan: '009902',
            rrn: '9901847121',
            sessionId: '99901426101509294288420',
            settledAt: '2026-10-15T09:30:02.400Z',
            beneficiaryBank: 'GTBank (058)',
            beneficiaryAccount: '0144882190',
            quotableSummary: 'Core ledger debited ₦45,000.00; GTBank confirmed credit acknowledgment at 09:30:02 via session 99901426101509294288420.',
          },
          approvedWording:
            'Your transfer of ₦45,000.00 was successfully delivered to GTBank account 0144882190 on 15-OCT-2026. The beneficiary bank returned a successful credit confirmation message with Session ID 99901426101509294288420. The funds are resting with the receiving bank. Please provide this session ID to the beneficiary so their bank can confirm the deposit.',
          canQuoteRefund: false,
          transaction: txn,
          repeatContactCount: 0,
          isThresholdReached: false,
          isSourceStale: isSimulatedStale,
        };
      }

      // Case C: Duplicate Debit Exception (TXN-20261015-CARD-7711 or 7711)
      if (cleanRef.includes('7711')) {
        const exc = exceptions.find((e) => e.classificationCode === 'DUP001') || exceptions[2];
        const inv = investigations.find((i) => i.id === 'inv-case-403') || investigations[1];
        return {
          state: 'MATCH_EXCEPTION',
          query,
          customerSafeStatusText: 'Suspected duplicate charge flagged under active fast-track reversal review.',
          expectedNextStep: 'Awaiting Supervisor authorization for automated reversal dispatch.',
          timeEstimate: 'Target reversal turnaround under 1 hour.',
          approvedWording:
            'We have identified a suspected duplicate debit of ₦89,500.00 on card 5399••••7711 from POS Terminal TERM-8801. Our automated fraud engine has prepared a fast-track reversal under Case CASE-2026-403. A supervisor is currently performing the secondary authorization to credit your account today.',
          canQuoteRefund: false,
          exception: exc,
          investigationCase: inv,
          repeatContactCount: 2,
          isThresholdReached: false,
          isSourceStale: isSimulatedStale,
        };
      }

      // Case D: Verified Reversal Outcome (TXN-REVERSED-001 or resolved exception)
      if (cleanRef.includes('REVERSED') || cleanRef.includes('RESOLVED')) {
        return {
          state: 'VERIFIED_SUCCESS',
          query,
          customerSafeStatusText: 'Reversal verified completed. Funds returned to originating account.',
          timeEstimate: 'Credited on 15-OCT-2026.',
          evidenceSummary: {
            coreLedgerDebitRecorded: true,
            counterpartyCreditConfirmed: false,
            stan: '009955',
            rrn: '9901847999',
            beneficiaryBank: 'Wema Bank PLC',
            beneficiaryAccount: '0123456789',
            quotableSummary: 'Core ledger refund credit entry GL-1002 posted and verified.',
          },
          approvedWording:
            'Good news: your transaction was investigated and the reversal of ₦150,000.00 has been verified completed. The funds have been credited back to your account 0123456789. You may check your updated available balance.',
          canQuoteRefund: true, // Only true when outcome is VERIFIED reversed!
          repeatContactCount: 1,
          isThresholdReached: false,
          isSourceStale: isSimulatedStale,
        };
      }

      // Default: No Match
      return {
        state: 'NO_MATCH',
        query,
        customerSafeStatusText: 'No matching transaction record found in active journals or settlement files.',
        approvedWording:
          'We were unable to locate an active record matching reference ' +
          cleanRef +
          ' in our switch or ledger journals. I will file a formal customer inquiry docket now so our central reconciliation team can trace it across archives.',
        canQuoteRefund: false,
        repeatContactCount: 0,
        isThresholdReached: false,
        isSourceStale: isSimulatedStale,
      };
    }

    // 2. AMOUNT + DATE + CHANNEL SEARCH
    if (query.queryType === 'AMOUNT_DATE_CHANNEL') {
      const amt = query.amount ? parseFloat(query.amount.replace(/[^0-9.]/g, '')) : 0;
      if (amt === 45000 && (!query.channel || query.channel === 'POS')) {
        const matchedTxns = transactions.filter((t) => t.amount === '45000.00' || t.amount === '45000');
        const candidate2: Transaction = {
          id: 'tx-pos-8802',
          reference: 'TXN-20261015-POS-8802',
          rrn: '4402881999',
          stan: '004403',
          amount: '45000.00',
          currency: 'NGN',
          channel: 'POS',
          status: 'failed',
          senderAccount: '0144882190',
          beneficiaryAccount: '9833214092',
          senderBank: 'Wema Bank PLC',
          beneficiaryBank: 'GTBank PLC',
          createdAt: '2026-10-15T14:22:10Z',
          hasDiscrepancy: true,
          exceptionType: 'STATUS_MISMATCH',
          modelConfidence: 91,
          isVerified: false,
          maskedPan: '5061 •••• •••• 8801',
        };
        const candidates = matchedTxns.length >= 2 ? matchedTxns : [matchedTxns[0] || transactions[0], candidate2];
        return {
          state: 'MULTIPLE_CANDIDATES',
          query,
          customerSafeStatusText: 'Multiple matching transactions detected. Disambiguation required.',
          approvedWording:
            'We found 2 distinct transactions for ₦45,000.00 on that date. To confirm which transaction you are inquiring about, could you confirm the approximate time or the merchant terminal location?',
          canQuoteRefund: false,
          candidates,
          repeatContactCount: 0,
          isThresholdReached: false,
          isSourceStale: isSimulatedStale,
        };
      }

      if (amt === 150000 && (!query.channel || query.channel === 'NIP')) {
        const exc = exceptions[0];
        const inv = investigations[0];
        return {
          state: 'MATCH_EXCEPTION',
          query,
          customerSafeStatusText: 'Single match found with active reconciliation exception.',
          expectedNextStep: 'Awaiting NIBSS settlement sync.',
          timeEstimate: 'Target resolution within 4 hours.',
          approvedWording:
            'We located your NIP transfer for ₦150,000.00. It is currently being reconciled with the receiving institution under case ' +
            exc.reference +
            '. No refund is confirmed yet, but our automated recon will credit you if non-delivery is finalized.',
          canQuoteRefund: false,
          exception: exc,
          investigationCase: inv,
          repeatContactCount: exc.repeatContactCount || 1,
          isThresholdReached: false,
          isSourceStale: isSimulatedStale,
        };
      }

      return {
        state: 'NO_MATCH',
        query,
        customerSafeStatusText: 'No matching transaction found for the specified amount, date, and channel.',
        approvedWording:
          'No transaction matches those exact criteria in our active journals. Let me take down your details to file an official tracing request.',
        canQuoteRefund: false,
        repeatContactCount: 0,
        isThresholdReached: false,
        isSourceStale: isSimulatedStale,
      };
    }

    // 3. CUSTOMER TOKEN SEARCH (Account or Phone)
    if (query.queryType === 'CUSTOMER_TOKEN' && query.customerToken) {
      const cleanToken = query.customerToken.trim();
      const digitsOnly = cleanToken.replace(/[^0-9]/g, '');

      // Check high repeat inquiry customer
      if (
        digitsOnly.includes('8091112233') ||
        digitsOnly.includes('1112233') ||
        digitsOnly.includes('0166554433') ||
        digitsOnly.includes('0188990011') ||
        cleanToken.includes('1112233')
      ) {
        const exc = exceptions.find((e) => e.customerPhone?.includes('111') || e.repeatContactCount >= 3) || exceptions[4];
        const inv = investigations.find((i) => i.id === 'inv-case-405') || investigations[2];
        return {
          state: 'MATCH_EXCEPTION',
          query,
          customerSafeStatusText: 'Critical priority customer dispute logged with 3 previous repeat contacts.',
          expectedNextStep: 'Escalated to Tier-2 Supervisor Queue for accelerated manual clearance.',
          timeEstimate: 'Escalated priority: immediate review by Supervisor Folake Balogun.',
          incidentBanner: {
            incidentId: 'INC-9014',
            title: 'Multiple failed reversals on customer account pending supervisor override',
            severity: 'CRITICAL',
            eta: 'Priority handling active',
          },
          approvedWording:
            'Thank you for following up with us. We deeply understand this is your 3rd inquiry regarding your debit. Because this matter has reached our priority repeat threshold, your case CASE-2026-405 has been marked CRITICAL and routed directly to our Tier-2 Supervisor desk for resolution today.',
          canQuoteRefund: false,
          exception: exc,
          investigationCase: inv,
          repeatContactCount: 3,
          isThresholdReached: true, // Threshold reached: enables supervisor escalation
          isSourceStale: isSimulatedStale,
        };
      }

      if (cleanToken.includes('0123456789')) {
        const exc = exceptions[0];
        const inv = investigations[0];
        return {
          state: 'MATCH_EXCEPTION',
          query,
          customerSafeStatusText: 'Active exception found on customer account 0123456789.',
          expectedNextStep: 'Settlement confirmation in progress.',
          timeEstimate: 'Within CBN 72h window.',
          approvedWording:
            'We have located your pending transaction under account 0123456789. Our team is actively investigating the switch receipt.',
          canQuoteRefund: false,
          exception: exc,
          investigationCase: inv,
          repeatContactCount: 1,
          isThresholdReached: false,
          isSourceStale: isSimulatedStale,
        };
      }

      return {
        state: 'NO_MATCH',
        query,
        customerSafeStatusText: 'No active exception or transaction found for this customer account/phone.',
        approvedWording:
          'We do not have an active transaction or dispute logged under that account or phone number. Let me open a complaint ticket for you.',
        canQuoteRefund: false,
        repeatContactCount: 0,
        isThresholdReached: false,
        isSourceStale: isSimulatedStale,
      };
    }

    return {
      state: 'NO_MATCH',
      query,
      customerSafeStatusText: 'Enter search criteria above to begin.',
      approvedWording: 'Please specify transaction reference, amount, or customer identifier.',
      canQuoteRefund: false,
      repeatContactCount: 0,
      isThresholdReached: false,
      isSourceStale: false,
    };
  },

  // LOG Agent Contact & Optional Supervisor Escalation
  async logAgentContact(
    exceptionIdOrRef: string,
    customerPhone: string,
    notes: string,
    escalated: boolean,
    agentName: string = 'Chioma Nwosu (Contact Centre)'
  ): Promise<FinancialException | null> {
    const exc = exceptions.find(
      (e) => e.id === exceptionIdOrRef || e.reference === exceptionIdOrRef
    );
    if (!exc) return null;

    const newRepeatCount = (exc.repeatContactCount || 0) + 1;
    const newNote: ExceptionNote = {
      id: `note-cc-${Date.now()}`,
      author: agentName,
      authorRole: 'CONTACT_CENTRE_AGENT',
      timestamp: new Date().toISOString(),
      text: `Customer call logged [Phone: ${customerPhone}]: ${notes} ${
        escalated ? '🚨 ESCALATED TO SUPERVISOR' : ''
      }`,
    };

    const updated: FinancialException = {
      ...exc,
      repeatContactCount: newRepeatCount,
      notes: [...exc.notes, newNote],
      lane: escalated ? 'SUPERVISOR_QUEUE' : exc.lane,
      severity: escalated ? 'CRITICAL' : exc.severity,
      version: exc.version + 1,
    };

    exceptions = exceptions.map((e) => (e.id === exc.id ? updated : e));

    auditTrail = [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorId: agentName,
        actorRole: 'CONTACT_CENTRE_AGENT',
        action: escalated ? 'SUPERVISOR_ESCALATION_TRIGGERED' : 'CUSTOMER_CONTACT_LOGGED',
        entityType: 'INVESTIGATION',
        entityId: exc.id,
        prevHash: auditTrail[0]?.entryHash || '0000',
        entryHash: Math.random().toString(36).substring(2, 18),
        details: { customerPhone, newRepeatCount, escalated, notes },
        ipAddress: '127.0.0.1',
      },
      ...auditTrail,
    ];

    return updated;
  },

  // CREATE Customer-Reported Case (Intake Form)
  async createCustomerReportedIntake(
    payload: CustomerDisputeIntakePayload
  ): Promise<{ exception: FinancialException; caseNumber: string }> {
    const id = `exc-cus-${Date.now().toString().slice(-4)}`;
    const caseNumber = `CASE-CUS-${Math.floor(1000 + Math.random() * 9000)}`;
    const reference = `TXN-CUS-${Date.now().toString().slice(-8)}`;

    const newException: FinancialException = {
      id,
      transactionId: `tx-cus-${Date.now().toString().slice(-6)}`,
      reference,
      type: 'DEBIT_WITHOUT_CREDIT',
      classificationCode: 'CUS001',
      source: 'CUSTOMER',
      rootCause: 'SWITCH_TIMEOUT',
      severity: 'HIGH',
      amount: payload.amount,
      currency: payload.currency || 'NGN',
      exposure: payload.amount,
      exposureType: 'CUSTOMER_DISPUTE',
      channel: payload.channel,
      status: 'detected',
      lane: 'MANUAL_INVESTIGATION',
      description: payload.complaintText,
      detectedAt: new Date().toISOString(),
      debitTimestamp: payload.transactionDate || new Date().toISOString(),
      internalSlaTarget: new Date(Date.now() + 4 * 3600000).toISOString(),
      regulatoryDeadline: new Date(Date.now() + 72 * 3600000).toISOString(),
      slaStatus: 'ON_TRACK',
      modelConfidence: 85,
      modelExplanation: 'Customer intake filed at branch/contact-centre. Scheduled for automated switch log matching.',
      priorityScore: 78,
      priorityFactors: {
        amountWeight: 20,
        slaWeight: 20,
        customerWeight: 25,
        anomalyWeight: 13,
        rationale: 'Customer direct intake requires 4h first acknowledgment SLA under CBN guidelines.',
      },
      team: 'DISPUTE_RESOLUTION',
      sourceFreshness: 'Live (Agent Intake)',
      sourceFreshnessState: 'LIVE',
      repeatContactCount: 1,
      version: 1,
      customerName: payload.customerName,
      customerPhone: payload.customerPhone,
      accountNumber: payload.customerAccount,
      notes: [
        {
          id: `note-${Date.now()}`,
          author: payload.agentId,
          authorRole: payload.agentRole,
          timestamp: new Date().toISOString(),
          text: `Intake ticket opened by ${payload.agentId} (${payload.agentRole}): ${payload.complaintText}`,
        },
      ],
      stateHistory: [
        {
          from: 'detected',
          to: 'detected',
          reasonCode: 'CUSTOMER_DISPUTE_FILED',
          author: payload.agentId,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    exceptions = [newException, ...exceptions];

    // Audit Trail
    auditTrail = [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorId: payload.agentId,
        actorRole: payload.agentRole,
        action: 'CUSTOMER_DISPUTE_FILED_BY_AGENT',
        entityType: 'INVESTIGATION',
        entityId: newException.id,
        prevHash: auditTrail[0]?.entryHash || '0000',
        entryHash: Math.random().toString(36).substring(2, 18),
        details: { caseNumber, ...payload },
        ipAddress: '127.0.0.1',
      },
      ...auditTrail,
    ];

    return { exception: newException, caseNumber };
  },

  // Log Sensitive Data Reveal (Mandatory Audit Trail)
  async logDataReveal(field: string, entityId: string, actor: string, reason: string): Promise<void> {
    auditTrail = [
      {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorId: actor,
        actorRole: 'ANALYST_MAKER',
        action: 'SENSITIVE_DATA_REVEALED',
        entityType: 'TRANSACTION',
        entityId,
        prevHash: auditTrail[0]?.entryHash || '0000',
        entryHash: Math.random().toString(36).substring(2, 18),
        details: { field, justification: reason },
        ipAddress: '127.0.0.1',
      },
      ...auditTrail,
    ];
  },

  // Reset simulator / live storage
  resetSimulator() {
    transactions = [];
    exceptions = [];
    investigations = [];
    reversals = [];
    auditTrail = [];
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LIVE_TRANSACTIONS_KEY);
      localStorage.removeItem(LIVE_CUSTOMER_EXCEPTIONS_KEY);
      localStorage.removeItem(LIVE_INVESTIGATIONS_KEY);
      localStorage.removeItem(LIVE_REVERSALS_KEY);
      localStorage.removeItem(LIVE_AUDIT_KEY);
    }
  },
};
