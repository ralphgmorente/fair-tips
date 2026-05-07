"use client";

import {
  AlertTriangle,
  Calculator,
  ChevronDown,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  RotateCcw,
  Upload
} from "lucide-react";
import { useMemo, useState } from "react";
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
  const [salesUpload, setSalesUpload] = useState<UploadState>(emptyUpload);
  const [timesheetUpload, setTimesheetUpload] = useState<UploadState>(emptyUpload);
  const [result, setResult] = useState<CalculationResult | null>(null);

  const uploadsReady = salesUpload.status === "ready" && timesheetUpload.status === "ready";
  const canCalculate = uploadsReady;
  const hasErrors = result?.issues.some((issue) => issue.severity === "error") ?? false;
  const blockingUploadError = Boolean(salesUpload.error || timesheetUpload.error);

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

  return (
    <main className="page-shell">
      <section className="app-header">
        <div>
          <p className="eyebrow">Clover Tip Distribution</p>
          <h1>Weekly tip payout</h1>
        </div>
        <button
          className="primary-button compact"
          type="button"
          disabled={!result || hasErrors}
          onClick={() => result && exportTipWorkbook(result)}
        >
          <Download aria-hidden="true" size={18} />
          Export Excel
        </button>
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
  const metrics = [
    ["Total tips", formatCurrency(result.metrics.totalTips), "primary"],
    ["Allocated", formatCurrency(result.metrics.allocatedTips), "success"],
    ["Unallocated", formatCurrency(result.metrics.unallocatedTips), "attention"],
    ["Tipped orders", String(result.metrics.ordersWithTips), "neutral"],
    ["Employees", String(result.metrics.employeesFound), "neutral"]
  ];

  return (
    <section className="metric-strip" aria-label="Calculation summary">
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
  if (result.metrics.totalTips === 0) {
    return (
      <section className="notice-panel">
        <AlertTriangle aria-hidden="true" size={18} />
        <span>No tipped orders were found in the sales report.</span>
      </section>
    );
  }

  if (result.metrics.allocatedTips === 0) {
    return (
      <section className="notice-panel">
        <AlertTriangle aria-hidden="true" size={18} />
        <span>Tips were found, but no tipped orders matched active shifts.</span>
      </section>
    );
  }

  if (result.metrics.unallocatedTips === 0) {
    return (
      <section className="notice-panel success">
        <CheckCircle2 aria-hidden="true" size={18} />
        <span>All tipped orders matched active shifts.</span>
      </section>
    );
  }

  return (
    <section className="notice-panel warning">
      <AlertTriangle aria-hidden="true" size={18} />
      <span>
        {formatCurrency(result.metrics.unallocatedTips)} needs manager review before payout.
      </span>
    </section>
  );
}

function EmployeeTable({ result }: { result: CalculationResult }) {
  const totalSharePercent = result.metrics.allocatedTips > 0 ? 1 : 0;

  return (
    <section className="table-panel">
      <div className="section-heading">
        <h2>Employee summary</h2>
        <span>
          {formatCurrency(result.metrics.allocatedTips)} allocated across{" "}
          {result.metrics.employeesFound} employees
        </span>
      </div>
      <div className="table-scroll">
        <table className="summary-table">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Weekly paid hours</th>
              <th>Tip share</th>
              <th>Share %</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>
            {result.employees.length === 0 ? (
              <tr>
                <td className="table-empty" colSpan={5}>
                  No employees were found in the timesheet report.
                </td>
              </tr>
            ) : (
              result.employees.map((employee) => (
                <tr key={employee.employee}>
                  <td data-label="Employee">
                    <strong>{employee.employee}</strong>
                  </td>
                  <td data-label="Weekly paid hours" className="numeric">
                    {formatNumber(employee.paidHours)}
                  </td>
                  <td data-label="Tip share" className="numeric payout">
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
              <td data-label="Weekly paid hours" className="numeric">
                {formatNumber(result.metrics.totalPaidHours)}
              </td>
              <td data-label="Tip share" className="numeric payout">
                {formatCurrency(result.metrics.allocatedTips)}
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
        <span>{formatCurrency(result.metrics.unallocatedTips)}</span>
      </div>
      <div className="table-scroll">
        <table className="detail-table">
          <thead>
            <tr>
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
