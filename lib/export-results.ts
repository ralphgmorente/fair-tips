import type { CalculationResult } from "./tip-calculator";
import { formatDateTime, roundMoney } from "./tip-calculator";
import * as XLSX from "xlsx";

export function exportTipWorkbook(result: CalculationResult) {
  const workbook = XLSX.utils.book_new();

  const summaryRows = [
    ["Metric", "Value"],
    ["Total Payout", roundMoney(result.metrics.totalAllocatedTips)],
    ["Total Unallocated Tips", roundMoney(result.metrics.totalUnallocatedTips)],
    ["Store Tips", roundMoney(result.metrics.totalTips)],
    ["Store Allocated Tips", roundMoney(result.metrics.allocatedTips)],
    ["Store Unallocated Tips", roundMoney(result.metrics.unallocatedTips)],
    ["Store Orders With Tips", result.metrics.ordersWithTips],
    [
      "Store Orders With Tips And No Active Employee",
      result.metrics.ordersWithTipsAndNoActiveEmployee
    ],
    ["Event Sales", roundMoney(result.metrics.eventSales)],
    ["Event Tips", roundMoney(result.metrics.eventTips)],
    ["Event Allocated Tips", roundMoney(result.metrics.eventAllocatedTips)],
    ["Event Unallocated Tips", roundMoney(result.metrics.eventUnallocatedTips)],
    ["Event Orders", result.metrics.eventOrders],
    ["Event Orders With Tips", result.metrics.eventOrdersWithTips],
    [
      "Event Orders With Tips And No Active Employee",
      result.metrics.eventOrdersWithTipsAndNoActiveEmployee
    ],
    ["Total Paid Hours", roundMoney(result.metrics.totalPaidHours)],
    ["Employees Found", result.metrics.employeesFound],
    [],
    [
      "Employee",
      "Store Hours",
      "Event Hours",
      "Weekly Paid Hours",
      "Store Tips",
      "Event Tips",
      "Total Tip Share",
      "Share %",
      "Review"
    ],
    ...result.employees.map((employee) => [
      employee.employee,
      roundMoney(employee.storeHours),
      roundMoney(employee.eventHours),
      roundMoney(employee.paidHours),
      roundMoney(employee.storeTipShare),
      roundMoney(employee.eventTipShare),
      roundMoney(employee.tipShare),
      employee.sharePercent,
      employee.review
    ]),
    [
      "Total",
      roundMoney(result.employees.reduce((total, employee) => total + employee.storeHours, 0)),
      roundMoney(result.employees.reduce((total, employee) => total + employee.eventHours, 0)),
      roundMoney(result.metrics.totalPaidHours),
      roundMoney(result.metrics.allocatedTips),
      roundMoney(result.metrics.eventAllocatedTips),
      roundMoney(result.metrics.totalAllocatedTips),
      result.metrics.totalAllocatedTips > 0 ? 1 : 0,
      `${result.metrics.employeesFound} employees`
    ]
  ];

  const detailRows = [
    [
      "Pool",
      "Order Date/Time",
      "Order ID",
      "Order Number",
      "Order Total",
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
      detail.pool === "event" ? "Event" : "Store",
      formatDateTime(detail.orderDate),
      detail.orderId,
      detail.orderNumber,
      roundMoney(detail.orderTotal),
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

  const eventRows = [
    [
      "Order Date/Time",
      "Order ID",
      "Order Number",
      "Order Total",
      "Tip",
      "Active Event Staff",
      "Tip Per Person",
      "Allocated Tip",
      "Status",
      "Payment State",
      "Tender",
      "Raw Row",
      "Active Event Employees"
    ],
    ...result.allocationDetails
      .filter((detail) => detail.pool === "event")
      .map((detail) => [
        formatDateTime(detail.orderDate),
        detail.orderId,
        detail.orderNumber,
        roundMoney(detail.orderTotal),
        roundMoney(detail.tip),
        detail.activeStaff,
        roundMoney(detail.tipPerPerson),
        roundMoney(detail.allocatedTip),
        detail.status,
        detail.paymentState,
        detail.tender,
        detail.rowNumber,
        detail.activeEmployees.join(", ")
      ])
  ];

  const shiftRows = [
    [
      "Employee",
      "Role",
      "Work Area",
      "Clock In",
      "Clock Out",
      "Paid Hours",
      "Valid Shift?",
      "Raw Row"
    ],
    ...result.shifts.map((shift) => [
      shift.employee,
      shift.role,
      shift.isEventRole ? "Event" : "Store",
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
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(eventRows), "Event Sales");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(shiftRows), "Shift Calc");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(issueRows), "Validation");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `tip-distribution-${today}.xlsx`, {
    compression: true
  });
}
