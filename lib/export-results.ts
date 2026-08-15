import type { CalculationResult } from "./tip-calculator";
import { formatCurrency, formatDateTime, formatPercent, roundMoney } from "./tip-calculator";
import * as XLSX from "xlsx-js-style";

type SheetCell = XLSX.CellObject;
type SheetStyle = Record<string, unknown>;
type WorkbookCellValue = string | number | boolean | Date | null;
type SheetRows = WorkbookCellValue[][];

const CURRENCY_FORMAT = '"$"#,##0.00';
const HOURS_FORMAT = '#,##0.00';
const INTEGER_FORMAT = '#,##0';
const PERCENT_FORMAT = '0.0%';

const COLORS = {
  accentDark: "06483D",
  accent: "0F7C67",
  accentSoft: "E5F5EF",
  surfaceStrong: "EEF4F0",
  line: "DCE6E0",
  ink: "111D18",
  inkSoft: "2D3B35",
  muted: "65736D",
  white: "FFFFFF",
  warningSoft: "FFF4DF",
  warning: "A85D09"
};

const thinBorder = {
  style: "thin",
  color: { rgb: COLORS.line }
};

const styles = {
  sheetBase: {
    font: { color: { rgb: COLORS.ink } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.white } }
  },
  title: {
    font: { bold: true, sz: 24, color: { rgb: COLORS.white } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.accentDark } },
    alignment: { vertical: "center" }
  },
  subtitle: {
    font: { bold: true, sz: 14, color: { rgb: COLORS.accentDark } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.accentSoft } },
    alignment: { vertical: "center" }
  },
  muted: {
    font: { color: { rgb: COLORS.muted } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.accentSoft } }
  },
  cardLabel: {
    font: { bold: true, color: { rgb: COLORS.inkSoft } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.surfaceStrong } },
    border: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder }
  },
  cardValue: {
    font: { bold: true, sz: 18, color: { rgb: COLORS.ink } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.white } },
    alignment: { vertical: "center" },
    border: { left: thinBorder, right: thinBorder }
  },
  featuredValue: {
    font: { bold: true, sz: 18, color: { rgb: COLORS.white } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.accent } },
    alignment: { vertical: "center" },
    border: { left: thinBorder, right: thinBorder }
  },
  cardDetail: {
    font: { color: { rgb: COLORS.muted } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.white } },
    border: { bottom: thinBorder, left: thinBorder, right: thinBorder }
  },
  section: {
    font: { bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.accentDark } },
    alignment: { vertical: "center" }
  },
  tableHeader: {
    font: { bold: true, color: { rgb: COLORS.white } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.accent } },
    alignment: { vertical: "center" },
    border: { top: thinBorder, bottom: thinBorder }
  },
  tableCell: {
    font: { color: { rgb: COLORS.ink } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.white } },
    border: { bottom: thinBorder }
  },
  totalRow: {
    font: { bold: true, color: { rgb: COLORS.ink } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.accentSoft } },
    border: { top: thinBorder, bottom: thinBorder }
  },
  warning: {
    font: { bold: true, color: { rgb: COLORS.warning } },
    fill: { patternType: "solid", fgColor: { rgb: COLORS.warningSoft } }
  }
} satisfies Record<string, SheetStyle>;

export function exportTipWorkbook(result: CalculationResult) {
  const workbook = createTipWorkbook(result);

  XLSX.writeFile(workbook, getTipWorkbookFileName(result), {
    compression: true,
    bookType: "xlsx"
  });
}

export function createTipWorkbook(result: CalculationResult): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, createDashboardSheet(result), "Dashboard");
  XLSX.utils.book_append_sheet(workbook, createTipsSheet(result), "Tips");

  workbook.Props = {
    Title: "ShiftFlow Weekly Business Report",
    Subject: formatReportDateRange(result),
    Author: "ShiftFlow",
    Company: "ShiftFlow",
    CreatedDate: getReportStartDate(result) ?? new Date()
  };

  return workbook;
}

export function getTipWorkbookFileName(result: CalculationResult, businessName?: string): string {
  const reportDate = getReportStartDate(result) ?? new Date();
  const prefix = businessName ? `${businessName}_` : "";
  return sanitizeFileName(`${prefix}ShiftFlow_Weekly_Report_${formatDateSlug(reportDate)}.xlsx`);
}

