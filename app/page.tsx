"use client";

import {
  AlertTriangle,
  Banknote,
  Bell,
  Calculator,
  CalendarDays,
  ChartPie,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  CircleHelp,
  CreditCard,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Upload,
  Users,
  WalletCards
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { exportTipWorkbook } from "@/lib/export-results";
import { readSpreadsheetFile } from "@/lib/spreadsheet-file";
import {
  calculateTipDistribution,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  type CalculationResult,
  type Grid,
  type ValidationIssue
} from "@/lib/tip-calculator";

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

export default function Home() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [salesUpload, setSalesUpload] = useState<UploadState>(emptyUpload);
  const [timesheetUpload, setTimesheetUpload] = useState<UploadState>(emptyUpload);
  const [result, setResult] = useState<CalculationResult | null>(null);

  const uploadsReady = salesUpload.status === "ready" && timesheetUpload.status === "ready";
  const canCalculate = uploadsReady;
  const hasErrors = result?.issues.some((issue) => issue.severity === "error") ?? false;
  const blockingUploadError = Boolean(salesUpload.error || timesheetUpload.error);

  useEffect(() => {
    setIsUnlocked(sessionStorage.getItem("fairTipsUnlocked") === "true");
  }, []);

  function handleUnlock() {
    sessionStorage.setItem("fairTipsUnlocked", "true");
    setIsUnlocked(true);
  }

  function handleLock() {
    sessionStorage.removeItem("fairTipsUnlocked");
    setIsUnlocked(false);
    handleReset();
  }

  async function handleUpload(kind: "sales" | "timesheet", file: File | null) {
    if (!file) {
      return;
    }

    const setUpload = kind === "sales" ? setSalesUpload : setTimesheetUpload;
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
    if (!salesUpload.rows || !timesheetUpload.rows) {
      return;
    }

    setResult(calculateTipDistribution(salesUpload.rows, timesheetUpload.rows));
  }

  function handleReset() {
    setSalesUpload(emptyUpload);
    setTimesheetUpload(emptyUpload);
    setResult(null);
  }

  if (!isUnlocked) {
    return <PasswordGate onUnlock={handleUnlock} />;
  }

  return (
    <div className="app-frame">
      <AppSidebar />
      <main className="dashboard-main">
        <DashboardHeader
          result={result}
          hasErrors={hasErrors}
          onLock={handleLock}
          onExport={() => result && exportTipWorkbook(result)}
        />

        {result && !hasErrors ? (
          <>
            <ExecutiveMetrics result={result} />
            <InsightGrid result={result} />
          </>
        ) : null}

        <WorkflowGrid
          salesUpload={salesUpload}
          timesheetUpload={timesheetUpload}
          uploadsReady={uploadsReady}
          canCalculate={canCalculate}
          blockingUploadError={blockingUploadError}
          result={result}
          onSalesUpload={(file) => handleUpload("sales", file)}
          onTimesheetUpload={(file) => handleUpload("timesheet", file)}
          onCalculate={handleCalculate}
          onReset={handleReset}
        />

        {result ? (
          <>
            {hasErrors ? <ValidationPanel issues={result.issues} /> : null}
            {!hasErrors ? (
              <>
                <EdgeCasePanel result={result} />
                <EmployeeTable result={result} />
                <UnallocatedOrders result={result} />
              </>
            ) : null}
          </>
        ) : (
          <EmptyState
            salesUpload={salesUpload}
            timesheetUpload={timesheetUpload}
            uploadsReady={uploadsReady}
          />
        )}
      </main>
    </div>
  );
}

function AppSidebar() {
  const navItems = [
    { label: "Dashboard", icon: ChartPie, active: true },
    { label: "Payouts", icon: WalletCards },
    { label: "Employees", icon: Users },
    { label: "Reports", icon: FileText },
    { label: "Settings", icon: Settings }
  ];

  return (
    <aside className="app-sidebar" aria-label="Application navigation">
      <div className="brand-lockup">
        <span className="brand-mark">FT</span>
        <span>
          <strong>Fair Tips</strong>
          <small>Tip Distribution</small>
        </span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <a className={item.active ? "active" : ""} href="#" key={item.label}>
              <Icon aria-hidden="true" size={19} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="sidebar-support">
        <CircleHelp aria-hidden="true" size={18} />
        <strong>Need help?</strong>
        <span>Review uploads, payouts, and employee tips before export.</span>
      </div>
    </aside>
  );
}

