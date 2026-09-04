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

type AppView = "dashboard" | "tips" | "settings";

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
};

const emptyUpload: UploadState = {
  fileName: "",
  rows: null,
  error: "",
  status: "idle"
};

export type SessionUser = {
  email: string;
  fullName: string;
  role: string;
};

export function DashboardClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);
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
  const pageTitle =
    activeView === "dashboard"
      ? "Business Dashboard"
      : activeView === "tips"
        ? "Weekly Tip Distribution"
        : "Settings";

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
    setUpload({ fileName: file.name, rows: null, error: "", status: "reading" });

    try {
      const rows = await readSpreadsheetFile(file);
      setUpload({
        fileName: file.name,
        rows,
        error: rows.length === 0 ? "No rows found in the first sheet." : "",
        status: rows.length === 0 ? "error" : "ready"
      });
    } catch {
      setUpload({
        fileName: file.name,
        rows: null,
        error: "This file could not be read.",
        status: "error"
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
        timesheetGrid: timesheetUpload.rows
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
      <AppSidebar activeView={activeView} onViewChange={setActiveView} />
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

        {showReportSetup ? (
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
        ) : activeView === "settings" ? (
          <SettingsView />
        ) : (
          <>
            {/* Warnings were only ever rendered alongside blocking errors, so a run that
                succeeded hid them entirely — including shifts whose clock times could not
                be read, whose owners silently earn nothing. Collapsed, but present. */}
            {result.issues.length ? <ValidationPanel issues={result.issues} /> : null}
            {activeView === "dashboard" ? (
              <DashboardView result={result} />
            ) : (
              <TipsView result={result} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function AppSidebar({
  activeView,
  onViewChange
}: {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}) {
  const navItems: Array<{ id: AppView; label: string; icon: LucideIcon }> = [
    { id: "dashboard", label: "Dashboard", icon: ChartPie },
    { id: "tips", label: "Tips", icon: WalletCards },
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

      <div className="sidebar-support">
        <CircleHelp aria-hidden="true" size={18} />
        <strong>Review week</strong>
        <span>Check sales metrics, tip allocation, and unallocated orders before export.</span>
      </div>
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
          <span className={result && !hasErrors ? "review-pill ready" : "review-pill"}>
            {result && !hasErrors ? "Ready to review" : "Setup required"}
          </span>
        </div>
        <div className="period-control" aria-label="Pay period">
          <CalendarDays aria-hidden="true" size={17} />
          <span>{result ? formatDateRange(result) : "Current pay period"}</span>
        </div>
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
        <button
          className="primary-button compact"
          type="button"
          disabled={!result || hasErrors || !result.capabilities.hasTipDistribution}
          onClick={onExport}
        >
          <Download aria-hidden="true" size={18} />
          Export Excel
        </button>
      </div>
    </section>
  );
}

function DashboardView({ result }: { result: CalculationResult }) {
  const hourlySales = useMemo(() => buildHourlySales(result), [result]);
  const dailySales = useMemo(() => buildDailySales(result), [result]);
  const topSellingItems = useMemo(() => buildTopSellingItems(result), [result]);
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
        <TopSellingItemsCard items={topSellingItems} />
        <BusinessInsightsCard insights={businessInsights} />
      </div>
      <BusinessHealthCard result={result} averageTicket={averageTicket} />
    </div>
  );
}

function TipsView({ result }: { result: CalculationResult }) {
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
      <EmployeeTable result={result} />
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

function SettingsView() {
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
        ? "Business and timesheet reports ready"
        : "Business dashboard ready"
      : "Upload Orders or Payments to begin";

  return (
    <section className="panel-card setup-panel" aria-label="Report setup">
      <div className="panel-heading">
        <div>
          <h2>Reports</h2>
          <span>{setupMessage}</span>
        </div>
        <span
          className={
            errors
              ? "setup-state error"
              : hasBusinessReport
                ? "setup-state ready"
                : "setup-state"
          }
        >
          {errors ? "Action needed" : hasBusinessReport ? "Ready" : "Waiting"}
        </span>
      </div>
      <div className="upload-row">
        <UploadPanel title="Orders Report" upload={ordersUpload} onUpload={onOrdersUpload} />
        <UploadPanel title="Payments Report" upload={paymentsUpload} onUpload={onPaymentsUpload} />
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
          ) : hasBusinessReport ? (
            <CheckCircle2 aria-hidden="true" size={18} />
          ) : (
            <Upload aria-hidden="true" size={18} />
          )}
          <span>
            {blockingUploadError
              ? "Fix the upload issue before calculating."
              : result
                ? `${errors} ${errors === 1 ? "error" : "errors"}, ${warnings} ${warnings === 1 ? "warning" : "warnings"}`
                : hasBusinessReport
                  ? "Run calculation for dashboard analytics. Timesheet unlocks labor and tips."
                  : "Waiting for an Orders Report or Payments Report."}
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
          <button className="secondary-button" type="button" onClick={onReset}>
            <RotateCcw aria-hidden="true" size={17} />
            Reset
          </button>
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
  const statusText = isError
    ? upload.error
    : isReady
      ? `Ready - ${upload.rows?.length ?? 0} rows`
      : isReading
        ? "Reading file"
        : "Waiting";
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
        <span>{upload.fileName || "CSV, XLS, or XLSX"}</span>
      </span>
      <span className={isError ? "upload-status error-text" : "upload-status"}>
        {statusText}
      </span>
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

  return (
    <section className="notice-panel warning">
      <AlertTriangle aria-hidden="true" size={18} />
      <span>
        {formatCurrency(result.metrics.totalUnallocatedTips)} needs manager review before payout.
      </span>
    </section>
  );
}

function EmployeeTable({ result }: { result: CalculationResult }) {
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