function createDashboardSheet(result: CalculationResult): XLSX.WorkSheet {
  const salesMixRows = getSalesMixRows(result);
  const deliveryRows = getDeliveryRows(result);
  const parallelRows = buildParallelRows(salesMixRows, deliveryRows, result.metrics.netSales);
  const cashGiftTotal = result.metrics.cashSales + result.metrics.giftCardSales;
  const laborPercent =
    result.metrics.netSales === 0 ? 0 : result.metrics.laborPercent;
  const payoutPercent =
    result.metrics.netSales === 0
      ? 0
      : result.metrics.totalAllocatedTips / result.metrics.netSales;

  const salesDataStartRow = 11;
  const salesDataEndRow = salesDataStartRow + parallelRows.length - 1;
  const paymentSectionRow = salesDataEndRow + 2;
  const paymentHeaderRow = paymentSectionRow + 1;
  const paymentDataStartRow = paymentHeaderRow + 1;
  const creditTotalRow = paymentDataStartRow + 1;
  const cashGiftTotalRow = paymentDataStartRow + 2;
  const rows: SheetRows = [
    ["ShiftFlow", null, null, null, null, null, null, null, null],
    ["Weekly Business Report", null, null, null, null, null, null, null, null],
    [formatReportDateRange(result), null, null, null, null, null, null, null, null],
    [],
    ["Net Sales", null, null, "Labor", null, null, "Total Payout", null, null],
    [
      roundMoney(result.metrics.netSales),
      null,
      null,
      laborPercent,
      null,
      null,
      roundMoney(result.metrics.totalAllocatedTips),
      null,
      null
    ],
    [
      "Restaurant revenue",
      null,
      null,
      `${formatCurrency(result.metrics.totalLaborCost)} labor cost`,
      null,
      null,
      `${formatPercent(payoutPercent)} of net sales`,
      null,
      null
    ],
    [],
    ["Sales Mix", null, null, null, "Delivery Platforms", null, null],
    ["Category", "Amount", "Percentage", null, "Platform", "Amount", "% of Net Sales"],
    ...parallelRows,
    [],
    ["Credit & Debit", null, null, null, "Cash & Gift Cards", null, null],
    ["Category", "Amount", "Percentage", null, "Category", "Amount", "Percentage"],
    [
      "Card sales",
      roundMoney(result.metrics.creditDebitSales),
      safeRatio(result.metrics.creditDebitSales, result.metrics.netSales),
      null,
      "Cash",
      roundMoney(result.metrics.cashSales),
      safeRatio(result.metrics.cashSales, result.metrics.netSales)
    ],
    [
      "Total",
      roundMoney(result.metrics.creditDebitSales),
      safeRatio(result.metrics.creditDebitSales, result.metrics.netSales),
      null,
      "Gift Cards",
      roundMoney(result.metrics.giftCardSales),
      safeRatio(result.metrics.giftCardSales, result.metrics.netSales)
    ],
    [
      null,
      null,
      null,
      null,
      "Total",
      roundMoney(cashGiftTotal),
      safeRatio(cashGiftTotal, result.metrics.netSales)
    ]
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 24 },
    { wch: 16 },
    { wch: 13 },
    { wch: 4 },
    { wch: 22 },
    { wch: 16 },
    { wch: 13 },
    { wch: 4 },
    { wch: 4 }
  ];
  worksheet["!rows"] = [
    { hpt: 30 },
    { hpt: 22 },
    { hpt: 20 },
    { hpt: 8 },
    { hpt: 22 },
    { hpt: 30 },
    { hpt: 24 },
    { hpt: 8 },
    { hpt: 22 }
  ];

  addMerges(worksheet, [
    "A1:I1",
    "A2:I2",
    "A3:I3",
    "A5:C5",
    "D5:F5",
    "G5:I5",
    "A6:C6",
    "D6:F6",
    "G6:I6",
    "A7:C7",
    "D7:F7",
    "G7:I7",
    "A9:C9",
    "E9:G9",
    `A${paymentSectionRow}:C${paymentSectionRow}`,
    `E${paymentSectionRow}:G${paymentSectionRow}`
  ]);

  applyRangeStyle(worksheet, `A1:I${cashGiftTotalRow}`, styles.sheetBase);
  applyRangeStyle(worksheet, "A1:I1", styles.title);
  applyRangeStyle(worksheet, "A2:I2", styles.subtitle);
  applyRangeStyle(worksheet, "A3:I3", styles.muted);
  applyRangeStyle(worksheet, "A5:C5", styles.cardLabel);
  applyRangeStyle(worksheet, "D5:F5", styles.cardLabel);
  applyRangeStyle(worksheet, "G5:I5", styles.cardLabel);
  applyRangeStyle(worksheet, "A6:C6", styles.cardValue, CURRENCY_FORMAT);
  applyRangeStyle(worksheet, "D6:F6", styles.cardValue, PERCENT_FORMAT);
  applyRangeStyle(worksheet, "G6:I6", styles.featuredValue, CURRENCY_FORMAT);
  applyRangeStyle(worksheet, "A7:C7", styles.cardDetail);
  applyRangeStyle(worksheet, "D7:F7", styles.cardDetail);
  applyRangeStyle(worksheet, "G7:I7", styles.cardDetail);
  applyRangeStyle(worksheet, "A9:C9", styles.section);
  applyRangeStyle(worksheet, "E9:G9", styles.section);
  applyRangeStyle(worksheet, "A10:C10", styles.tableHeader);
  applyRangeStyle(worksheet, "E10:G10", styles.tableHeader);
  applyRangeStyle(worksheet, `A${salesDataStartRow}:C${salesDataEndRow}`, styles.tableCell);
  applyRangeStyle(worksheet, `E${salesDataStartRow}:G${salesDataEndRow}`, styles.tableCell);
  applyRangeStyle(worksheet, `A${paymentSectionRow}:C${paymentSectionRow}`, styles.section);
  applyRangeStyle(worksheet, `E${paymentSectionRow}:G${paymentSectionRow}`, styles.section);
  applyRangeStyle(worksheet, `A${paymentHeaderRow}:C${paymentHeaderRow}`, styles.tableHeader);
  applyRangeStyle(worksheet, `E${paymentHeaderRow}:G${paymentHeaderRow}`, styles.tableHeader);
  applyRangeStyle(worksheet, `A${paymentDataStartRow}:C${creditTotalRow}`, styles.tableCell);
  applyRangeStyle(worksheet, `E${paymentDataStartRow}:G${cashGiftTotalRow}`, styles.tableCell);
  applyRangeStyle(worksheet, `A${creditTotalRow}:C${creditTotalRow}`, styles.totalRow);
  applyRangeStyle(worksheet, `E${cashGiftTotalRow}:G${cashGiftTotalRow}`, styles.totalRow);
  applyNumberFormat(
    worksheet,
    [
      `B${salesDataStartRow}:B${salesDataEndRow}`,
      `F${salesDataStartRow}:F${salesDataEndRow}`,
      `B${paymentDataStartRow}:B${creditTotalRow}`,
      `F${paymentDataStartRow}:F${cashGiftTotalRow}`
    ],
    CURRENCY_FORMAT
  );
  applyNumberFormat(
    worksheet,
    [
      `C${salesDataStartRow}:C${salesDataEndRow}`,
      `G${salesDataStartRow}:G${salesDataEndRow}`,
      `C${paymentDataStartRow}:C${creditTotalRow}`,
      `G${paymentDataStartRow}:G${cashGiftTotalRow}`
    ],
    PERCENT_FORMAT
  );

  return worksheet;
}