function DashboardHeader({
  result,
  hasErrors,
  onLock,
  onExport
}: {
  result: CalculationResult | null;
  hasErrors: boolean;
  onLock: () => void;
  onExport: () => void;
}) {
  return (
    <section className="dashboard-header">
      <div className="dashboard-title">
        <div className="title-row">
          <h1>Weekly tip payout</h1>
          <span className={result && !hasErrors ? "review-pill ready" : "review-pill"}>
            {result && !hasErrors ? "Ready to review" : "Setup required"}
          </span>
        </div>
        <div className="period-control" aria-label="Pay period">
          <CalendarDays aria-hidden="true" size={17} />
          <span>{result ? formatDateRange(result) : "Current pay period"}</span>
          <button aria-label="Previous period" type="button">
            <ChevronLeft aria-hidden="true" size={17} />
          </button>
          <button aria-label="Next period" type="button">
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        </div>
      </div>

      <div className="dashboard-actions">
        <button className="icon-button" aria-label="Notifications" type="button">
          <Bell aria-hidden="true" size={18} />
        </button>
        <button className="secondary-button compact" type="button" onClick={onLock}>
          <LockKeyhole aria-hidden="true" size={17} />
          Lock week
        </button>
        <button
          className="primary-button compact"
          type="button"
          disabled={!result || hasErrors}
          onClick={onExport}
        >
          <Download aria-hidden="true" size={18} />
          Export Excel
        </button>
      </div>
    </section>
  );
}

function ExecutiveMetrics({ result }: { result: CalculationResult }) {
  const laborPercent =
    result.metrics.netSales === 0 ? "0%" : formatPercent(result.metrics.laborPercent);
  const payoutPercent =
    result.metrics.netSales === 0
      ? "0%"
      : formatPercent(result.metrics.totalAllocatedTips / result.metrics.netSales);
  const unallocatedPercent =
    result.metrics.totalTips + result.metrics.eventTips === 0
      ? "0%"
      : formatPercent(
          result.metrics.totalUnallocatedTips /
            (result.metrics.totalTips + result.metrics.eventTips)
        );
  const kpis = [
    {
      label: "Net Sales",
      value: formatCurrency(result.metrics.netSales),
      detail: "Restaurant revenue",
      icon: CircleDollarSign
    },
    {
      label: "Labor",
      value: laborPercent,
      detail: `${formatCurrency(result.metrics.totalLaborCost)} labor cost`,
      icon: Users
    },
    {
      label: "Total payout",
      value: formatCurrency(result.metrics.totalAllocatedTips),
      detail: `${payoutPercent} of net sales`,
      icon: WalletCards,
      featured: true
    },
    {
      label: "Unallocated",
      value: formatCurrency(result.metrics.totalUnallocatedTips),
      detail: `${unallocatedPercent} of tips`,
      icon: AlertTriangle,
      warning: result.metrics.totalUnallocatedTips > 0
    },
    {
      label: "Employees",
      value: String(result.metrics.employeesFound),
      detail: `${formatNumber(result.metrics.totalPaidHours)} total hours`,
      icon: Users
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
              kpi.warning ? "warning" : ""
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
          </div>
        );
      })}
    </section>
  );
}

