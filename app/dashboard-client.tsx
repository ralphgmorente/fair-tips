"use client";

import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Calculator,
  CalendarDays,
  ChartPie,
  ChevronDown,
  CheckCircle2,
  CircleDollarSign,
  CircleHelp,
  Clock,
  CreditCard,
  Download,
  Lightbulb,
  LockKeyhole,
  PackageSearch,
  ReceiptText,
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Truck,
  type LucideIcon,
  Upload,
  UserRound,
  Users,
  WalletCards
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { publishPayouts, type PublishState } from "@/app/actions/publish-payouts";
import { loadHistory, type HistoryPeriod } from "@/app/actions/load-history";
import {
  emptySettings,
  loadWorkspaceSettings,
  saveWorkspaceSettings,
  type WorkspaceSettings
} from "@/app/actions/workspace-settings";
import { readSpreadsheetFile } from "@/lib/spreadsheet-file";
import {
  calculateFlexibleReports,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  roundMoney,
  type CalculationResult,
  type Grid,
  type ValidationIssue
} from "@/lib/tip-calculator";

type AppView = "dashboard" | "tips" | "history" | "settings";

type MeterHealth = {
  label: string;
  meterPercent: number;
  /** Where the configured target sits on the bar, or null when no target is set. */
  markerPercent: number | null;
  tone: string;
};

/** Targets are drawn two thirds along the bar, leaving room to show an overrun. */
const METER_TARGET_MARKER_PERCENT = 66.6667;

type UploadState = {
  fileName: string;
  rows: Grid | null;
  error: string;
  status: "idle" | "reading" | "ready" | "error";
  /** sha256 of the file's bytes, used to recognise a report that was already saved. */
  contentHash: string;
};

const emptyUpload: UploadState = {
  fileName: "",
  rows: null,
  error: "",
  status: "idle",
  contentHash: ""
};

/** Fingerprints a file so a re-upload of the same export can be spotted. */
async function hashFile(file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    // Without a hash the app simply falls back to matching on dates.
    return "";
  }
}

/** What the history records about a file: never its contents. */
type UploadSummary = {
  kind: "orders" | "payments" | "timesheet";
  fileName: string;
  rowCount: number;
  contentHash: string;
};

export type SessionUser = {
  email: string;
  fullName: string;
  role: string;
};

