import type { CalculationResult } from "./tip-calculator";
import { formatDateTime, roundMoney } from "./tip-calculator";
import * as XLSX from "xlsx";

export function exportTipWorkbook(result: CalculationResult) {
  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    ["Metric", "Value"],
    ["Total Tips In Sales Report", roundMoney(result.metrics.totalTips)],
    ["Allocated Tips", roundMoney(result.metrics.allocatedTips)],
    ["Unallocated Tips", roundMoney(result.metrics.unallocatedTips)],
    ["Orders With Tips", result.metrics.ordersWithTips],
    [
      "Orders With Tips And No Active Employee",
      result.metrics.ordersWithTipsAndNoActiveEmployee
    ],
    ["Total Paid Hours", roundMoney(result.metrics.totalPaidHours)],
    ["Employees Found", result.metrics.employeesFound],
    [],
    ["Employee", "Weekly Paid Hours", "Tip Share", "Share %", "Review"],
    ...result.employees.map((employee) => [
      employee.employee,
      roundMoney(employee.paidHours),
      roundMoney(employee.tipShare),
      employee.sharePercent,
      employee.review
    ]),
    [
      "Total",
      roundMoney(result.metrics.totalPaidHours),
      roundMoney(result.metrics.allocatedTips),
      result.metrics.allocatedTips > 0 ? 1 : 0,
      `${result.metrics.employeesFound} employees`
    ]
  ];

  const detailRows = [
    [
      "Order Date/Time",
      "Order ID",
      "Tip",
      "Active Staff",
      "Tip Per Person",
      "Status",
      "Payment State",
      "Tender",
      "Raw Row",
      "Active Employees"
    ],
    ...result.allocationDetails.map((detail) => [
      formatDateTime(detail.orderDate),
      detail.orderId,
      roundMoney(detail.tip),
      detail.activeStaff,
      roundMoney(detail.tipPerPerson),
      detail.status,
      detail.paymentState,
      detail.tender,
      detail.rowNumber,
      detail.activeEmployees.join(", ")
    ])
  ];

  const shiftRows = [
    ["Employee", "Clock In", "Clock Out", "Paid Hours", "Valid Shift?", "Raw Row"],
    ...result.shifts.map((shift) => [
      shift.employee,
      formatDateTime(shift.clockIn),
      formatDateTime(shift.clockOut),
      roundMoney(shift.paidHours),
      shift.valid ? "TRUE" : "FALSE",
      shift.rowNumber
    ])
  ];

  const issueRows = [
    ["Severity", "Source", "Row", "Field", "Message"],
    ...result.issues.map((issue) => [
      issue.severity,
      issue.source,
      issue.row ?? "",
      issue.field ?? "",
      issue.message
    ])
  ];

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(detailRows),
    "Tip Allocation Detail"
  );
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(shiftRows), "Shift Calc");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(issueRows), "Validation");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `tip-distribution-${today}.xlsx`, {
    compression: true
  });
}