function InsightGrid({ result }: { result: CalculationResult }) {
  const deliveryTotal =
    result.metrics.grubhubSales + result.metrics.doorDashSales + result.metrics.uberEatsSales;
  const cashGiftTotal = result.metrics.cashSales + result.metrics.giftCardSales;

  return (
    <section className="insight-grid" aria-label="Sales and payment insights">
      <SalesMixCard result={result} />
      <BreakdownCard
        title="Delivery Platforms"
        total={deliveryTotal}
        icon={Truck}
        rows={[
          ["Uber Eats", result.metrics.uberEatsSales],
          ["DoorDash", result.metrics.doorDashSales],
          ["Grubhub", result.metrics.grubhubSales]
        ]}
        footer={`${formatPercent(safeRatio(deliveryTotal, result.metrics.netSales))} of net sales`}
      />
      <BreakdownCard
        title="Credit & Debit"
        total={result.metrics.creditDebitSales}
        icon={CreditCard}
        rows={[["Card sales", result.metrics.creditDebitSales]]}
        footer={`${formatPercent(
          safeRatio(result.metrics.creditDebitSales, result.metrics.netSales)
        )} of net sales`}
      />
      <BreakdownCard
        title="Cash & Gift Cards"
        total={cashGiftTotal}
        icon={Banknote}
        rows={[
          ["Cash", result.metrics.cashSales],
          ["Gift Cards", result.metrics.giftCardSales]
        ]}
        footer={`${formatPercent(safeRatio(cashGiftTotal, result.metrics.netSales))} of net sales`}
      />
    </section>
  );
}

function SalesMixCard({ result }: { result: CalculationResult }) {
  const deliveryTotal =
    result.metrics.grubhubSales + result.metrics.doorDashSales + result.metrics.uberEatsSales;
  const cashGiftTotal = result.metrics.cashSales + result.metrics.giftCardSales;
  const knownTotal = deliveryTotal + result.metrics.creditDebitSales + cashGiftTotal;
  const otherTotal = Math.max(0, result.metrics.netSales - knownTotal);
  const total = Math.max(1, result.metrics.netSales || knownTotal);
  const deliveryEnd = safeRatio(deliveryTotal, total) * 100;
  const creditEnd = deliveryEnd + safeRatio(result.metrics.creditDebitSales, total) * 100;
  const cashEnd = creditEnd + safeRatio(cashGiftTotal, total) * 100;
  const donutStyle = {
    background: `conic-gradient(#075b4f 0 ${deliveryEnd}%, #2f9f79 ${deliveryEnd}% ${creditEnd}%, #dbe8df ${creditEnd}% ${cashEnd}%, #edf2ee ${cashEnd}% 100%)`
  };

  return (
    <section className="panel-card sales-mix-card">
      <div className="panel-heading">
        <h2>Sales mix</h2>
        <span>{formatCurrency(result.metrics.netSales)} net sales</span>
      </div>
      <div className="sales-mix-body">
        <div className="donut-chart" style={donutStyle} aria-hidden="true">
          <span />
        </div>
        <div className="mix-list">
          <MixRow label="Delivery Platforms" value={deliveryTotal} total={total} tone="delivery" />
          <MixRow
            label="Credit & Debit"
            value={result.metrics.creditDebitSales}
            total={total}
            tone="cards"
          />
          <MixRow label="Cash & Gift Cards" value={cashGiftTotal} total={total} tone="cash" />
          {otherTotal > 0 ? (
            <MixRow label="Other sales" value={otherTotal} total={total} tone="other" />
          ) : null}
        </div>
      </div>
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
  return (
    <div className="mix-row">
      <span>
        <i data-tone={tone} />
        {label}
      </span>
      <strong>{formatCurrency(value)}</strong>
      <small>{formatPercent(safeRatio(value, total))}</small>
    </div>
  );
}

function BreakdownCard({
  title,
  total,
  icon: Icon,
  rows,
  footer
}: {
  title: string;
  total: number;
  icon: typeof Truck;
  rows: Array<[string, number]>;
  footer: string;
}) {
  return (
    <section className="panel-card breakdown-card">
      <div className="breakdown-title">
        <span className="breakdown-icon">
          <Icon aria-hidden="true" size={20} />
        </span>
        <div>
          <h2>{title}</h2>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </div>
      <div className="breakdown-rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{formatCurrency(value)}</strong>
          </div>
        ))}
      </div>
      <footer>{footer}</footer>
    </section>
  );
}

