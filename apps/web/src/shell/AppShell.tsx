import React, { useState, useEffect } from 'react';
import {
  Search,
  Bell,
  Sun,
  Moon,
  User,
  Sliders,
  ChevronRight,
  Clock,
  BookOpen,
  LogOut,
  ChevronDown,
  ArrowLeftRight,
  Shield,
} from 'lucide-react';
import clsx from 'clsx';
import { useApp } from '../context/AppContext';
import { GlobalSearchModal } from './GlobalSearchModal';
import { SessionTimeoutModal } from './SessionTimeoutModal';
import { ToastContainer } from '../components/Toast';
import type { Role } from '../types/domain';
import { apiClient, type ServiceTierStatus } from '../services/apiClient';

export interface PrimaryNavItem {
  id: string;
  label: string;
  roles: string[];
  badge?: string;
  isSpecial?: boolean;
}

export interface GovernanceNavItem {
  id: string;
  label: string;
  desc: string;
}

export const primaryNavItems: PrimaryNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', roles: ['ANALYST_MAKER', 'SUPERVISOR_CHECKER', 'AUDITOR', 'ADMIN'] },
  { id: 'exceptions', label: 'Exceptions & Triage', roles: ['ANALYST_MAKER', 'SUPERVISOR_CHECKER', 'AUDITOR', 'ADMIN'], badge: '4' },
  { id: 'reversals', label: 'Maker-Checker Reversals', roles: ['ANALYST_MAKER', 'SUPERVISOR_CHECKER', 'ADMIN'], badge: '2' },
  { id: 'reconciliation', label: 'Reconciliation', roles: ['ANALYST_MAKER', 'SUPERVISOR_CHECKER', 'AUDITOR', 'ADMIN'] },
  { id: 'transactions', label: 'Transactions', roles: ['ANALYST_MAKER', 'SUPERVISOR_CHECKER', 'AUDITOR', 'ADMIN'] },
];

export const governanceNavItems: GovernanceNavItem[] = [
  { id: 'investigations', label: 'Investigations & AI Copilot', desc: 'Case telemetry and explainable assistant' },
  { id: 'agent-intake', label: 'Branch / Agent Intake', desc: 'Internal complaint registration' },
  { id: 'audit', label: 'Immutable Audit Trail', desc: 'Tamper-evident hash chain & logs' },
  { id: 'rules-health', label: 'Rules & Integration Health', desc: 'Core switch telemetry and policy thresholds' },
  { id: 'executive-reports', label: 'Executive Reports & Heatmap', desc: 'CBN compliance SLAs and volume heatmaps' },
  { id: 'model-drift', label: 'ML Drift & Shadow Matrix', desc: 'Model telemetry and shadow scoring' },
];

export interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const {
    theme,
    setTheme,
    density,
    setDensity,
    role,
    setRole,
    environment,
    setEnvironment,
    activeView,
    setActiveView,
    setGlobalSearchOpen,
    setSessionTimeoutOpen,
    addToast,
    currentUser,
    logoutStaff,
    setPortalMode,
  } = useApp();

  const [alertsOpen, setAlertsOpen] = useState(false);
  const [govDropdownOpen, setGovDropdownOpen] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceTierStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const checkServices = async () => {
      try {
        const statuses = await apiClient.getServiceStatuses();
        if (mounted) setServiceStatus(statuses);
      } catch {
        // silent
      }
    };

    checkServices();
    const interval = setInterval(checkServices, 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const allowedPrimaryItems = primaryNavItems.filter((item) => item.roles.includes(role));

  const roleLabels: Record<Role, string> = {
    ANALYST_MAKER: 'Analyst Maker',
    SUPERVISOR_CHECKER: 'Supervisor Checker',
    AUDITOR: 'Auditor (Read-Only)',
    ADMIN: 'Platform Admin',
    CONTACT_CENTRE_AGENT: 'Contact Centre Agent (Tier 1)',
    BRANCH_AGENT: 'Branch Operations Agent',
  };

  const allNavItems = [
    ...primaryNavItems,
    ...governanceNavItems.map((g) => ({ ...g, roles: ['ANALYST_MAKER', 'SUPERVISOR_CHECKER', 'AUDITOR', 'ADMIN'] })),
    { id: 'storybook', label: 'Design System & Storybook', roles: [] },
  ];

  const getBreadcrumb = () => {
    const item = allNavItems.find((i) => i.id === activeView);
    return item ? item.label : 'Operations Console';
  };

  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text-primary)] flex flex-col selection:bg-[var(--primary-subtle)] selection:text-[var(--primary)]">
      {/* 1. Global Environment Banner (Sandbox vs Production + 3-Tier Indicators) */}
      <div
        className={clsx(
          'w-full px-4 py-1 text-[11px] font-semibold flex items-center justify-between border-b select-none transition-colors',
          environment === 'SIMULATED_SANDBOX'
            ? 'bg-amber-100/90 text-amber-950 border-amber-300'
            : 'bg-emerald-100/90 text-emerald-950 border-emerald-300'
        )}
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-ping bg-amber-600" />
          <span>
            {environment === 'SIMULATED_SANDBOX'
              ? 'SIMULATED SANDBOX — Core Banking & Switch Adapters Operating in Emulated Mode (sample_settlement_nip.csv)'
              : 'PRODUCTION ENVIRONMENT — Live Settlement Grid Active'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* 3-Tier Status Indicators */}
          <div className="flex items-center gap-2 font-mono-financial text-[10px]">
            {/* Go Backend Status */}
            <span
              className={clsx(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border',
                serviceStatus?.backend.isLive
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-900 border-amber-300'
              )}
              title={serviceStatus?.backend.isLive ? `Backend connected (port 8080, latency ${serviceStatus.backend.latencyMs}ms)` : 'Backend running in Dual-Mode simulation'}
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full', serviceStatus?.backend.isLive ? 'bg-emerald-600' : 'bg-amber-600')} />
              <span>API: {serviceStatus?.backend.isLive ? 'Live :8080' : 'Simulated'}</span>
            </span>

            {/* FastAPI AI Service Status */}
            <span
              className={clsx(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border',
                serviceStatus?.aiService.isLive
                  ? 'bg-purple-50 text-purple-800 border-purple-300'
                  : 'bg-sky-50 text-sky-900 border-sky-300'
              )}
              title={serviceStatus?.aiService.isLive ? `AI Service connected (port 8000, latency ${serviceStatus.aiService.latencyMs}ms)` : 'AI running in Dual-Mode client fallback'}
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full', serviceStatus?.aiService.isLive ? 'bg-purple-600' : 'bg-sky-600')} />
              <span>AI: {serviceStatus?.aiService.isLive ? 'Live :8000' : 'Client Dual-Mode'}</span>
            </span>
          </div>

          <span className="opacity-40">|</span>
          <button
            type="button"
            onClick={() =>
              setEnvironment(environment === 'SIMULATED_SANDBOX' ? 'PRODUCTION' : 'SIMULATED_SANDBOX')
            }
            className="hover:underline cursor-pointer font-mono-financial"
          >
            Switch to {environment === 'SIMULATED_SANDBOX' ? 'Production' : 'Sandbox'}
          </button>
          <span className="opacity-40">|</span>
          <button
            type="button"
            onClick={() => setSessionTimeoutOpen(true)}
            className="hover:underline cursor-pointer flex items-center gap-1 font-mono-financial"
          >
            <Clock className="w-3 h-3" />
            <span>Simulate Timeout</span>
          </button>
        </div>
      </div>

      {/* 2. Top Header Bar (Clean, bright, NOT dark navy or black) */}
      <header className="sticky top-0 z-30 bg-[var(--surface)] border-b border-[var(--surface-border)] shadow-xs">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          {/* Logo & Platform Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="SMARTREVERSAL Emblem" className="w-8 h-8 object-contain" />
              <div>
                <div className="font-bold text-[15px] tracking-tight text-[var(--text-primary)] flex items-center gap-1.5">
                  <span>SMARTREVERSAL</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[var(--canvas-subdued)] border border-[var(--surface-border)] font-mono-financial font-medium text-[var(--text-muted)]">
                    v0.2.0
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-muted)] tracking-tight">
                  Financial Operations & Reversal Console
                </div>
              </div>
            </div>
          </div>

          {/* Center: Global Transaction Search Input with Ctrl+K shortcut */}
          <div className="flex-1 max-w-md hidden md:block">
            <button
              type="button"
              onClick={() => setGlobalSearchOpen(true)}
              className="w-full flex items-center justify-between px-3 py-1.5 bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded text-[13px] text-[var(--text-muted)] hover:border-[var(--text-muted)] transition-colors cursor-pointer"
              aria-label="Open global transaction search (Shortcut Ctrl+K)"
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
                <span>Search transactions, RRNs, STANs, cases...</span>
              </div>
              <kbd className="px-1.5 py-0.5 text-[10px] bg-[var(--surface)] border border-[var(--surface-border)] rounded font-mono-financial text-[var(--text-secondary)]">
                Ctrl K
              </kbd>
            </button>
          </div>

          {/* Right Controls: Staff Profile, Role Switcher, Density, Theme, Portal Switcher, Logout */}
          <div className="flex items-center gap-2 text-[12px]">
            {/* Logged-in Staff Profile */}
            <div className="hidden sm:flex items-center gap-2 bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded px-2.5 py-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-[var(--text-primary)] leading-tight">
                  {currentUser?.name || (role === 'SUPERVISOR_CHECKER' ? 'Chioma Eze' : 'Ade Bello')}
                </span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono-financial leading-tight">
                  {roleLabels[role]}
                </span>
              </div>
            </div>

            {/* Persona Switcher (Demo Convenience) */}
            <div className="flex items-center gap-1.5 bg-[var(--canvas-subdued)] border border-[var(--surface-border)] rounded px-2 py-1">
              <User className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
              <label htmlFor="role-select" className="sr-only">
                Role Persona
              </label>
              <select
                id="role-select"
                value={role}
                onChange={(e) => {
                  const newRole = e.target.value as Role;
                  setRole(newRole);
                  addToast({
                    type: 'info',
                    title: 'Persona Switched',
                    message: `Switched operational role to ${roleLabels[newRole]}`,
                  });
                }}
                className="bg-transparent text-[var(--text-primary)] font-medium focus:outline-none cursor-pointer text-xs"
              >
                <option value="ANALYST_MAKER">Maker: Analyst</option>
                <option value="SUPERVISOR_CHECKER">Checker: Supervisor</option>
                <option value="AUDITOR">Auditor (Read-Only)</option>
                <option value="ADMIN">Admin: Systems</option>
              </select>
            </div>

            {/* Switch to Customer Portal Button */}
            <button
              type="button"
              onClick={() => setPortalMode('customer')}
              className="p-1.5 px-2 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--canvas-subdued)] border border-[var(--surface-border)] cursor-pointer flex items-center gap-1 text-xs font-medium"
              title="Switch to Customer Dispute Portal"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--primary)]" />
              <span className="hidden lg:inline">Customer Portal</span>
            </button>

            {/* Density Toggle (Comfortable vs Compact) */}
            <button
              type="button"
              onClick={() => setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--canvas-subdued)] border border-[var(--surface-border)] cursor-pointer"
              title={`Switch density mode (currently ${density})`}
              aria-label="Toggle Table Density"
            >
              <Sliders className="w-4 h-4" aria-hidden="true" />
            </button>

            {/* Theme Toggle (Daylight vs Soft Dim) */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'daylight' ? 'soft-dim' : 'daylight')}
              className="p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--canvas-subdued)] border border-[var(--surface-border)] cursor-pointer"
              title={`Switch theme (currently ${theme})`}
              aria-label="Toggle Theme Mode"
            >
              {theme === 'daylight' ? (
                <Moon className="w-4 h-4 text-slate-700" aria-hidden="true" />
              ) : (
                <Sun className="w-4 h-4 text-amber-400" aria-hidden="true" />
              )}
            </button>

            {/* Action Items Bell Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAlertsOpen((prev) => !prev)}
                className="relative p-1.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--canvas-subdued)] border border-[var(--surface-border)] cursor-pointer"
                aria-label="Alerts and Action Items (2 pending)"
              >
                <Bell className="w-4 h-4" aria-hidden="true" />
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-600 rounded-full ring-2 ring-[var(--surface)]" />
              </button>

              {alertsOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--surface)] border border-[var(--surface-border)] rounded-md shadow-xl p-3 z-40 space-y-2">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[var(--surface-border)] font-semibold text-[13px]">
                    <span>Pending Action Items</span>
                    <span className="text-[11px] font-mono-financial bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded">
                      2 Urgent
                    </span>
                  </div>
                  <div
                    onClick={() => {
                      setActiveView('reversals');
                      setAlertsOpen(false);
                    }}
                    className="p-2 rounded hover:bg-[var(--canvas-subdued)] cursor-pointer space-y-0.5 text-[12px]"
                  >
                    <div className="font-semibold text-[var(--text-primary)] flex items-center justify-between">
                      <span>Maker-Checker Signoff</span>
                      <span className="text-amber-700 font-mono-financial">₦150k</span>
                    </div>
                    <p className="text-[var(--text-muted)]">NIP-9901 requires supervisor authorization.</p>
                  </div>
                  <div
                    onClick={() => {
                      setActiveView('exceptions');
                      setAlertsOpen(false);
                    }}
                    className="p-2 rounded hover:bg-[var(--canvas-subdued)] cursor-pointer space-y-0.5 text-[12px]"
                  >
                    <div className="font-semibold text-[var(--text-primary)] flex items-center justify-between">
                      <span>POS Timeout Discrepancy</span>
                      <span className="text-rose-700 font-mono-financial">Code 91</span>
                    </div>
                    <p className="text-[var(--text-muted)]">Terminal TERM-8801 debit without dispense.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Logout Button */}
            <button
              type="button"
              onClick={() => {
                logoutStaff();
                addToast({
                  type: 'info',
                  title: 'Logged Out',
                  message: 'Staff session terminated.',
                });
              }}
              className="p-1.5 px-2 rounded text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 cursor-pointer flex items-center gap-1 text-xs font-semibold"
              title="Log Out of Operations Console"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* 3. Primary Navigation Bar (5 Core Workflows + Governance Dropdown) */}
        <nav
          className="bg-[var(--surface)] border-t border-[var(--surface-border-subtle)] overflow-x-auto"
          aria-label="Primary Application Navigation"
        >
          <div className="max-w-7xl mx-auto px-4 flex items-center gap-1">
            {/* Primary Core Operational Items */}
            {allowedPrimaryItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  className={clsx(
                    'px-3.5 py-2.5 text-[13px] font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap',
                    isActive
                      ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                      : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--surface-border)]'
                  )}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={clsx(
                        'text-[10px] font-mono-financial px-1.5 py-0.2 rounded-full',
                        isActive
                          ? 'bg-[var(--primary)] text-white'
                          : 'bg-[var(--canvas-subdued)] text-[var(--text-muted)]'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Governance & Intelligence Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setGovDropdownOpen((prev) => !prev)}
                className={clsx(
                  'px-3.5 py-2.5 text-[13px] font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap',
                  governanceNavItems.some((g) => g.id === activeView)
                    ? 'border-[var(--primary)] text-[var(--primary)] font-semibold'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--surface-border)]'
                )}
              >
                <Shield className="w-3.5 h-3.5 text-[var(--primary)]" />
                <span>Governance & Intelligence</span>
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </button>

              {govDropdownOpen && (
                <div
                  className="absolute left-0 top-full mt-1 w-72 bg-[var(--surface)] border border-[var(--surface-border)] rounded-md shadow-xl p-2 z-50 space-y-1"
                  onMouseLeave={() => setGovDropdownOpen(false)}
                >
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--surface-border)] mb-1">
                    Compliance & System Intelligence
                  </div>
                  {governanceNavItems.map((item) => {
                    const isItemActive = activeView === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveView(item.id);
                          setGovDropdownOpen(false);
                        }}
                        className={clsx(
                          'w-full text-left p-2 rounded text-xs transition-colors cursor-pointer flex flex-col',
                          isItemActive
                            ? 'bg-[var(--primary-subtle)] text-[var(--primary)] font-bold'
                            : 'hover:bg-[var(--canvas-subdued)] text-[var(--text-primary)]'
                        )}
                      >
                        <span>{item.label}</span>
                        <span className="text-[10px] text-[var(--text-muted)] font-normal">
                          {item.desc}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right-aligned Storybook / Design System discreet trigger */}
            <div className="ml-auto flex items-center">
              <button
                type="button"
                onClick={() => setActiveView('storybook')}
                className={clsx(
                  'px-2.5 py-1 text-[11px] font-mono-financial rounded border transition-colors cursor-pointer flex items-center gap-1',
                  activeView === 'storybook'
                    ? 'bg-purple-100 dark:bg-purple-950 text-purple-900 dark:text-purple-200 border-purple-300 font-bold'
                    : 'text-[var(--text-muted)] border-transparent hover:border-[var(--surface-border)] hover:bg-[var(--canvas-subdued)]'
                )}
                title="Open Design System & Storybook"
              >
                <BookOpen className="w-3 h-3 text-purple-600" />
                <span>Storybook & Specs</span>
              </button>
            </div>
          </div>
        </nav>
      </header>

      {/* 4. Breadcrumb Bar */}
      <div className="bg-[var(--canvas-subdued)] border-b border-[var(--surface-border-subtle)] text-[12px] py-1.5 px-4 select-none">
        <div className="max-w-7xl mx-auto flex items-center gap-1.5 text-[var(--text-muted)]">
          <span>SMARTREVERSAL</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span>Banking Operations</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <strong className="text-[var(--text-primary)] font-medium">{getBreadcrumb()}</strong>
          <span className="ml-auto font-mono-financial text-[11px]">
            Mode: {theme === 'daylight' ? 'Daylight (Section 9)' : 'Soft Dim'} • Density: {density}
          </span>
        </div>
      </div>

      {/* 5. Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6" role="main">
        {children}
      </main>

      {/* Modals & Portals */}
      <GlobalSearchModal />
      <SessionTimeoutModal />
      <ToastContainer />
    </div>
  );
};
