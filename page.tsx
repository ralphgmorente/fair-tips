"use client";

import {
  AlertTriangle,
  Calculator,
  ChevronDown,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
  Upload
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
    <main className="page-shell">
      <section className="app-header">
        <div>
          <p className="eyebrow">Clover Tip Distribution</p>
          <h1>Weekly tip payout</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-button compact" type="button" onClick={handleLock}>
            <LockKeyhole aria-hidden="true" size={17} />
            Lock
          </button>
          <button
            className="primary-button compact"
            type="button"
            disabled={!result || hasErrors}
            onClick={() => result && exportTipWorkbook(result)}
          >
            <Download aria-hidden="true" size={18} />
            Export Excel
          </button>
        </div>
      </section>

      <section className="upload-grid" aria-label="Report uploads">
        <UploadPanel
          title="Sales report"
          upload={salesUpload}
          onUpload={(file) => handleUpload("sales", file)}
        />
        <UploadPanel
          title="Timesheet report"
          upload={timesheetUpload}
          onUpload={(file) => handleUpload("timesheet", file)}
        />
        <section className="action-panel">
          <button
            className="primary-button"
            type="button"
            disabled={!canCalculate || blockingUploadError}
            onClick={handleCalculate}
          >
            <Calculator aria-hidden="true" size={18} />
            Calculate tips
          </button>
          <button className="secondary-button" type="button" onClick={handleReset}>
            <RotateCcw aria-hidden="true" size={17} />
            Reset
          </button>
        </section>
      </section>

      {result ? (
        <>
          <ValidationPanel issues={result.issues} />

          {!hasErrors ? (
            <>
              <MetricStrip result={result} />
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

function MetricStrip({ result }: { result: CalculationResult }) {
  const laborPercent =
    result.metrics.netSales === 0 ? "0%" : formatPercent(result.metrics.laborPercent);
  const dashboardCards: Array<{
    title: string;
    tone: string;
    rows: Array<{ label: string; value: string; featured?: boolean }>;
  }> = [
    {
      title: "Net Sales & Labor",
      tone: "primary",
      rows: [
        {
          label: "Net Sales",
          value: formatCurrency(result.metrics.netSales),
          featured: true
        },
        {
          label: "Labor",
          value: `${formatNumber(result.metrics.totalPaidHours)} hrs / ${formatCurrency(
            result.metrics.netSales
          )} = ${laborPercent}`
        }
      ]
    },
    {
      title: "Credit & Debit Sales",
      tone: "success",
      rows: [
        {
          label: "Credit & Debit",
          value: formatCurrency(result.metrics.creditDebitSales),
          featured: true
        }
      ]
    },
    {
      title: "Cash & Gift Cards",
      tone: "attention",
      rows: [
        {
          label: "Cash",
          value: formatCurrency(result.metrics.cashSales),
          featured: true
        },
        {
          label: "Gift Cards",
          value: formatCurrency(result.metrics.giftCardSales),
          featured: true
        }
      ]
    },
    {
      title: "Delivery Platforms",
      tone: "event",
      rows: [
        {
          label: "Grubhub",
          value: formatCurrency(result.metrics.grubhubSales)
        },
        {
          label: "DoorDash",
          value: formatCurrency(result.metrics.doorDashSales)
        },
        {
          label: "Uber Eats",
          value: formatCurrency(result.metrics.uberEatsSales)
        }
      ]
    }
  ];
  const metrics = [
    ["Total payout", formatCurrency(result.metrics.totalAllocatedTips), "success"],
    ["Store allocated", formatCurrency(result.metrics.allocatedTips), "primary"],
    ["Event allocated", formatCurrency(result.metrics.eventAllocatedTips), "event"],
    ["Unallocated", formatCurrency(result.metrics.totalUnallocatedTips), "attention"],
    ["Event sales", formatCurrency(result.metrics.eventSales), "event"],
    ["Event tips", formatCurrency(result.metrics.eventTips), "event"],
    ["Store orders", String(result.metrics.ordersWithTips), "neutral"],
    ["Event orders", String(result.metrics.eventOrdersWithTips), "neutral"],
    ["Employees", String(result.metrics.employeesFound), "neutral"]
  ];

  return (
    <section className="metric-strip" aria-label="Calculation summary">
      {dashboardCards.map((card) => (
        <div className="metric-tile metric-tile-stacked" data-tone={card.tone} key={card.title}>
          <span>{card.title}</span>
          <div className="metric-lines">
            {card.rows.map((row) => (
              <div className={row.featured ? "metric-line featured" : "metric-line"} key={row.label}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}
      {metrics.map(([label, value, tone]) => (
        <div className="metric-tile" data-tone={tone} key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
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
  const totalSharePercent = result.metrics.totalAllocatedTips > 0 ? 1 : 0;
  const totalStoreHours = result.employees.reduce(
    (total, employee) => total + employee.storeHours,
    0
  );
  const totalEventHours = result.employees.reduce(
    (total, employee) => total + employee.eventHours,
    0
  );

  return (
    <section className="table-panel">
      <div className="section-heading">
        <h2>Employee summary</h2>
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
            {result.employees.length === 0 ? (
              <tr>
                <td className="table-empty" colSpan={9}>
                  No employees were found in the timesheet report.
                </td>
              </tr>
            ) : (
              result.employees.map((employee) => (
                <tr key={employee.employee}>
                  <td data-label="Employee">
                    <strong>{employee.employee}</strong>
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