function WorkflowGrid({
  salesUpload,
  timesheetUpload,
  uploadsReady,
  canCalculate,
  blockingUploadError,
  result,
  onSalesUpload,
  onTimesheetUpload,
  onCalculate,
  onReset
}: {
  salesUpload: UploadState;
  timesheetUpload: UploadState;
  uploadsReady: boolean;
  canCalculate: boolean;
  blockingUploadError: boolean;
  result: CalculationResult | null;
  onSalesUpload: (file: File | null) => void;
  onTimesheetUpload: (file: File | null) => void;
  onCalculate: () => void;
  onReset: () => void;
}) {
  return (
    <section className="workflow-grid" aria-label="Upload and payout workflow">
      <section className="panel-card upload-validate-card">
        <div className="panel-heading">
          <h2>Upload & validate</h2>
          <div className="step-tabs" aria-label="Workflow steps">
            <span className="active">1 Upload</span>
            <span className={uploadsReady ? "active" : ""}>2 Validate</span>
            <span className={result ? "active" : ""}>3 Review</span>
            <span>4 Payout</span>
          </div>
        </div>
        <div className="upload-row">
          <UploadPanel
            title="Sales report"
            upload={salesUpload}
            onUpload={onSalesUpload}
          />
          <UploadPanel
            title="Timesheet report"
            upload={timesheetUpload}
            onUpload={onTimesheetUpload}
          />
        </div>
        <div className="workflow-footer">
          <ValidationSnapshot result={result} uploadsReady={uploadsReady} />
          <div className="workflow-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!canCalculate || blockingUploadError}
              onClick={onCalculate}
            >
              <Calculator aria-hidden="true" size={18} />
              Calculate tips
            </button>
            <button className="secondary-button" type="button" onClick={onReset}>
              <RotateCcw aria-hidden="true" size={17} />
              Reset
            </button>
          </div>
        </div>
      </section>

      <PayoutProgress result={result} uploadsReady={uploadsReady} />
    </section>
  );
}

function ValidationSnapshot({
  result,
  uploadsReady
}: {
  result: CalculationResult | null;
  uploadsReady: boolean;
}) {
  if (!result) {
    return (
      <div className="validation-snapshot">
        <Upload aria-hidden="true" size={18} />
        <span>{uploadsReady ? "Reports ready to calculate" : "Waiting for both reports"}</span>
      </div>
    );
  }

  const errors = result.issues.filter((issue) => issue.severity === "error").length;
  const warnings = result.issues.filter((issue) => issue.severity === "warning").length;

  return (
    <div className={errors ? "validation-snapshot error" : "validation-snapshot ready"}>
      {errors ? (
        <AlertTriangle aria-hidden="true" size={18} />
      ) : (
        <CheckCircle2 aria-hidden="true" size={18} />
      )}
      <span>
        {errors ? `${errors} errors` : "Validation complete"}
        <small>
          {errors} errors, {warnings} warnings
        </small>
      </span>
    </div>
  );
}