export function DashboardClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [settings, setSettings] = useState<WorkspaceSettings>(emptySettings);
  const [activeView, setActiveView] = useState<AppView>("dashboard");
  const [ordersUpload, setOrdersUpload] = useState<UploadState>(emptyUpload);
  const [paymentsUpload, setPaymentsUpload] = useState<UploadState>(emptyUpload);
  const [timesheetUpload, setTimesheetUpload] = useState<UploadState>(emptyUpload);
  const [result, setResult] = useState<CalculationResult | null>(null);

  const hasBusinessReport =
    ordersUpload.status === "ready" || paymentsUpload.status === "ready";
  const uploadsReading =
    ordersUpload.status === "reading" ||
    paymentsUpload.status === "reading" ||
    timesheetUpload.status === "reading";
  const canCalculate = hasBusinessReport && !uploadsReading;
  const hasErrors = result?.issues.some((issue) => issue.severity === "error") ?? false;
  const blockingUploadError = Boolean(
    ordersUpload.error || paymentsUpload.error || timesheetUpload.error
  );
  const showReportSetup = !result || hasErrors;
  const uploads: UploadSummary[] = (
    [
      ["orders", ordersUpload],
      ["payments", paymentsUpload],
      ["timesheet", timesheetUpload]
    ] as const
  )
    .filter(([, upload]) => upload.status === "ready")
    .map(([kind, upload]) => ({
      kind,
      fileName: upload.fileName,
      rowCount: upload.rows?.length ?? 0,
      contentHash: upload.contentHash
    }));
  const pageTitle =
    activeView === "dashboard"
      ? result
        ? "Business Dashboard"
        : "Set up this pay period"
      : activeView === "tips"
        ? "Weekly Tip Distribution"
        : activeView === "history"
          ? "Saved periods"
          : "Settings";

  useEffect(() => {
    let active = true;
    loadWorkspaceSettings().then((next) => {
      if (active) {
        setSettings(next);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    setIsSigningOut(true);
    // Clear any uploaded report data from memory before leaving the session.
    handleReset();

    const supabase = createClient();
    // Revokes the refresh token server-side and clears the auth cookies.
    await supabase.auth.signOut();

    router.replace("/login");
    router.refresh();
  }

  async function handleUpload(
    kind: "orders" | "payments" | "timesheet",
    file: File | null
  ) {
    if (!file) {
      return;
    }

    const setUpload =
      kind === "orders"
        ? setOrdersUpload
        : kind === "payments"
          ? setPaymentsUpload
          : setTimesheetUpload;
    setResult(null);
    setUpload({
      fileName: file.name,
      rows: null,
      error: "",
      status: "reading",
      contentHash: ""
    });

    try {
      const [rows, contentHash] = await Promise.all([readSpreadsheetFile(file), hashFile(file)]);
      setUpload({
        fileName: file.name,
        rows,
        error: rows.length === 0 ? "No rows found in the first sheet." : "",
        status: rows.length === 0 ? "error" : "ready",
        contentHash
      });
    } catch {
      setUpload({
        fileName: file.name,
        rows: null,
        error: "This file could not be read.",
        status: "error",
        contentHash: ""
      });
    }
  }

  function handleCalculate() {
    if (!ordersUpload.rows && !paymentsUpload.rows) {
      return;
    }

    setResult(
      calculateFlexibleReports({
        ordersGrid: ordersUpload.rows,
        paymentsGrid: paymentsUpload.rows,
        timesheetGrid: timesheetUpload.rows,
        ignoredSalesNames: settings.ignoredSalesNames,
        eventDeviceName: settings.eventDeviceName
      })
    );
  }

  function handleReset() {
    setOrdersUpload(emptyUpload);
    setPaymentsUpload(emptyUpload);
    setTimesheetUpload(emptyUpload);
    setResult(null);
  }

  async function handleExport() {
    if (!result || hasErrors || !result.capabilities.hasTipDistribution) {
      return;
    }

    const { exportTipWorkbook } = await import("@/lib/export-results");
    exportTipWorkbook(result);
  }

  return (
    <div className="app-frame">
      <AppSidebar
        activeView={activeView}
        hasResult={Boolean(result)}
        onViewChange={setActiveView}
      />
      <main className="dashboard-main">
        <DashboardHeader
          title={pageTitle}
          result={result}
          hasErrors={hasErrors}
          user={user}
          isSigningOut={isSigningOut}
          showReportSetup={showReportSetup}
          onSignOut={handleSignOut}
          onNewReport={handleReset}
          onExport={handleExport}
        />

        {/* Each tab owns its content. Previously the upload panel replaced whichever view
            was selected, so Dashboard, Tips and Settings all showed the same screen
            before a calculation and the tabs looked broken. */}
        {activeView === "settings" ? (
          <SettingsView settings={settings} onSettingsChange={setSettings} />
        ) : activeView === "history" ? (
          <HistoryView />
        ) : activeView === "tips" && !result ? (
          <EmptyView
            title="No tips calculated yet"
            message="Upload a sales report and a timesheet on the Dashboard, then calculate."
            actionLabel="Go to Dashboard"
            onAction={() => setActiveView("dashboard")}
          />
        ) : showReportSetup ? (
          <>
            <ReportSetupPanel
              ordersUpload={ordersUpload}
              paymentsUpload={paymentsUpload}
              timesheetUpload={timesheetUpload}
              hasBusinessReport={hasBusinessReport}
              canCalculate={canCalculate}
              blockingUploadError={blockingUploadError}
              result={result}
              onOrdersUpload={(file) => handleUpload("orders", file)}
              onPaymentsUpload={(file) => handleUpload("payments", file)}
              onTimesheetUpload={(file) => handleUpload("timesheet", file)}
              onCalculate={handleCalculate}
              onReset={handleReset}
            />
            {result && hasErrors ? <ValidationPanel issues={result.issues} /> : null}
          </>
        ) : (
          <>
            {/* Warnings were only ever rendered alongside blocking errors, so a run that
                succeeded hid them entirely — including shifts whose clock times could not
                be read, whose owners silently earn nothing. Collapsed, but present. */}
            {result.issues.length ? <ValidationPanel issues={result.issues} /> : null}
            {activeView === "dashboard" ? (
              <DashboardView result={result} />
            ) : (
              <TipsView result={result} uploads={uploads} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AppSidebar({
  activeView,
  hasResult,
  onViewChange
}: {
  activeView: AppView;
  hasResult: boolean;
  onViewChange: (view: AppView) => void;
}) {
  const navItems: Array<{ id: AppView; label: string; icon: LucideIcon }> = [
    { id: "dashboard", label: "Dashboard", icon: ChartPie },
    { id: "tips", label: "Tips", icon: WalletCards },
    { id: "history", label: "History", icon: CalendarDays },
    { id: "settings", label: "Settings", icon: Settings }
  ];

  return (
    <aside className="app-sidebar" aria-label="Application navigation">
      <div className="brand-lockup">
        <span className="brand-mark">SF</span>
        <span>
          <strong>ShiftFlow</strong>
          <small>Operations</small>
        </span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={activeView === item.id ? "active" : ""}
              type="button"
              key={item.id}
              onClick={() => onViewChange(item.id)}
            >
              <Icon aria-hidden="true" size={19} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {hasResult ? (
        <div className="sidebar-support">
          <CircleHelp aria-hidden="true" size={18} />
          <strong>Before you pay out</strong>
          <span>Check the warnings and any unallocated tips, then export.</span>
        </div>
      ) : null}
    </aside>
  );
}

function DashboardHeader({
  title,
  result,
  hasErrors,
  user,
  isSigningOut,
  showReportSetup,
  onSignOut,
  onNewReport,
  onExport
}: {
  title: string;
  result: CalculationResult | null;
  hasErrors: boolean;
  user: SessionUser;
  isSigningOut: boolean;
  showReportSetup: boolean;
  onSignOut: () => void;
  onNewReport: () => void;
  onExport: () => void;
}) {
  return (
    <section className="dashboard-header">
      <div className="dashboard-title">
        <div className="title-row">
          <h1>{title}</h1>
          {result && !hasErrors ? <span className="review-pill ready">Ready to review</span> : null}
        </div>
        {/* Before a calculation there is no period and nothing to export, so neither is
            shown. Repeating "Setup required" beside a screen that already says it in
            four other places was most of why this felt busy. */}
        {result ? (
          <div className="period-control" aria-label="Pay period">
            <CalendarDays aria-hidden="true" size={17} />
            <span>{formatDateRange(result)}</span>
          </div>
        ) : null}
      </div>

      <div className="dashboard-actions">
        <span className="session-identity" title={user.email}>
          <UserRound aria-hidden="true" size={16} />
          <span>{user.fullName || user.email}</span>
        </span>
        {showReportSetup ? null : (
          <button className="secondary-button compact" type="button" onClick={onNewReport}>
            <RotateCcw aria-hidden="true" size={17} />
            New report
          </button>
        )}
        <button
          className="secondary-button compact"
          type="button"
          onClick={onSignOut}
          disabled={isSigningOut}
        >
          <LockKeyhole aria-hidden="true" size={17} />
          {isSigningOut ? "Signing out..." : "Sign out"}
        </button>
        {result && !hasErrors && result.capabilities.hasTipDistribution ? (
          <button className="primary-button compact" type="button" onClick={onExport}>
            <Download aria-hidden="true" size={18} />
            Export Excel
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DashboardView({ result }: { result: CalculationResult }) {
  const hourlySales = useMemo(() => buildHourlySales(result), [result]);
  const dailySales = useMemo(() => buildDailySales(result), [result]);
  const topSellingItems = useMemo(() => buildTopSellingItems(result), [result]);
  const orderTypeMix = useMemo(() => buildOrderTypeMix(result), [result]);
  const tipRate = useMemo(() => buildTipRate(result), [result]);
  const averageTicket = useMemo(() => buildAverageTicket(result), [result]);
  const businessInsights = useMemo(
    () =>
      buildBusinessInsights({
        result,
        averageTicket,
        hourlySales,
        dailySales,
        topSellingItems
      }),
    [averageTicket, dailySales, hourlySales, result, topSellingItems]
  );

  return (
    <div className="view-stack">
      <DashboardTopLayout result={result} />
      <div className="analytics-grid">
        <SalesByHourCard hourlySales={hourlySales} />
        <DailySalesTrendCard dailySales={dailySales} />
      </div>
      <BusinessSnapshot result={result} averageTicket={averageTicket} hourlySales={hourlySales} />
      <div className="business-dashboard-grid">
        {topSellingItems.length ? (
          <TopSellingItemsCard items={topSellingItems} />
        ) : (
          <OrderTypeCard slices={orderTypeMix} tipRate={tipRate} />
        )}
        <BusinessInsightsCard insights={businessInsights} />
      </div>
      <BusinessHealthCard result={result} averageTicket={averageTicket} />
    </div>
  );
}

function TipsView({
  result,
  uploads
}: {
  result: CalculationResult;
  uploads: UploadSummary[];
}) {
  if (!result.capabilities.hasTimesheet) {
    return (
      <div className="view-stack">
        <FeatureUnavailablePanel
          icon={Users}
          title="Timesheet required"
          message="Upload a Clover Timesheet with an Orders or Payments report to calculate employee hours, labor, and tip distribution."
        />
      </div>
    );
  }

  if (!result.capabilities.hasTipDistribution) {
    return (
      <div className="view-stack">
        <FeatureUnavailablePanel
          icon={Users}
          title="Valid shifts required"
          message="The Timesheet was uploaded, but no valid clock-in and clock-out shifts are available for tip distribution."
        />
      </div>
    );
  }

  return (
    <div className="view-stack">
      <TipSummaryStrip result={result} />
      <EdgeCasePanel result={result} />
      <EmployeeTable result={result} uploads={uploads} />
      <UnallocatedOrders result={result} />
    </div>
  );
}

function FeatureUnavailablePanel({
  icon: Icon,
  title,
  message
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <section className="panel-card feature-unavailable-panel">
      <span className="breakdown-icon">
        <Icon aria-hidden="true" size={20} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{message}</small>
      </span>
    </section>
  );
}

/**
 * Till accounts that are not people, so the app stops reporting them as someone missing
 * from the timesheet. A bought-out owner's login left on a terminal is the usual case.
 */

/** Shown when a view has nothing to display yet, instead of borrowing another view. */
function EmptyView({
  title,
  message,
  actionLabel,
  onAction
}: {
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <section className="panel-card empty-view">
      <strong>{title}</strong>
      <span>{message}</span>
      <button className="secondary-button compact" type="button" onClick={onAction}>
        {actionLabel}
      </button>
    </section>
  );
}

/**
 * Saved periods. Deliberately plain: a list you can open, with the payout table and the
 * files it came from. Everything expensive already happened when the period was saved.
 */
function HistoryView() {
  const [periods, setPeriods] = useState<HistoryPeriod[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadHistory().then((rows) => {
      if (active) {
        setPeriods(rows);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (periods === null) {
    return (
      <section className="panel-card empty-view">
        <strong>Loading saved periods…</strong>
      </section>
    );
  }

  if (periods.length === 0) {
    return (
      <section className="panel-card empty-view">
        <strong>Nothing saved yet</strong>
        <span>
          Calculate a period and press &ldquo;Publish to staff&rdquo; to keep it here.
        </span>
      </section>
    );
  }

  return (
    <div className="view-stack">
      {periods.map((period) => {
        const isOpen = openId === period.id;
        const sortedPayouts = [...period.payouts].sort(
          (a, b) => Number(b.total_tips) - Number(a.total_tips)
        );

        return (
          <section className="panel-card history-period" key={period.id}>
            <button
              className="history-head"
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : period.id)}
            >
              <span className="history-title">
                <strong>{period.label}</strong>
                <small>
                  Saved {new Date(period.published_at).toLocaleDateString()} ·{" "}
                  {period.payouts.length}{" "}
                  {period.payouts.length === 1 ? "person" : "people"}
                </small>
              </span>
              <span className="history-figure">
                {formatCurrency(Number(period.allocated_tips))}
                <ChevronDown
                  aria-hidden="true"
                  size={18}
                  className={isOpen ? "history-chevron open" : "history-chevron"}
                />
              </span>
            </button>

            {isOpen ? (
              <div className="history-body">
                <div className="table-scroll">
                  <table className="summary-table">
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th className="numeric">Hours</th>
                        <th className="numeric">Tips</th>
                        <th className="numeric">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedPayouts.map((payout) => (
                        <tr key={payout.employee_name}>
                          <td data-label="Employee">{payout.employee_name}</td>
                          <td data-label="Hours" className="numeric">
                            {formatNumber(Number(payout.paid_hours))}
                          </td>
                          <td data-label="Tips" className="numeric payout">
                            {formatCurrency(Number(payout.total_tips))}
                          </td>
                          <td data-label="Share" className="numeric">
                            {formatPercent(Number(payout.share_percent))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {period.report_uploads.length ? (
                  <p className="history-sources">
                    Built from{" "}
                    {period.report_uploads
                      .map((upload) => `${upload.file_name} (${upload.row_count} rows)`)
                      .join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Nominates the terminal used at offsite events.
 *
 * Off by default. Events are meant to be marked by a CLOVERGO order number, but current
 * Clover exports leave that column blank on every row, so an event is otherwise invisible
 * and its tips fall into the store pool. Naming the machine restores the split — but it
 * moves real money between people, so it is the manager's decision, not a guess.
 */
/**
 * Settings that decide how tips are split, saved for the whole business.
 *
 * These lived in localStorage at first, which meant two managers could feed in the same
 * files and get different payouts — the event terminal alone moves about $66 between
 * people. They belong to the business, not to a browser.
 */
function WorkspaceSettingsForm({
  settings,
  onSettingsChange
}: {
  settings: WorkspaceSettings;
  onSettingsChange: (next: WorkspaceSettings) => void;
}) {
  const [device, setDevice] = useState(settings.eventDeviceName);
  const [names, setNames] = useState(settings.ignoredSalesNames.join(", "));
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ message: "", ok: true });

  useEffect(() => {
    setDevice(settings.eventDeviceName);
    setNames(settings.ignoredSalesNames.join(", "));
  }, [settings]);

  async function handleSave() {
    setSaving(true);
    setFeedback({ message: "", ok: true });

    const next: WorkspaceSettings = {
      eventDeviceName: device.trim(),
      ignoredSalesNames: names
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
    };

    const result = await saveWorkspaceSettings(next);
    if (result.ok) {
      onSettingsChange(next);
    }
    setSaving(false);
    setFeedback({ message: result.message, ok: result.ok });
  }

  return (
    <>
      <div>
        <strong>Event terminal</strong>
        <span>
          The machine taken to offsite events, exactly as it appears in the Device column
          of a Payments export. Sales on it become event sales, and their tips go to staff
          on an Evento shift. Leave blank to rely on the CLOVERGO order number instead.
        </span>
        <div className="ignored-names-row">
          <input
            type="text"
            value={device}
            placeholder="Clover Flex"
            onChange={(event) => setDevice(event.target.value)}
            aria-label="Event terminal"
          />
        </div>
      </div>

      <div>
        <strong>Till accounts to ignore</strong>
        <span>
          Names that appear on sales but are not staff — an old owner&rsquo;s login still
          on a terminal, for example. Separate with commas.
        </span>
        <div className="ignored-names-row">
          <input
            type="text"
            value={names}
            placeholder="HENRY RODRIGUES"
            onChange={(event) => setNames(event.target.value)}
            aria-label="Till accounts to ignore"
          />
          <button
            className="secondary-button compact"
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        {feedback.message ? (
          <span className={feedback.ok ? "publish-ok" : "publish-error"}>
            {feedback.message}
          </span>
        ) : (
          <span className="settings-hint">
            Saved for everyone, and applied on the next calculation.
          </span>
        )}
      </div>
    </>
  );
}

function SettingsView({
  settings,
  onSettingsChange
}: {
  settings: WorkspaceSettings;
  onSettingsChange: (next: WorkspaceSettings) => void;
}) {
  return (
    <section className="panel-card settings-panel">
      <div className="panel-heading">
        <h2>Settings</h2>
        <span>Current workspace</span>
      </div>
      <div className="settings-list">
        <div>
          <strong>Exports</strong>
          <span>Excel payout files use the latest validated calculation.</span>
        </div>
        <div>
          <strong>Access</strong>
          <span>
            Each manager signs in with their own account. Accounts are created by an
            administrator; there is no self-signup.
          </span>
        </div>
        <WorkspaceSettingsForm settings={settings} onSettingsChange={onSettingsChange} />
      </div>
    </section>
  );
}

function ExecutiveMetrics({ result }: { result: CalculationResult }) {
  const taxTotal = result.salesOrders.reduce((total, order) => total + order.taxes, 0);
  const discountTotal = result.salesOrders.reduce((total, order) => total + order.discounts, 0);
  const refundTotal = result.salesOrders.reduce((total, order) => total + order.refunds, 0);
  const grossSalesExcludingTax = result.salesOrders.reduce(
    (total, order) => total + order.grossSales - order.taxes,
    0
  );
  const laborValue = result.capabilities.hasLaborCost
    ? formatPercent(result.metrics.laborPercent)
    : result.capabilities.hasTimesheet
      ? "Wage data required"
      : "Timesheet required";
  const laborDetail = result.capabilities.hasLaborCost
    ? `${formatCurrency(result.metrics.totalLaborCost)} labor cost`
    : result.capabilities.hasTimesheet
      ? "Add wage rate or estimated wages"
      : "Upload Timesheet for labor";
  const kpis: Array<{
    label: string;
    value: string;
    detail: string;
    icon: LucideIcon;
    featured?: boolean;
    warning?: boolean;
    secondaryRows?: Array<{ label: string; value: string; unavailable?: boolean }>;
  }> = [
    {
      label: "Gross Sales",
      value: result.capabilities.hasGrossSalesExcludingTax
        ? formatCurrency(grossSalesExcludingTax)
        : "Data unavailable",
      detail: "Sales excluding sales tax",
      icon: CircleDollarSign,
      warning: !result.capabilities.hasGrossSalesExcludingTax,
      secondaryRows: [
        {
          label: "Tax",
          value: result.capabilities.hasTaxData ? formatCurrency(taxTotal) : "Data unavailable",
          unavailable: !result.capabilities.hasTaxData
        },
        {
          label: "Discounts",
          value: result.capabilities.hasDiscountData
            ? formatCurrency(discountTotal)
            : "Data unavailable",
          unavailable: !result.capabilities.hasDiscountData
        },
        {
          label: "Refunds",
          value: result.capabilities.hasRefundData
            ? formatCurrency(refundTotal)
            : "Data unavailable",
          unavailable: !result.capabilities.hasRefundData
        }
      ]
    },
    {
      label: "Net Sales",
      value: formatCurrency(result.metrics.netSales),
      detail: "Restaurant revenue",
      icon: CircleDollarSign
    },
    {
      label: "Labor",
      value: laborValue,
      detail: laborDetail,
      icon: Users,
      warning: !result.capabilities.hasLaborCost
    }
  ];

  return (
    <section className="executive-grid" aria-label="Executive summary">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div
            className={[
              "executive-card",
              kpi.featured ? "featured" : "",
              kpi.warning ? "warning" : "",
              kpi.secondaryRows ? "has-secondary" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            key={kpi.label}
          >
            <span className="executive-icon">
              <Icon aria-hidden="true" size={22} />
            </span>
            <span className="executive-label">{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small>{kpi.detail}</small>
            {kpi.secondaryRows ? (
              <div className="executive-secondary-grid">
                {kpi.secondaryRows.map((row) => (
                  <span className={row.unavailable ? "unavailable" : ""} key={row.label}>
                    <small>{row.label}</small>
                    <strong>{row.value}</strong>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function DashboardTopLayout({ result }: { result: CalculationResult }) {
  return (
    <section className="dashboard-top-layout" aria-label="Primary business analytics">
      <div className="dashboard-top-main">
        <ExecutiveMetrics result={result} />
        <SalesMixCard result={result} />
      </div>
      <SalesSummaryArea result={result} />
    </section>
  );
}

function SalesSummaryArea({ result }: { result: CalculationResult }) {
  if (!result.capabilities.hasPaymentBreakdown) {
    return (
      <section className="panel-card sales-summary-card insight-unavailable-card">
        <AnalyticsEmptyState
          icon={CreditCard}
          title="Sales summary unavailable"
          message="Upload a Clover report with tender, payment note, or order type fields to classify payment and delivery channels."
        />
      </section>
    );
  }

  return <SalesSummaryPanel result={result} />;
}

function SalesMixCard({ result }: { result: CalculationResult }) {
  const deliveryTotal =
    result.metrics.grubhubSales + result.metrics.doorDashSales + result.metrics.uberEatsSales;
  const cashGiftTotal = result.metrics.cashSales + result.metrics.giftCardSales;
  const knownTotal = deliveryTotal + result.metrics.creditDebitSales + cashGiftTotal;
  const otherTotal = roundMoney(Math.max(0, result.metrics.netSales - knownTotal));
  const total = Math.max(1, result.metrics.netSales || knownTotal);
  const mixRows = [
    { label: "Credit & Debit", value: result.metrics.creditDebitSales, tone: "cards" },
    { label: "Cash", value: result.metrics.cashSales, tone: "cash" },
    { label: "Gift Cards", value: result.metrics.giftCardSales, tone: "gift" },
    { label: "DoorDash", value: result.metrics.doorDashSales, tone: "doordash" },
    { label: "Uber Eats", value: result.metrics.uberEatsSales, tone: "uber" },
    { label: "Grubhub", value: result.metrics.grubhubSales, tone: "grubhub" },
    ...(otherTotal > 0 ? [{ label: "Other sales", value: otherTotal, tone: "other" }] : [])
  ].sort((a, b) => b.value - a.value);

  return (
    <section className="panel-card sales-mix-card">
      <div className="panel-heading">
        <h2>Sales mix</h2>
        <span>{formatCurrency(result.metrics.netSales)} net sales</span>
      </div>
      {!result.capabilities.hasPaymentBreakdown ? (
        <AnalyticsEmptyState
          icon={ChartPie}
          title="Sales mix unavailable"
          message="Tender or delivery fields are required for this breakdown."
        />
      ) : (
        <div className="sales-mix-body">
          <div className="mix-list">
            {mixRows.map((row) => (
              <MixRow
                key={row.label}
                label={row.label}
                value={row.value}
                total={total}
                tone={row.tone}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function MixRow({
  label,
  value,
  total,
  tone
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const percent = safeRatio(value, total);
  const formattedValue = formatCurrency(value);
  const formattedPercent = formatPercent(percent);
  const barStyle = {
    "--mix-bar-width": `${Math.max(percent * 100, value > 0 ? 2 : 0)}%`
  } as CSSProperties;

  return (
    <div className="mix-row" aria-label={`${label}: ${formattedValue}, ${formattedPercent}`}>
      <span className="mix-label">
        <i data-tone={tone} />
        <span>{label}</span>
      </span>
      <span className="mix-track" aria-hidden="true">
        <span className="mix-fill" data-tone={tone} style={barStyle} />
      </span>
      <span className="mix-values">
        <strong>{formattedValue}</strong>
        <small>{formattedPercent}</small>
      </span>
    </div>
  );
}

function SalesSummaryPanel({ result }: { result: CalculationResult }) {
  const deliveryTotal =
    result.metrics.grubhubSales + result.metrics.doorDashSales + result.metrics.uberEatsSales;
  const cashGiftTotal = result.metrics.cashSales + result.metrics.giftCardSales;
  const sections: Array<{
    title: string;
    total: number;
    icon: LucideIcon;
    rows: Array<[string, number]>;
    footer: string;
  }> = [
    {
      title: "Delivery Platforms",
      total: deliveryTotal,
      icon: Truck,
      rows: [
        ["Uber Eats", result.metrics.uberEatsSales],
        ["DoorDash", result.metrics.doorDashSales],
        ["Grubhub", result.metrics.grubhubSales]
      ],
      footer: `${formatPercent(safeRatio(deliveryTotal, result.metrics.netSales))} of net sales`
    },
    {
      title: "Credit & Debit",
      total: result.metrics.creditDebitSales,
      icon: CreditCard,
      rows: [],
      footer: `${formatPercent(
        safeRatio(result.metrics.creditDebitSales, result.metrics.netSales)
      )} of net sales`
    },
    {
      title: "Cash & Gift Cards",
      total: cashGiftTotal,
      icon: Banknote,
      rows: [
        ["Cash", result.metrics.cashSales],
        ["Gift Cards", result.metrics.giftCardSales]
      ],
      footer: `${formatPercent(safeRatio(cashGiftTotal, result.metrics.netSales))} of net sales`
    }
  ];

  return (
    <section className="panel-card sales-summary-card" aria-label="Sales summary">
      <div className="panel-heading sales-summary-heading">
        <div>
          <h2>Sales Summary</h2>
          <span>Payment channels</span>
        </div>
      </div>
      <div className="sales-summary-list">
        {sections.map((section) => {
          const Icon = section.icon;

          return (
            <article className="sales-summary-section" key={section.title}>
              <div className="sales-summary-title">
                <span className="sales-summary-icon">
                  <Icon aria-hidden="true" size={17} />
                </span>
                <span className="sales-summary-title-line">
                  <strong>{section.title}</strong>
                  <em>{formatCurrency(section.total)}</em>
                </span>
              </div>
              {section.rows.length > 0 ? (
                <div className="sales-summary-rows">
                  {section.rows.map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{formatCurrency(value)}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
              <footer>{section.footer}</footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type HourlySales = {
  hour: number;
  label: string;
  netSales: number;
  transactions: number;
  percentOfPeak: number;
  isPeak: boolean;
};

type DailySales = {
  dayIndex: number;
  label: string;
  fullLabel: string;
  netSales: number;
  transactions: number;
  percentOfPeak: number;
  isStrongest: boolean;
  isWeakest: boolean;
};

type HourlyLinePoint = HourlySales & {
  x: number;
  y: number;
};

const LINE_CHART_WIDTH = 640;
const LINE_CHART_HEIGHT = 214;
const LINE_CHART_TOP = 20;
const LINE_CHART_RIGHT = 22;
const LINE_CHART_BOTTOM_SPACE = 36;
const LINE_CHART_LEFT = 48;
const LINE_CHART_RIGHT_EDGE = LINE_CHART_WIDTH - LINE_CHART_RIGHT;
const LINE_CHART_BOTTOM = LINE_CHART_HEIGHT - LINE_CHART_BOTTOM_SPACE;
const LINE_CHART_PLOT_WIDTH = LINE_CHART_RIGHT_EDGE - LINE_CHART_LEFT;
const LINE_CHART_PLOT_HEIGHT = LINE_CHART_BOTTOM - LINE_CHART_TOP;

type TopSellingItem = {
  name: string;
  quantity: number;
  totalSales: number;
  percentOfPeak: number;
};

type AverageTicketMetric = {
  available: boolean;
  value: number;
  transactions: number;
};

type BusinessInsight = {
  title: string;
  detail: string;
};

function BusinessSnapshot({
  result,
  averageTicket,
  hourlySales
}: {
  result: CalculationResult;
  averageTicket: AverageTicketMetric;
  hourlySales: HourlySales[];
}) {
  const peakHour = getPeakHour(hourlySales);
  const countLabel = result.reports.salesSource === "orders" ? "Order Count" : "Transaction Count";
  const countDetail =
    result.reports.salesSource === "orders"
      ? "Orders source of truth"
      : result.reports.salesSource === "payments"
        ? "Payments source of truth"
        : "Upload Orders or Payments";
  const cards = [
    {
      label: countLabel,
      value: result.capabilities.hasSalesData
        ? formatNumber(result.salesOrders.length, 0)
        : "Data unavailable",
      detail: countDetail,
      icon: CircleDollarSign,
      unavailable: !result.capabilities.hasSalesData
    },
    {
      label: "Average Ticket",
      value: averageTicket.available ? formatCurrency(averageTicket.value) : "Data unavailable",
      detail: averageTicket.available
        ? `${formatTransactionCount(averageTicket.transactions)} used`
        : "Upload Clover transactions",
      icon: ReceiptText,
      unavailable: !averageTicket.available
    },
    {
      label: "Peak Hour",
      value: peakHour ? formatHourRange(peakHour.hour) : "Data unavailable",
      detail: peakHour
        ? `${formatCurrency(peakHour.netSales)} from ${formatTransactionCount(peakHour.transactions)}`
        : "Needs order times",
      icon: Clock,
      unavailable: !peakHour
    }
  ];

  return (
    <section className="business-snapshot-grid" aria-label="Business snapshot">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <div
            className={card.unavailable ? "snapshot-card unavailable" : "snapshot-card"}
            key={card.label}
          >
            <span className="snapshot-icon">
              <Icon aria-hidden="true" size={20} />
            </span>
            <span>
              <small>{card.label}</small>
              <strong>{card.value}</strong>
              <em>{card.detail}</em>
            </span>
          </div>
        );
      })}
    </section>
  );
}

function SalesByHourCard({ hourlySales }: { hourlySales: HourlySales[] }) {
  const totalHourlySales = hourlySales.reduce((total, hour) => total + hour.netSales, 0);
  const peakHour = getPeakHour(hourlySales);
  const lineChart = buildHourlyLineChart(hourlySales);
  const tickStep = Math.max(1, Math.ceil(hourlySales.length / 7));

  return (
    <section className="panel-card sales-hour-card" aria-label="Sales by hour">
      <div className="panel-heading">
        <div>
          <h2>Sales by Hour</h2>
          <span>
            {peakHour
              ? `Peak ${peakHour.label} at ${formatCurrency(peakHour.netSales)}`
              : "Hourly net sales from Clover transactions"}
          </span>
        </div>
        <span>{formatCurrency(totalHourlySales)} net sales</span>
      </div>

      {hourlySales.length === 0 ? (
        <AnalyticsEmptyState
          icon={BarChart3}
          title="Hourly data unavailable"
          message="Upload and calculate a Clover report with transaction times to see this chart."
        />
      ) : (
        <div className="sales-line-chart">
          <svg
            aria-label="Hourly net sales line chart"
            role="img"
            viewBox={`0 0 ${LINE_CHART_WIDTH} ${LINE_CHART_HEIGHT}`}
          >
            <defs>
              <linearGradient id="salesHourAreaGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2f9f79" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#2f9f79" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <line
              className="line-axis"
              x1={LINE_CHART_LEFT}
              x2={LINE_CHART_RIGHT_EDGE}
              y1={LINE_CHART_BOTTOM}
              y2={LINE_CHART_BOTTOM}
            />
            <line
              className="line-grid"
              x1={LINE_CHART_LEFT}
              x2={LINE_CHART_RIGHT_EDGE}
              y1={LINE_CHART_TOP}
              y2={LINE_CHART_TOP}
            />
            <text className="line-y-label" x={LINE_CHART_LEFT - 8} y={LINE_CHART_TOP + 5}>
              {formatCompactCurrency(lineChart.maxSales)}
            </text>
            <text className="line-y-label" x={LINE_CHART_LEFT - 8} y={LINE_CHART_BOTTOM + 4}>
              $0
            </text>
            {lineChart.areaPath ? <path className="line-area" d={lineChart.areaPath} /> : null}
            <path className="line-path" d={lineChart.linePath} />
            {lineChart.points.map((point, index) => {
              const tooltip = `${point.label}\nNet Sales: ${formatCurrency(point.netSales)}\nTransactions: ${formatNumber(point.transactions, 0)}`;

              return (
                <g
                  aria-label={`${point.label}, ${formatCurrency(point.netSales)} net sales, ${formatNumber(point.transactions, 0)} transactions`}
                  className={point.isPeak ? "line-point peak" : "line-point"}
                  key={point.hour}
                  tabIndex={0}
                >
                  <title>{tooltip}</title>
                  {point.isPeak ? <circle className="line-point-halo" cx={point.x} cy={point.y} r="10" /> : null}
                  <circle cx={point.x} cy={point.y} r={point.isPeak ? "5" : "4"} />
                  {point.isPeak ? (
                    <text className="line-peak-label" x={point.x} y={point.y - 14}>
                      Peak
                    </text>
                  ) : null}
                </g>
              );
            })}
            {lineChart.points.map((point, index) =>
              hourlySales.length <= 7 ||
              index === 0 ||
              index === lineChart.points.length - 1 ||
              point.isPeak ||
              index % tickStep === 0 ? (
                <text className="line-x-label" key={`tick-${point.hour}`} x={point.x} y={LINE_CHART_HEIGHT - 8}>
                  {point.label}
                </text>
              ) : null
            )}
          </svg>
        </div>
      )}
    </section>
  );
}

function DailySalesTrendCard({ dailySales }: { dailySales: DailySales[] }) {
  const strongestDay = dailySales.find((day) => day.isStrongest);
  const weakestDay = dailySales.find((day) => day.isWeakest);
  const dailySalesByIndex = new Map(dailySales.map((day) => [day.dayIndex, day]));
  const chartDays = WEEKDAY_ORDER.map(
    (dayIndex) =>
      dailySalesByIndex.get(dayIndex) ?? {
        dayIndex,
        label: WEEKDAY_LABELS[dayIndex],
        fullLabel: WEEKDAY_NAMES[dayIndex],
        netSales: 0,
        transactions: 0,
        percentOfPeak: 0,
        isStrongest: false,
        isWeakest: false
      }
  );

  return (
    <section className="panel-card daily-sales-card" aria-label="Daily sales trend">
      <div className="panel-heading">
        <div>
          <h2>Daily Sales Trend</h2>
          <span>
            {strongestDay
              ? `Strongest ${strongestDay.fullLabel} at ${formatCurrency(strongestDay.netSales)}`
              : "Weekday net sales from Clover transactions"}
          </span>
        </div>
        {weakestDay ? <span>Lowest {weakestDay.fullLabel}</span> : null}
      </div>

      {dailySales.length === 0 ? (
        <AnalyticsEmptyState
          icon={TrendingUp}
          title="Daily data unavailable"
          message="The Clover report needs usable order dates before daily sales can be shown."
        />
      ) : (
        <div className="daily-column-chart" role="list">
          {chartDays.map((day) => {
            const rowStyle = {
              "--column-height": `${Math.max(day.percentOfPeak, day.netSales > 0 ? 6 : 0)}%`
            } as CSSProperties;
            const className = [
              "day-column",
              day.isStrongest ? "strongest" : "",
              day.isWeakest ? "weakest" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                className={className}
                key={day.dayIndex}
                role="listitem"
                tabIndex={0}
                style={rowStyle}
                title={`${day.fullLabel}\nNet Sales: ${formatCurrency(day.netSales)}\nTransactions: ${formatNumber(day.transactions, 0)}`}
                aria-label={`${day.fullLabel}, ${formatCurrency(day.netSales)} net sales, ${formatNumber(day.transactions, 0)} transactions`}
              >
                <span className="day-tooltip">
                  <strong>{day.fullLabel}</strong>
                  <span>{formatCurrency(day.netSales)} net sales</span>
                  <span>{formatTransactionCount(day.transactions)}</span>
                </span>
                <span className="day-column-track" aria-hidden="true">
                  <i />
                </span>
                <strong>{day.label}</strong>
                {day.isStrongest ? <em>Best</em> : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function BusinessHealthCard({
  result,
  averageTicket
}: {
  result: CalculationResult;
  averageTicket: AverageTicketMetric;
}) {
  const [laborTargetInput, setLaborTargetInput] = useState("30");
  const [ticketTargetInput, setTicketTargetInput] = useState("");

  useEffect(() => {
    const savedLaborTarget = localStorage.getItem("shiftFlowLaborTargetPercent");
    const savedTicketTarget = localStorage.getItem("shiftFlowAverageTicketTarget");

    if (savedLaborTarget !== null) {
      setLaborTargetInput(savedLaborTarget);
    }

    if (savedTicketTarget !== null) {
      setTicketTargetInput(savedTicketTarget);
    }
  }, []);

  function handleLaborTargetChange(value: string) {
    setLaborTargetInput(value);
    updateLocalTarget("shiftFlowLaborTargetPercent", value);
  }

  function handleTicketTargetChange(value: string) {
    setTicketTargetInput(value);
    updateLocalTarget("shiftFlowAverageTicketTarget", value);
  }

  const laborTarget = parsePositiveTarget(laborTargetInput);
  const ticketTarget = parsePositiveTarget(ticketTargetInput);
  const laborHealth = getLaborHealth(result, laborTarget);
  const ticketHealth = getAverageTicketHealth(averageTicket, ticketTarget);
  const laborDisplayValue = result.capabilities.hasLaborCost
    ? formatPercent(result.metrics.laborPercent)
    : result.capabilities.hasTimesheet
      ? "Wage data required"
      : "Timesheet required";

  return (
    <section className="panel-card business-health-card" aria-label="Business health">
      <div className="panel-heading">
        <div>
          <h2>Business Health</h2>
          <span>Targets are configurable for your operation</span>
        </div>
        <Target aria-hidden="true" size={20} />
      </div>

      <div className="health-list">
        <div className={`health-row ${laborHealth.tone}`}>
          <div className="health-copy">
            <strong>Labor</strong>
            <span>{laborDisplayValue}</span>
            <small>{laborHealth.label}</small>
          </div>
          <label className="target-input">
            <span>Target</span>
            <input
              min="0"
              step="0.1"
              type="number"
              inputMode="decimal"
              value={laborTargetInput}
              disabled={!result.capabilities.hasLaborCost}
              onChange={(event) => handleLaborTargetChange(event.target.value)}
            />
            <em>%</em>
          </label>
          <span className="health-meter" aria-hidden="true">
            <i style={{ "--meter-width": `${laborHealth.meterPercent}%` } as CSSProperties} />
            {laborHealth.markerPercent === null ? null : (
              <b
                className="health-target"
                style={{ "--marker-left": `${laborHealth.markerPercent}%` } as CSSProperties}
                aria-hidden="true"
              />
            )}
          </span>
        </div>

        <div className={`health-row ${ticketHealth.tone}`}>
          <div className="health-copy">
            <strong>Average Ticket</strong>
            <span>{averageTicket.available ? formatCurrency(averageTicket.value) : "Data unavailable"}</span>
            <small>{ticketHealth.label}</small>
          </div>
          <label className="target-input">
            <span>Target</span>
            <input
              min="0"
              step="0.01"
              type="number"
              inputMode="decimal"
              placeholder="Set"
              value={ticketTargetInput}
              onChange={(event) => handleTicketTargetChange(event.target.value)}
            />
            <em>$</em>
          </label>
          <span className="health-meter" aria-hidden="true">
            <i style={{ "--meter-width": `${ticketHealth.meterPercent}%` } as CSSProperties} />
            {ticketHealth.markerPercent === null ? null : (
              <b
                className="health-target"
                style={{ "--marker-left": `${ticketHealth.markerPercent}%` } as CSSProperties}
                aria-hidden="true"
              />
            )}
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * Replaces the item-sales card when the export has no product columns, which is every
 * Clover orders and payments export. Shows how orders arrive and what they tip.
 */
function OrderTypeCard({
  slices,
  tipRate
}: {
  slices: OrderTypeSlice[];
  tipRate: number;
}) {
  return (
    <section className="panel-card order-type-card" aria-label="How orders arrive">
      <div className="panel-heading">
        <div>
          <h2>How orders arrive</h2>
          <span>Share of sales by order type</span>
        </div>
        <span className="tip-rate-chip" title="Tips as a share of net sales">
          <CircleDollarSign aria-hidden="true" size={16} />
          {formatPercent(tipRate)} tips
        </span>
      </div>
      {slices.length === 0 ? (
        <div className="analytics-empty">
          <span className="breakdown-icon">
            <PackageSearch aria-hidden="true" size={20} />
          </span>
          <span>
            <strong>No order types recorded</strong>
            <small>This export does not say how the orders were placed.</small>
          </span>
        </div>
      ) : (
        <ul className="mix-list">
          {slices.map((slice) => (
            <li className="mix-row" key={slice.label}>
              <span className="mix-label">{slice.label}</span>
              <span className="mix-bar">
                <i style={{ "--bar-width": `${slice.share * 100}%` } as CSSProperties} />
              </span>
              <span className="mix-value">{formatCurrency(slice.sales)}</span>
              <span className="mix-share">
                {slice.orders} {slice.orders === 1 ? "order" : "orders"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TopSellingItemsCard({ items }: { items: TopSellingItem[] }) {
  return (
    <section className="panel-card top-items-card" aria-label="Top selling items">
      <div className="panel-heading">
        <div>
          <h2>Top Selling Items</h2>
          <span>{items.length ? "Ranked by item sales" : "Data unavailable"}</span>
        </div>
        <PackageSearch aria-hidden="true" size={20} />
      </div>

      {items.length === 0 ? (
        <AnalyticsEmptyState
          icon={PackageSearch}
          title="Item detail unavailable"
          message="This Clover file does not include item name, quantity, and item sales columns."
        />
      ) : (
        <div className="top-items-list" role="list">
          {items.map((item, index) => (
            <div className="top-item-row" key={item.name} role="listitem">
              <span className="item-rank">{index + 1}</span>
              <span className="item-copy">
                <strong>{item.name}</strong>
                <small>{formatQuantity(item.quantity)} sold</small>
              </span>
              <span className="item-bar" aria-hidden="true">
                <i style={{ "--bar-width": `${item.percentOfPeak}%` } as CSSProperties} />
              </span>
              <strong className="item-sales">{formatCurrency(item.totalSales)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function BusinessInsightsCard({ insights }: { insights: BusinessInsight[] }) {
  return (
    <section className="panel-card business-insights-card" aria-label="Business insights">
      <div className="panel-heading">
        <div>
          <h2>Business Insights</h2>
          <span>Calculated from the current imported reports</span>
        </div>
        <Lightbulb aria-hidden="true" size={20} />
      </div>

      {insights.length === 0 ? (
        <AnalyticsEmptyState
          icon={Lightbulb}
          title="No insights yet"
          message="Upload Clover data with sales, dates, and transaction details to generate insights."
        />
      ) : (
        <div className="insights-list">
          {insights.map((insight) => (
            <article className="insight-card" key={insight.title}>
              <strong>{insight.title}</strong>
              <span>{insight.detail}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AnalyticsEmptyState({
  icon: Icon,
  title,
  message
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <div className="analytics-empty">
      <span className="breakdown-icon">
        <Icon aria-hidden="true" size={20} />
      </span>
      <span>
        <strong>{title}</strong>
        <small>{message}</small>
      </span>
    </div>
  );
}

function ReportSetupPanel({
  ordersUpload,
  paymentsUpload,
  timesheetUpload,
  hasBusinessReport,
  canCalculate,
  blockingUploadError,
  result,
  onOrdersUpload,
  onPaymentsUpload,
  onTimesheetUpload,
  onCalculate,
  onReset
}: {
  ordersUpload: UploadState;
  paymentsUpload: UploadState;
  timesheetUpload: UploadState;
  hasBusinessReport: boolean;
  canCalculate: boolean;
  blockingUploadError: boolean;
  result: CalculationResult | null;
  onOrdersUpload: (file: File | null) => void;
  onPaymentsUpload: (file: File | null) => void;
  onTimesheetUpload: (file: File | null) => void;
  onCalculate: () => void;
  onReset: () => void;
}) {
  const errors = result?.issues.filter((issue) => issue.severity === "error").length ?? 0;
  const warnings = result?.issues.filter((issue) => issue.severity === "warning").length ?? 0;
  const hasTimesheet = timesheetUpload.status === "ready";
  const setupMessage = result
    ? errors
      ? `${errors} blocking issue${errors === 1 ? "" : "s"} found`
      : `${warnings} warning${warnings === 1 ? "" : "s"} found`
    : hasBusinessReport
      ? hasTimesheet
        ? "Both files read. Calculate when you are ready."
        : "Add the timesheet to work out tips, or calculate sales only."
      : "Pick an Orders or Payments export, plus the timesheet.";

  return (
    <section className="panel-card setup-panel" aria-label="Report setup">
      <div className="panel-heading">
        <div>
          <h2>{result ? "Reports" : "Upload your Clover reports"}</h2>
          <span>{setupMessage}</span>
        </div>
        {/* One status, not three. The pill only appears when it carries new information:
            something is wrong, or everything is ready to run. */}
        {errors ? (
          <span className="setup-state error">Action needed</span>
        ) : hasBusinessReport ? (
          <span className="setup-state ready">Ready</span>
        ) : null}
      </div>
      <div className="upload-row">
        <UploadPanel title="Orders" upload={ordersUpload} onUpload={onOrdersUpload} />
        <UploadPanel title="Payments" upload={paymentsUpload} onUpload={onPaymentsUpload} />
        <UploadPanel
          title="Timesheet"
          upload={timesheetUpload}
          onUpload={onTimesheetUpload}
        />
      </div>
      <div className="setup-footer">
        <div className={result && errors ? "setup-validation error" : "setup-validation"}>
          {result && errors ? (
            <AlertTriangle aria-hidden="true" size={18} />
          ) : blockingUploadError ? (
            <AlertTriangle aria-hidden="true" size={18} />
          ) : null}
          <span>
            {blockingUploadError
              ? "Fix the upload issue before calculating."
              : result
                ? `${errors} ${errors === 1 ? "error" : "errors"}, ${warnings} ${warnings === 1 ? "warning" : "warnings"}`
                : ""}
          </span>
        </div>
        <div className="setup-actions">
          <button
            className="primary-button"
            type="button"
            disabled={!canCalculate || blockingUploadError}
            onClick={onCalculate}
          >
            <Calculator aria-hidden="true" size={18} />
            Calculate dashboard
          </button>
          {/* Nothing chosen yet means nothing to clear. */}
          {hasBusinessReport || timesheetUpload.status !== "idle" ? (
            <button className="secondary-button" type="button" onClick={onReset}>
              <RotateCcw aria-hidden="true" size={17} />
              Reset
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function UploadPanel({
  title,
  upload,
  onUpload
}: {
  title: string;
  upload: UploadState;
  onUpload: (file: File | null) => void;
}) {
  const isReady = upload.status === "ready";
  const isError = upload.status === "error";
  const isReading = upload.status === "reading";
  // An empty slot says nothing: three "Waiting" badges beside three empty slots was noise
  // stating the obvious. A badge appears only once the slot has news to report.
  const statusText = isError
    ? upload.error
    : isReady
      ? `${upload.rows?.length ?? 0} rows`
      : isReading
        ? "Reading"
        : "";
  const Icon = isReady ? CheckCircle2 : isError ? AlertTriangle : Upload;

  return (
    <label className={`upload-panel ${upload.status}`}>
      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={(event) => onUpload(event.target.files?.[0] ?? null)}
      />
      <span className="icon-frame">
        <Icon aria-hidden="true" size={20} />
      </span>
      <span className="upload-copy">
        <strong>{title}</strong>
        <span title={upload.fileName || undefined}>
          {upload.fileName || "Choose a file"}
        </span>
      </span>
      {statusText ? (
        <span className={isError ? "upload-status error-text" : "upload-status"}>
          {statusText}
        </span>
      ) : null}
    </label>
  );
}

function TipSummaryStrip({ result }: { result: CalculationResult }) {
  const tipPool = result.metrics.totalTips + result.metrics.eventTips;
  const unallocatedPercent =
    tipPool === 0 ? "0%" : formatPercent(result.metrics.totalUnallocatedTips / tipPool);
  const cards = [
    {
      label: "Store Tips",
      value: formatCurrency(result.metrics.allocatedTips),
      detail: `${formatCurrency(result.metrics.totalTips)} store pool`,
      icon: CircleDollarSign
    },
    {
      label: "Event Tips",
      value: formatCurrency(result.metrics.eventAllocatedTips),
      detail: `${formatCurrency(result.metrics.eventTips)} event pool`,
      icon: WalletCards
    },
    {
      label: "Total Payout",
      value: formatCurrency(result.metrics.totalAllocatedTips),
      detail: `${result.metrics.employeesFound} employees`,
      icon: Users,
      featured: true
    },
    {
      label: "Unallocated",
      value: formatCurrency(result.metrics.totalUnallocatedTips),
      detail: `${unallocatedPercent} of tips`,
      icon: AlertTriangle,
      warning: result.metrics.totalUnallocatedTips > 0
    }
  ];

  return (
    <section className="tip-summary-grid" aria-label="Tip allocation totals">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            className={[
              "tip-summary-card",
              card.featured ? "featured" : "",
              card.warning ? "warning" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            key={card.label}
          >
            <span className="tip-summary-icon">
              <Icon aria-hidden="true" size={20} />
            </span>
            <span>
              <small>{card.label}</small>
              <strong>{card.value}</strong>
              <em>{card.detail}</em>
            </span>
          </div>
        );
      })}
    </section>
  );
}

function EdgeCasePanel({ result }: { result: CalculationResult }) {
  const totalTips = result.metrics.totalTips + result.metrics.eventTips;

  if (totalTips === 0) {
    return (
      <section className="notice-panel">
        <AlertTriangle aria-hidden="true" size={18} />
        <span>No tipped store or event orders were found in the sales report.</span>
      </section>
    );
  }

  if (result.metrics.totalAllocatedTips === 0) {
    return (
      <section className="notice-panel">
        <AlertTriangle aria-hidden="true" size={18} />
        <span>Tips were found, but no tipped orders matched active shifts by role.</span>
      </section>
    );
  }

  if (result.metrics.totalUnallocatedTips === 0) {
    return (
      <section className="notice-panel success">
        <CheckCircle2 aria-hidden="true" size={18} />
        <span>All tipped orders matched active shifts by role.</span>
      </section>
    );
  }

  // The Unallocated summary card and the table of those orders both already carry this
  // figure. A third banner saying it again added noise, not information.
  return null;
}

/**
 * Publishes the calculated payouts so staff can sign in and see their own line.
 *
 * Only the per-person totals are sent. The uploaded Clover reports never leave the
 * browser, so no sales or card data is stored.
 */
function PublishPanel({
  result,
  uploads
}: {
  result: CalculationResult;
  uploads: UploadSummary[];
}) {
  const [state, setState] = useState<PublishState>({ status: "idle", message: "" });
  const [isPublishing, setIsPublishing] = useState(false);

  async function handlePublish(replaceExisting = false) {
    setIsPublishing(true);
    setState({ status: "idle", message: "" });

    const dates = result.salesOrders
      .map((order) => order.orderDate)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime());
    const isoDate = (date: Date | undefined) =>
      date ? date.toISOString().slice(0, 10) : null;

    const next = await publishPayouts({
      label: formatDateRange(result),
      startsOn: isoDate(dates[0]),
      endsOn: isoDate(dates[dates.length - 1]),
      totalTips: roundMoney(result.metrics.totalTips),
      allocatedTips: roundMoney(result.metrics.totalAllocatedTips),
      unallocatedTips: roundMoney(result.metrics.totalUnallocatedTips),
      employees: result.employees.map((employee) => ({
        employee: employee.employee,
        paidHours: employee.paidHours,
        storeTipShare: roundMoney(employee.storeTipShare),
        eventTipShare: roundMoney(employee.eventTipShare),
        tipShare: roundMoney(employee.tipShare),
        sharePercent: employee.sharePercent
      })),
      uploads,
      // Kept as one document so the history view can show what the dashboard showed,
      // without a migration every time a figure is added.
      metrics: {
        netSales: roundMoney(result.metrics.netSales),
        totalLaborCost: roundMoney(result.metrics.totalLaborCost),
        laborPercent: result.metrics.laborPercent,
        tipRate: buildTipRate(result),
        orderCount: result.salesOrders.length,
        employeeCount: result.employees.length,
        orderTypeMix: buildOrderTypeMix(result),
        eventTips: roundMoney(result.metrics.eventTips)
      },
      replaceExisting
    });

    setState(next);
    setIsPublishing(false);
  }

  return (
    <section className="publish-panel">
      <div>
        <strong>Share this week with staff</strong>
        <small>
          Publishes each person&rsquo;s total so they can sign in and see their own tips.
          Uploaded reports are never stored.
        </small>
      </div>
      <div className="publish-actions">
        {state.message && state.status !== "confirm" ? (
          <span className={state.status === "error" ? "publish-error" : "publish-ok"}>
            {state.message}
          </span>
        ) : null}
        <button
          className="secondary-button compact"
          type="button"
          onClick={() => handlePublish(false)}
          disabled={isPublishing || !result.employees.length}
        >
          <Users aria-hidden="true" size={17} />
          {isPublishing ? "Publishing..." : "Publish to staff"}
        </button>
      </div>

      {/* Replacing a saved period changes figures staff may have already seen, so it
          always asks first rather than quietly overwriting. */}
      {state.status === "confirm" ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="Replace saved period">
          <div className="confirm-card">
            <strong>Already saved</strong>
            <span>{state.message}</span>
            <div className="confirm-actions">
              <button
                className="secondary-button compact"
                type="button"
                onClick={() => setState({ status: "idle", message: "" })}
              >
                Cancel
              </button>
              <button
                className="primary-button compact"
                type="button"
                disabled={isPublishing}
                onClick={() => handlePublish(true)}
              >
                {isPublishing ? "Replacing..." : "Replace it"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function EmployeeTable({
  result,
  uploads
}: {
  result: CalculationResult;
  uploads: UploadSummary[];
}) {
  const [employeeQuery, setEmployeeQuery] = useState("");
  const visibleEmployees = useMemo(() => {
    const query = normalizeSearch(employeeQuery);
    if (!query) {
      return result.employees;
    }

    return result.employees.filter((employee) =>
      normalizeSearch(employee.employee).includes(query)
    );
  }, [employeeQuery, result.employees]);

  // Totals are summed over the rows actually shown, not the whole result. With a search
  // active, a footer showing the unfiltered payout reads as the total of the visible rows
  // and badly misstates what is owed.
  const totals = useMemo(
    () =>
      visibleEmployees.reduce(
        (running, employee) => ({
          storeHours: running.storeHours + employee.storeHours,
          eventHours: running.eventHours + employee.eventHours,
          paidHours: running.paidHours + employee.paidHours,
          storeTips: running.storeTips + employee.storeTipShare,
          eventTips: running.eventTips + employee.eventTipShare,
          totalTips: running.totalTips + employee.tipShare,
          sharePercent: running.sharePercent + employee.sharePercent
        }),
        {
          storeHours: 0,
          eventHours: 0,
          paidHours: 0,
          storeTips: 0,
          eventTips: 0,
          totalTips: 0,
          sharePercent: 0
        }
      ),
    [visibleEmployees]
  );
  const isFiltered = visibleEmployees.length !== result.employees.length;

  return (
    <section className="table-panel">
      <div className="section-heading">
        <div className="employee-heading">
          <h2>Employee summary</h2>
          <label className="employee-search">
            <Search aria-hidden="true" size={16} />
            <input
              type="search"
              placeholder="Search employees..."
              value={employeeQuery}
              onChange={(event) => setEmployeeQuery(event.target.value)}
            />
          </label>
          <button className="icon-button" aria-label="Filter employees" type="button">
            <SlidersHorizontal aria-hidden="true" size={16} />
          </button>
        </div>
        <span>
          {formatCurrency(result.metrics.totalAllocatedTips)} allocated across{" "}
          {result.metrics.employeesFound} employees
        </span>
      </div>
      <PublishPanel result={result} uploads={uploads} />
      {/* The method is the point of the app, not an implementation detail: tips follow who
          was clocked in for each order, not hours worked. Saying so here heads off the
          "why did they get more than me on fewer hours" question. */}
      <p className="method-note">
        Each order&rsquo;s tip is split equally between the staff clocked in at that
        moment, so payout follows coverage rather than total hours.
      </p>
      <div className="table-scroll">
        <table className="summary-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Store hours</th>
              <th>Event hours</th>
              <th>Total hours</th>
              <th>Store tips</th>
              <th>Event tips</th>
              <th>Total tips</th>
              <th>Share %</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.length === 0 ? (
              <tr>
                <td className="table-empty" colSpan={9}>
                  {result.employees.length === 0
                    ? "No employees were found in the timesheet report."
                    : "No employees match this search."}
                </td>
              </tr>
            ) : (
              visibleEmployees.map((employee) => (
                <tr key={employee.employee}>
                  <td data-label="Employee">
                    <span className="employee-cell">
                      <span className="employee-avatar">{employeeInitials(employee.employee)}</span>
                      <strong>{employee.employee}</strong>
                    </span>
                  </td>
                  <td data-label="Store hours" className="numeric">
                    {formatNumber(employee.storeHours)}
                  </td>
                  <td data-label="Event hours" className="numeric">
                    {formatNumber(employee.eventHours)}
                  </td>
                  <td data-label="Total hours" className="numeric">
                    {formatNumber(employee.paidHours)}
                  </td>
                  <td data-label="Store tips" className="numeric payout">
                    {formatCurrency(employee.storeTipShare)}
                  </td>
                  <td data-label="Event tips" className="numeric payout">
                    {formatCurrency(employee.eventTipShare)}
                  </td>
                  <td data-label="Total tips" className="numeric payout">
                    {formatCurrency(employee.tipShare)}
                  </td>
                  <td data-label="Share %" className="numeric">
                    {formatPercent(employee.sharePercent)}
                  </td>
                  <td data-label="Review">
                    <span className={employee.review ? "status-pill muted" : "status-pill ready"}>
                      {employee.review || "Ready to pay"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td data-label="Employee">{isFiltered ? "Filtered total" : "Total"}</td>
              <td data-label="Store hours" className="numeric">
                {formatNumber(totals.storeHours)}
              </td>
              <td data-label="Event hours" className="numeric">
                {formatNumber(totals.eventHours)}
              </td>
              <td data-label="Total hours" className="numeric">
                {formatNumber(totals.paidHours)}
              </td>
              <td data-label="Store tips" className="numeric payout">
                {formatCurrency(totals.storeTips)}
              </td>
              <td data-label="Event tips" className="numeric payout">
                {formatCurrency(totals.eventTips)}
              </td>
              <td data-label="Total tips" className="numeric payout">
                {formatCurrency(totals.totalTips)}
              </td>
              <td data-label="Share %" className="numeric">
                {formatPercent(totals.sharePercent)}
              </td>
              <td data-label="Review">
                {visibleEmployees.length}
                {visibleEmployees.length === 1 ? " employee" : " employees"}
                {isFiltered ? ` of ${result.employees.length}` : ""}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function ValidationPanel({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return (
    <section className={errors.length ? "validation-panel has-errors" : "validation-panel"}>
      <div className="section-heading">
        <h2>Validation</h2>
        <span>
          {errors.length} {errors.length === 1 ? "error" : "errors"}, {warnings.length}{" "}
          {warnings.length === 1 ? "warning" : "warnings"}
        </span>
      </div>
      {issues.length === 0 ? (
        <div className="validation-ok">
          <CheckCircle2 aria-hidden="true" size={18} />
          <span>Inputs passed validation.</span>
        </div>
      ) : (
        <div className="validation-content">
          {errors.length ? (
            <>
              <p className="validation-message">
                Fix these items before using the payout table.
              </p>
              <IssueList issues={errors} />
            </>
          ) : (
            <div className="validation-ok">
              <CheckCircle2 aria-hidden="true" size={18} />
              <span>Calculation completed.</span>
            </div>
          )}

          {warnings.length ? (
            <details className="warning-details">
              <summary>
                <span>
                  Review {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                </span>
                <ChevronDown aria-hidden="true" size={18} />
              </summary>
              <IssueList issues={warnings} />
            </details>
          ) : null}
        </div>
      )}
    </section>
  );
}

function IssueList({ issues }: { issues: ValidationIssue[] }) {
  return (
    <ul className="issue-list">
      {issues.map((issue, index) => (
        <li className={issue.severity} key={`${issue.source}-${issue.row ?? "all"}-${index}`}>
          <AlertTriangle aria-hidden="true" size={17} />
          <span>
            <strong>{issue.severity}</strong>
            {formatIssue(issue)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function UnallocatedOrders({ result }: { result: CalculationResult }) {
  const unallocated = useMemo(
    () =>
      result.allocationDetails.filter(
        (detail) => detail.tip > 0 && detail.activeStaff === 0
      ),
    [result.allocationDetails]
  );

  if (unallocated.length === 0) {
    return null;
  }

  return (
    <section className="table-panel">
      <div className="section-heading">
        <h2>Unallocated orders</h2>
        <span>{formatCurrency(result.metrics.totalUnallocatedTips)}</span>
      </div>
      <div className="table-scroll">
        <table className="detail-table">
          <thead>
            <tr>
              <th>Pool</th>
              <th>Order time</th>
              <th>Order ID</th>
              <th>Tip</th>
              <th>Status</th>
              <th>Raw row</th>
            </tr>
          </thead>
          <tbody>
            {unallocated.slice(0, 25).map((detail) => (
              <tr key={`${detail.orderId}-${detail.rowNumber}`}>
                <td data-label="Pool">{formatPool(detail.pool)}</td>
                <td data-label="Order time">
                  {formatDateTime(detail.orderDate) || "Invalid time"}
                </td>
                <td data-label="Order ID">{detail.orderId || "Blank"}</td>
                <td data-label="Tip" className="numeric payout">
                  {formatCurrency(detail.tip)}
                </td>
                <td data-label="Status">
                  <span className="status-pill warning">{detail.status}</span>
                </td>
                <td data-label="Raw row" className="numeric">
                  {detail.rowNumber}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unallocated.length > 25 ? (
        <p className="table-note">Showing the first 25 unallocated orders. Export Excel for all rows.</p>
      ) : null}
    </section>
  );
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function buildAverageTicket(result: CalculationResult): AverageTicketMetric {
  const transactions = result.salesOrders.length;

  return {
    available: transactions > 0,
    value: transactions === 0 ? 0 : roundMoney(result.metrics.netSales / transactions),
    transactions
  };
}

function buildHourlyLineChart(hourlySales: HourlySales[]): {
  points: HourlyLinePoint[];
  linePath: string;
  areaPath: string;
  maxSales: number;
} {
  const maxSales = Math.max(
    1,
    ...hourlySales.map((hour) => Math.max(0, hour.netSales))
  );
  const points = hourlySales.map((hour, index) => {
    const x =
      hourlySales.length === 1
        ? LINE_CHART_LEFT + LINE_CHART_PLOT_WIDTH / 2
        : LINE_CHART_LEFT + (index / (hourlySales.length - 1)) * LINE_CHART_PLOT_WIDTH;
    const y =
      LINE_CHART_TOP +
      (1 - safeRatio(Math.max(0, hour.netSales), maxSales)) * LINE_CHART_PLOT_HEIGHT;

    return {
      ...hour,
      x: roundChartCoordinate(x),
      y: roundChartCoordinate(y)
    };
  });
  const linePath = buildSmoothPath(points);
  const areaPath =
    points.length > 1
      ? `${linePath} L ${points[points.length - 1].x} ${LINE_CHART_BOTTOM} L ${points[0].x} ${LINE_CHART_BOTTOM} Z`
      : "";

  return {
    points,
    linePath,
    areaPath,
    maxSales
  };
}

function buildSmoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const midpointX = roundChartCoordinate((previous.x + point.x) / 2);
    return `${path} C ${midpointX} ${previous.y}, ${midpointX} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function roundChartCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildHourlySales(result: CalculationResult): HourlySales[] {
  const grouped = new Map<number, { netSales: number; transactions: number }>();

  result.salesOrders.forEach((order) => {
    if (!order.orderDate) {
      return;
    }

    const hour = order.orderDate.getHours();
    const current = grouped.get(hour) ?? { netSales: 0, transactions: 0 };
    current.netSales += order.netSales;
    current.transactions += 1;
    grouped.set(hour, current);
  });

  if (grouped.size === 0) {
    return [];
  }

  const hours = [...grouped.keys()];
  const firstHour = Math.min(...hours);
  const lastHour = Math.max(...hours);
  const businessHours = Array.from(
    { length: lastHour - firstHour + 1 },
    (_, index) => firstHour + index
  );
  const peakSales = Math.max(
    ...businessHours.map((hour) => Math.max(0, grouped.get(hour)?.netSales ?? 0))
  );

  return businessHours.map((hour) => {
    const summary = grouped.get(hour) ?? { netSales: 0, transactions: 0 };
    const positiveSales = Math.max(0, summary.netSales);
    const percentOfPeak =
      peakSales === 0 ? 0 : Math.max(safeRatio(positiveSales, peakSales) * 100, positiveSales > 0 ? 6 : 0);

    return {
      hour,
      label: formatHourLabel(hour),
      netSales: roundMoney(summary.netSales),
      transactions: summary.transactions,
      percentOfPeak,
      isPeak: peakSales > 0 && positiveSales === peakSales
    };
  });
}

function buildDailySales(result: CalculationResult): DailySales[] {
  const grouped = new Map<number, { netSales: number; transactions: number }>();

  result.salesOrders.forEach((order) => {
    if (!order.orderDate) {
      return;
    }

    const dayIndex = order.orderDate.getDay();
    const current = grouped.get(dayIndex) ?? { netSales: 0, transactions: 0 };
    current.netSales += order.netSales;
    current.transactions += 1;
    grouped.set(dayIndex, current);
  });

  if (grouped.size === 0) {
    return [];
  }

  const dayIndexes = WEEKDAY_ORDER.filter((dayIndex) => grouped.has(dayIndex));
  const peakSales = Math.max(
    ...dayIndexes.map((dayIndex) => Math.max(0, grouped.get(dayIndex)?.netSales ?? 0))
  );
  const weakestSales = Math.min(
    ...dayIndexes.map((dayIndex) => grouped.get(dayIndex)?.netSales ?? 0)
  );

  return dayIndexes.map((dayIndex) => {
    const summary = grouped.get(dayIndex) ?? { netSales: 0, transactions: 0 };
    const positiveSales = Math.max(0, summary.netSales);
    const percentOfPeak =
      peakSales === 0
        ? 0
        : Math.max(safeRatio(positiveSales, peakSales) * 100, positiveSales > 0 ? 6 : 0);

    return {
      dayIndex,
      label: WEEKDAY_LABELS[dayIndex],
      fullLabel: WEEKDAY_NAMES[dayIndex],
      netSales: roundMoney(summary.netSales),
      transactions: summary.transactions,
      percentOfPeak,
      isStrongest: peakSales > 0 && positiveSales === peakSales,
      isWeakest:
        dayIndexes.length > 1 && weakestSales !== peakSales && summary.netSales === weakestSales
    };
  });
}

type OrderTypeSlice = { label: string; orders: number; sales: number; share: number };

/**
 * How the money arrives: dine in, pickup, delivery. Present in every Clover export and,
 * unlike item detail, actually usable — the card that used to sit here could never show
 * anything because neither export carries product names.
 */
function buildOrderTypeMix(result: CalculationResult): OrderTypeSlice[] {
  const grouped = new Map<string, { orders: number; sales: number }>();

  result.salesOrders.forEach((order) => {
    const label = order.orderType.trim() || "Unspecified";
    const entry = grouped.get(label) ?? { orders: 0, sales: 0 };
    entry.orders += 1;
    entry.sales += order.orderTotal;
    grouped.set(label, entry);
  });

  const total = [...grouped.values()].reduce((sum, entry) => sum + entry.sales, 0);

  return [...grouped.entries()]
    .map(([label, entry]) => ({
      label,
      orders: entry.orders,
      sales: roundMoney(entry.sales),
      share: total > 0 ? entry.sales / total : 0
    }))
    .sort((a, b) => b.sales - a.sales);
}

/** Tips as a share of net sales — the number this whole app exists to divide up. */
function buildTipRate(result: CalculationResult): number {
  return result.metrics.netSales > 0 ? result.metrics.totalTips / result.metrics.netSales : 0;
}

function buildTopSellingItems(result: CalculationResult): TopSellingItem[] {
  const grouped = new Map<string, { name: string; quantity: number; totalSales: number }>();

  result.salesOrders.forEach((order) => {
    if (!order.itemName || order.itemQuantity === null || order.itemSales === null) {
      return;
    }

    const quantity = Math.max(0, order.itemQuantity);
    const totalSales = Math.max(0, order.itemSales);
    if (quantity === 0 && totalSales === 0) {
      return;
    }

    const key = normalizeSearch(order.itemName);
    const current = grouped.get(key) ?? {
      name: order.itemName,
      quantity: 0,
      totalSales: 0
    };
    current.quantity += quantity;
    current.totalSales += totalSales;
    grouped.set(key, current);
  });

  const rankedItems = [...grouped.values()]
    .map((item) => ({
      ...item,
      totalSales: roundMoney(item.totalSales)
    }))
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 10);
  const peakSales = Math.max(0, ...rankedItems.map((item) => item.totalSales));

  return rankedItems.map((item) => ({
    ...item,
    percentOfPeak:
      peakSales === 0 ? 0 : Math.max(safeRatio(item.totalSales, peakSales) * 100, 8)
  }));
}

function buildBusinessInsights({
  result,
  averageTicket,
  hourlySales,
  dailySales,
  topSellingItems
}: {
  result: CalculationResult;
  averageTicket: AverageTicketMetric;
  hourlySales: HourlySales[];
  dailySales: DailySales[];
  topSellingItems: TopSellingItem[];
}): BusinessInsight[] {
  const insights: BusinessInsight[] = [];
  const strongestDay = dailySales.find((day) => day.isStrongest);
  const weakestDay = dailySales.find((day) => day.isWeakest);
  const peakHour = getPeakHour(hourlySales);
  const deliveryPlatforms = [
    { name: "DoorDash", value: result.metrics.doorDashSales },
    { name: "Uber Eats", value: result.metrics.uberEatsSales },
    { name: "Grubhub", value: result.metrics.grubhubSales }
  ].filter((platform) => platform.value > 0);
  const deliveryTotal = deliveryPlatforms.reduce((total, platform) => total + platform.value, 0);
  const topDeliveryPlatform = [...deliveryPlatforms].sort((a, b) => b.value - a.value)[0];

  if (strongestDay) {
    insights.push({
      title: `${strongestDay.fullLabel} generated the highest sales this period.`,
      detail: `${formatCurrency(strongestDay.netSales)} across ${formatTransactionCount(strongestDay.transactions)}.`
    });
  }

  if (weakestDay) {
    insights.push({
      title: `${weakestDay.fullLabel} had the lowest sales this period.`,
      detail: `${formatCurrency(weakestDay.netSales)} across ${formatTransactionCount(weakestDay.transactions)}.`
    });
  }

  if (peakHour) {
    insights.push({
      title: `${formatHourRange(peakHour.hour)} was the busiest hour.`,
      detail: `${formatCurrency(peakHour.netSales)} across ${formatTransactionCount(peakHour.transactions)}.`
    });
  }

  if (averageTicket.available) {
    insights.push({
      title: `Average Ticket was ${formatCurrency(averageTicket.value)}.`,
      detail: `${formatTransactionCount(averageTicket.transactions)} were used in the calculation.`
    });
  }

  if (deliveryTotal > 0 && topDeliveryPlatform) {
    insights.push({
      title: `${topDeliveryPlatform.name} represented ${formatPercent(safeRatio(topDeliveryPlatform.value, deliveryTotal))} of delivery sales.`,
      detail: `${formatCurrency(topDeliveryPlatform.value)} of ${formatCurrency(deliveryTotal)} delivery net sales.`
    });
  }

  if (result.metrics.netSales > 0 && result.metrics.totalLaborCost > 0) {
    insights.push({
      title: `Labor represented ${formatPercent(result.metrics.laborPercent)} of Net Sales.`,
      detail: `${formatCurrency(result.metrics.totalLaborCost)} labor cost against ${formatCurrency(result.metrics.netSales)} net sales.`
    });
  }

  if (topSellingItems.length > 0) {
    const topItem = topSellingItems[0];
    insights.push({
      title: `Your top-selling item was ${topItem.name}.`,
      detail: `${formatCurrency(topItem.totalSales)} from ${formatQuantity(topItem.quantity)} sold.`
    });
  }

  return insights.slice(0, 7);
}

function formatHourLabel(hour: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric"
  }).format(new Date(2026, 0, 1, hour));
}

function formatHourRange(hour: number): string {
  return `${formatHourLabel(hour)} - ${formatHourLabel((hour + 1) % 24)}`;
}

function getPeakHour(hourlySales: HourlySales[]): HourlySales | null {
  return hourlySales.find((hour) => hour.isPeak) ?? null;
}

function formatTransactionCount(transactions: number): string {
  return `${formatNumber(transactions, 0)} ${transactions === 1 ? "transaction" : "transactions"}`;
}

function formatCompactCurrency(value: number): string {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1000) {
    const compactValue = value / 1000;
    return `$${formatNumber(compactValue, absoluteValue >= 10000 ? 0 : 1)}k`;
  }

  return formatCurrency(value);
}

function formatQuantity(quantity: number): string {
  return Number.isInteger(quantity) ? formatNumber(quantity, 0) : formatNumber(quantity);
}

function parsePositiveTarget(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getLaborHealth(
  result: CalculationResult,
  targetPercent: number | null
): MeterHealth {
  if (!result.capabilities.hasTimesheet) {
    return { label: "Upload Timesheet to track labor", meterPercent: 0, markerPercent: null, tone: "neutral" };
  }

  if (!result.capabilities.hasLaborCost) {
    return { label: "Add wage rate or estimated wages", meterPercent: 0, markerPercent: null, tone: "neutral" };
  }

  if (targetPercent === null) {
    return { label: "Set a labor target", meterPercent: 0, markerPercent: null, tone: "neutral" };
  }

  const targetRatio = targetPercent / 100;
  const laborPercent = result.metrics.laborPercent;

  // The meter is scaled so the target sits at two thirds of the bar. Filling to the target
  // instead would clamp every overrun to a full bar, making 1 point over look identical to
  // 30 points over on the one number managers actually watch.
  const scaleMax = targetRatio * 1.5;
  const meterPercent = Math.min(safeRatio(laborPercent, scaleMax) * 100, 100);
  const markerPercent = METER_TARGET_MARKER_PERCENT;
  const gap = Math.abs(laborPercent - targetRatio) * 100;
  const gapLabel = `${formatNumber(gap, 1)} pts`;

  return laborPercent <= targetRatio
    ? {
        label: `${gapLabel} under your ${formatNumber(targetPercent, 0)}% target`,
        meterPercent,
        markerPercent,
        tone: "positive"
      }
    : {
        label: `${gapLabel} over your ${formatNumber(targetPercent, 0)}% target`,
        meterPercent,
        markerPercent,
        tone: "warning"
      };
}

function getAverageTicketHealth(
  averageTicket: AverageTicketMetric,
  target: number | null
): MeterHealth {
  if (!averageTicket.available) {
    return { label: "Data unavailable", meterPercent: 0, markerPercent: null, tone: "neutral" };
  }

  if (target === null) {
    return { label: "Set an Average Ticket target", meterPercent: 0, markerPercent: null, tone: "neutral" };
  }

  const scaleMax = target * 1.5;
  const meterPercent = Math.min(safeRatio(averageTicket.value, scaleMax) * 100, 100);
  const markerPercent = METER_TARGET_MARKER_PERCENT;
  const gap = Math.abs(averageTicket.value - target);

  return averageTicket.value >= target
    ? {
        label: `${formatCurrency(gap)} above your ${formatCurrency(target)} target`,
        meterPercent,
        markerPercent,
        tone: "positive"
      }
    : {
        label: `${formatCurrency(gap)} below your ${formatCurrency(target)} target`,
        meterPercent,
        markerPercent,
        tone: "warning"
      };
}

function updateLocalTarget(key: string, value: string) {
  if (value) {
    localStorage.setItem(key, value);
    return;
  }

  localStorage.removeItem(key);
}

function formatDateRange(result: CalculationResult): string {
  const dates = result.salesOrders
    .map((order) => order.orderDate)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) {
    return "Current pay period";
  }

  const first = dates[0];
  const last = dates[dates.length - 1];
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  });
  const yearFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric"
  });

  if (first.toDateString() === last.toDateString()) {
    return `Week of ${dateFormatter.format(first)}, ${yearFormatter.format(first)}`;
  }

  return `Week of ${dateFormatter.format(first)} - ${dateFormatter.format(last)}, ${yearFormatter.format(last)}`;
}

function safeRatio(value: number, total: number): number {
  return total === 0 ? 0 : value / total;
}

function employeeInitials(name: string): string {
  const pieces = name
    .split(/\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  if (pieces.length === 0) {
    return "--";
  }

  return pieces
    .slice(0, 2)
    .map((piece) => piece[0]?.toUpperCase() ?? "")
    .join("");
}

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatPool(pool: "store" | "event"): string {
  return pool === "event" ? "Event" : "Store";
}

function formatIssue(issue: ValidationIssue): string {
  const pieces: string[] = [issue.source];
  if (issue.row) {
    pieces.push(`row ${issue.row}`);
  }
  if (issue.field) {
    pieces.push(issue.field);
  }

  return `: ${pieces.join(" - ")} - ${issue.message}`;
}