function createTipsSheet(result: CalculationResult): XLSX.WorkSheet {
  const totalStoreHours = result.employees.reduce(
    (total, employee) => total + employee.storeHours,
    0
  );
  const totalEventHours = result.employees.reduce(
    (total, employee) => total + employee.eventHours,
    0
  );
  const unallocated = result.allocationDetails.filter(
    (detail) => detail.tip > 0 && detail.activeStaff === 0
  );
  const employeeHeaderRow = 9;
  const employeeRows = result.employees.map((employee) => [
    employee.employee,
    roundMoney(employee.storeHours),
    roundMoney(employee.eventHours),
    roundMoney(employee.paidHours),
    roundMoney(employee.storeTipShare),
    roundMoney(employee.eventTipShare),
    roundMoney(employee.tipShare),
    employee.sharePercent,
    employee.review || "Ready to pay"
  ]);
  const employeeTotalRow = [
    "Total",
    roundMoney(totalStoreHours),
    roundMoney(totalEventHours),
    roundMoney(result.metrics.totalPaidHours),
    roundMoney(result.metrics.allocatedTips),
    roundMoney(result.metrics.eventAllocatedTips),
    roundMoney(result.metrics.totalAllocatedTips),
    result.metrics.totalAllocatedTips > 0 ? 1 : 0,
    `${result.metrics.employeesFound} employees`
  ];
  const unallocatedHeaderRow = employeeHeaderRow + employeeRows.length + 3;
  const rows: SheetRows = [
    ["ShiftFlow", null, null, null, null, null, null, null, null],
    ["Weekly Tip Distribution", null, null, null, null, null, null, null, null],
    [formatReportDateRange(result), null, null, null, null, null, null, null, null],
    [],
    ["Tip Summary", null, null, null, null, null, null, null, null],
    [
      "Total Hours",
      roundMoney(result.metrics.totalPaidHours),
      "Store Tips",
      roundMoney(result.metrics.allocatedTips),
      "Event Tips",
      roundMoney(result.metrics.eventAllocatedTips),
      "Total Tips",
      roundMoney(result.metrics.totalAllocatedTips),
      null
    ],
    [
      "Unallocated Tips",
      roundMoney(result.metrics.totalUnallocatedTips),
      "Employees",
      result.metrics.employeesFound,
      "Store Hours",
      roundMoney(totalStoreHours),
      "Event Hours",
      roundMoney(totalEventHours),
      null
    ],
    [],
    [
      "Employee",
      "Store Hours",
      "Event Hours",
      "Total Hours",
      "Store Tips",
      "Event Tips",
      "Total Tips",
      "Share %",
      "Review Status"
    ],
    ...employeeRows,
    employeeTotalRow,
    [],
    ["Unallocated Orders", null, null, null, null, null, null, null, null],
    unallocated.length
      ? ["Pool", "Order Date/Time", "Order ID", "Tip", "Status", "Raw Row", null, null, null]
      : ["None", "All tipped orders matched active shifts by role.", null, null, null, null, null, null, null],
    ...unallocated.map((detail) => [
      detail.pool === "event" ? "Event" : "Store",
      formatDateTime(detail.orderDate),
      detail.orderId || "Blank",
      roundMoney(detail.tip),
      detail.status,
      detail.rowNumber,
      null,
      null,
      null
    ])
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [
    { wch: 26 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 11 },
    { wch: 28 }
  ];
  worksheet["!rows"] = [
    { hpt: 30 },
    { hpt: 22 },
    { hpt: 20 },
    { hpt: 8 },
    { hpt: 22 },
    { hpt: 22 },
    { hpt: 22 },
    { hpt: 8 },
    { hpt: 22 }
  ];
  worksheet["!autofilter"] = {
    ref: `A${employeeHeaderRow}:I${employeeHeaderRow + employeeRows.length + 1}`
  };
  worksheet["!freeze"] = {
    xSplit: 0,
    ySplit: employeeHeaderRow,
    topLeftCell: `A${employeeHeaderRow + 1}`,
    activePane: "bottomLeft",
    state: "frozen"
  };

  addMerges(worksheet, ["A1:I1", "A2:I2", "A3:I3", "A5:I5", `A${unallocatedHeaderRow}:I${unallocatedHeaderRow}`]);
  applyRangeStyle(worksheet, `A1:I${unallocatedHeaderRow + 1 + Math.max(unallocated.length, 1)}`, styles.sheetBase);
  applyRangeStyle(worksheet, "A1:I1", styles.title);
  applyRangeStyle(worksheet, "A2:I2", styles.subtitle);
  applyRangeStyle(worksheet, "A3:I3", styles.muted);
  applyRangeStyle(worksheet, "A5:I5", styles.section);
  applyRangeStyle(worksheet, "A6:H7", styles.tableCell);
  applyRangeStyle(worksheet, `A${employeeHeaderRow}:I${employeeHeaderRow}`, styles.tableHeader);
  applyRangeStyle(
    worksheet,
    `A${employeeHeaderRow + 1}:I${employeeHeaderRow + employeeRows.length}`,
    styles.tableCell
  );
  applyRangeStyle(
    worksheet,
    `A${employeeHeaderRow + employeeRows.length + 1}:I${employeeHeaderRow + employeeRows.length + 1}`,
    styles.totalRow
  );
  applyRangeStyle(worksheet, `A${unallocatedHeaderRow}:I${unallocatedHeaderRow}`, styles.section);

  if (unallocated.length) {
    applyRangeStyle(worksheet, `A${unallocatedHeaderRow + 1}:F${unallocatedHeaderRow + 1}`, styles.tableHeader);
    applyRangeStyle(
      worksheet,
      `A${unallocatedHeaderRow + 2}:F${unallocatedHeaderRow + 1 + unallocated.length}`,
      styles.warning
    );
    applyNumberFormat(worksheet, [`D${unallocatedHeaderRow + 2}:D${unallocatedHeaderRow + 1 + unallocated.length}`], CURRENCY_FORMAT);
    applyNumberFormat(worksheet, [`F${unallocatedHeaderRow + 2}:F${unallocatedHeaderRow + 1 + unallocated.length}`], INTEGER_FORMAT);
  } else {
    applyRangeStyle(worksheet, `A${unallocatedHeaderRow + 1}:I${unallocatedHeaderRow + 1}`, styles.tableCell);
  }

  applyNumberFormat(worksheet, ["B6", "F7", "H7"], HOURS_FORMAT);
  applyNumberFormat(worksheet, ["D7"], INTEGER_FORMAT);
  applyNumberFormat(worksheet, ["D6", "F6", "H6", "B7"], CURRENCY_FORMAT);
  applyNumberFormat(
    worksheet,
    [
      `B${employeeHeaderRow + 1}:D${employeeHeaderRow + employeeRows.length + 1}`
    ],
    HOURS_FORMAT
  );
  applyNumberFormat(
    worksheet,
    [
      `E${employeeHeaderRow + 1}:G${employeeHeaderRow + employeeRows.length + 1}`
    ],
    CURRENCY_FORMAT
  );
  applyNumberFormat(
    worksheet,
    [
      `H${employeeHeaderRow + 1}:H${employeeHeaderRow + employeeRows.length + 1}`
    ],
    PERCENT_FORMAT
  );

  return worksheet;
}

function buildParallelRows(
  leftRows: Array<[string, number, number]>,
  rightRows: Array<[string, number, number]>,
  netSales: number
): SheetRows {
  const rowCount = Math.max(leftRows.length, rightRows.length);

  return Array.from({ length: rowCount }, (_, index) => {
    const left = leftRows[index];
    const right = rightRows[index];
    return [
      left?.[0] ?? null,
      left ? roundMoney(left[1]) : null,
      left?.[2] ?? null,
      null,
      right?.[0] ?? null,
      right ? roundMoney(right[1]) : null,
      right ? safeRatio(right[1], netSales) : null
    ];
  });
}

function getSalesMixRows(result: CalculationResult): Array<[string, number, number]> {
  const deliveryTotal =
    result.metrics.grubhubSales + result.metrics.doorDashSales + result.metrics.uberEatsSales;
  const cashGiftTotal = result.metrics.cashSales + result.metrics.giftCardSales;
  const knownTotal = deliveryTotal + result.metrics.creditDebitSales + cashGiftTotal;
  const otherTotal = roundMoney(Math.max(0, result.metrics.netSales - knownTotal));
  const total = Math.max(1, result.metrics.netSales || knownTotal);
  const rows: Array<[string, number, number]> = [
    ["Delivery Platforms", deliveryTotal, safeRatio(deliveryTotal, total)],
    ["Credit & Debit", result.metrics.creditDebitSales, safeRatio(result.metrics.creditDebitSales, total)],
    ["Cash & Gift Cards", cashGiftTotal, safeRatio(cashGiftTotal, total)]
  ];

  if (otherTotal > 0) {
    rows.push(["Other sales", otherTotal, safeRatio(otherTotal, total)]);
  }

  return rows;
}

function getDeliveryRows(result: CalculationResult): Array<[string, number, number]> {
  return [
    ["Uber Eats", result.metrics.uberEatsSales, 0],
    ["DoorDash", result.metrics.doorDashSales, 0],
    ["Grubhub", result.metrics.grubhubSales, 0]
  ];
}

function safeRatio(value: number, total: number): number {
  return total === 0 ? 0 : value / total;
}

function addMerges(worksheet: XLSX.WorkSheet, ranges: string[]) {
  worksheet["!merges"] = worksheet["!merges"] ?? [];
  ranges.forEach((range) => {
    worksheet["!merges"]?.push(XLSX.utils.decode_range(range));
  });
}

function applyRangeStyle(
  worksheet: XLSX.WorkSheet,
  range: string,
  style: SheetStyle,
  numberFormat?: string
) {
  const decoded = XLSX.utils.decode_range(range);

  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = ensureCell(worksheet, address);
      cell.s = { ...(cell.s ?? {}), ...style };
      if (numberFormat) {
        cell.z = numberFormat;
      }
    }
  }
}

function applyNumberFormat(worksheet: XLSX.WorkSheet, ranges: string[], numberFormat: string) {
  ranges.forEach((range) => {
    const decoded = XLSX.utils.decode_range(range);
    for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
      for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[address] as SheetCell | undefined;
        if (cell) {
          cell.z = numberFormat;
        }
      }
    }
  });
}

function ensureCell(worksheet: XLSX.WorkSheet, address: string): SheetCell {
  const existing = worksheet[address] as SheetCell | undefined;
  if (existing) {
    return existing;
  }

  worksheet[address] = { t: "s", v: "" };
  return worksheet[address] as SheetCell;
}

function formatReportDateRange(result: CalculationResult): string {
  const dates = getSortedReportDates(result);

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

function getReportStartDate(result: CalculationResult): Date | null {
  return getSortedReportDates(result)[0] ?? null;
}

function getSortedReportDates(result: CalculationResult): Date[] {
  return result.salesOrders
    .map((order) => order.orderDate)
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());
}

function formatDateSlug(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