function PayoutProgress({
  result,
  uploadsReady
}: {
  result: CalculationResult | null;
  uploadsReady: boolean;
}) {
  const hasErrors = result?.issues.some((issue) => issue.severity === "error") ?? false;
  const steps = [
    { label: "Data uploaded", status: uploadsReady ? "done" : "pending" },
    { label: "Validated", status: result && !hasErrors ? "done" : result ? "issue" : "pending" },
    { label: "Under review", status: result && !hasErrors ? "current" : "pending" },
    { label: "Payout ready", status: "pending" }
  ];

  return (
    <section className="panel-card payout-progress-card">
      <div className="panel-heading">
        <h2>Payout progress</h2>
        <span>{result && !hasErrors ? "In progress" : "Pending"}</span>
      </div>
      <div className="progress-track">
        {steps.map((step, index) => (
          <div className={`progress-step ${step.status}`} key={step.label}>
            <span>{step.status === "done" ? <Check aria-hidden="true" size={15} /> : index + 1}</span>
            <strong>{step.label}</strong>
            <small>
              {step.status === "done"
                ? "Complete"
                : step.status === "current"
                  ? "Review now"
                  : step.status === "issue"
                    ? "Needs fixes"
                    : "Pending"}
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsChecking(true);

    try {
      const response = await fetch("/api/unlock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password })
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };

      if (!response.ok || !data.ok) {
        setError(data.message || "Password is incorrect.");
        return;
      }

      onUnlock();
    } catch {
      setError("Unable to verify the password. Try again.");
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <main className="access-shell">
      <section className="password-card" aria-label="Password required">
        <span className="access-icon">
          <ShieldCheck aria-hidden="true" size={24} />
        </span>
        <div>
          <p className="eyebrow">Fair Tips</p>
          <h1>Manager access</h1>
          <p className="access-copy">
            Enter the app password to open the tip distribution dashboard.
          </p>
        </div>
        <form className="password-form" onSubmit={handleSubmit}>
          <label htmlFor="app-password">Password</label>
          <input
            id="app-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
          />
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" type="submit" disabled={!password || isChecking}>
            {isChecking ? "Checking..." : "Unlock dashboard"}
          </button>
        </form>
      </section>
    </main>
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

function EmptyState({
  salesUpload,
  timesheetUpload,
  uploadsReady
}: {
  salesUpload: UploadState;
  timesheetUpload: UploadState;
  uploadsReady: boolean;
}) {
  const waitingForSales = salesUpload.status === "idle";
  const waitingForTimesheet = timesheetUpload.status === "idle";
  const title = uploadsReady
    ? "Reports are ready"
    : waitingForSales && waitingForTimesheet
      ? "Ready for reports"
      : "One more report needed";
  const message = uploadsReady
    ? "Run the calculation to preview payouts before exporting."
    : waitingForSales && waitingForTimesheet
      ? "Upload the sales report and timesheet report to begin."
      : waitingForSales
        ? "Waiting for the sales report."
        : waitingForTimesheet
          ? "Waiting for the timesheet report."
          : "Fix the upload issue above, then calculate again.";

  return (
    <section className="empty-panel">
      <span className={uploadsReady ? "empty-icon ready" : "empty-icon"}>
        {uploadsReady ? (
          <FileCheck2 aria-hidden="true" size={22} />
        ) : (
          <FileSpreadsheet aria-hidden="true" size={22} />
        )}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{message}</small>
      </span>
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
  const totalSharePercent = result.metrics.totalAllocatedTips > 0 ? 1 : 0;
  const totalStoreHours = result.employees.reduce(
    (total, employee) => total + employee.storeHours,
    0
  );
  const totalEventHours = result.employees.reduce(
    (total, employee) => total + employee.eventHours,
    0
  );
  const visibleEmployees = useMemo(() => {
    const query = normalizeSearch(employeeQuery);
    if (!query) {
      return result.employees;
    }

    return result.employees.filter((employee) =>
      normalizeSearch(employee.employee).includes(query)
    );
  }, [employeeQuery, result.employees]);

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
              <td data-label="Employee">Total</td>
              <td data-label="Store hours" className="numeric">
                {formatNumber(totalStoreHours)}
              </td>
              <td data-label="Event hours" className="numeric">
                {formatNumber(totalEventHours)}
              </td>
              <td data-label="Total hours" className="numeric">
                {formatNumber(result.metrics.totalPaidHours)}
              </td>
              <td data-label="Store tips" className="numeric payout">
                {formatCurrency(result.metrics.allocatedTips)}
              </td>
              <td data-label="Event tips" className="numeric payout">
                {formatCurrency(result.metrics.eventAllocatedTips)}
              </td>
              <td data-label="Total tips" className="numeric payout">
                {formatCurrency(result.metrics.totalAllocatedTips)}
              </td>
              <td data-label="Share %" className="numeric">
                {formatPercent(totalSharePercent)}
              </td>
              <td data-label="Review">{result.metrics.employeesFound} employees</td>
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
          {errors.length} errors, {warnings.length} warnings
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
