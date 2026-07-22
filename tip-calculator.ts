export type CellValue = string | number | boolean | Date | null | undefined;
export type Grid = CellValue[][];

export type IssueSeverity = "error" | "warning";
export type IssueSource = "sales" | "timesheet" | "calculation";
export type TipPool = "store" | "event";

export type ValidationIssue = {
  severity: IssueSeverity;
  source: IssueSource;
  message: string;
  row?: number;
  field?: string;
};

export type SalesOrder = {
  rowNumber: number;
  orderDate: Date | null;
  orderId: string;
  orderNumber: string;
  grossSales: number;
  discounts: number;
  refunds: number;
  taxes: number;
  netSales: number;
  orderTotal: number;
  paymentTotal: number;
  tip: number;
  paymentState: string;
  tender: string;
  paymentNote: string;
  orderType: string;
  note: string;
  rawDate: string;
  isEvent: boolean;
};

export type Shift = {
  rowNumber: number;
  employee: string;
  role: string;
  isEventRole: boolean;
  clockIn: Date | null;
  clockOut: Date | null;
  paidHours: number;
  valid: boolean;
};

export type AllocationDetail = {
  pool: TipPool;
  rowNumber: number;
  orderDate: Date | null;
  orderId: string;
  orderNumber: string;
  orderTotal: number;
  tip: number;
  activeEmployees: string[];
  activeStaff: number;
  tipPerPerson: number;
  allocatedTip: number;
  paymentState: string;
  tender: string;
  status: string;
};

export type EmployeeSummary = {
  employee: string;
  paidHours: number;
  storeHours: number;
  eventHours: number;
  storeTipShare: number;
  eventTipShare: number;
  tipShare: number;
  sharePercent: number;
  review: string;
  shiftCount: number;
};

export type SummaryMetrics = {
  totalTips: number;
  allocatedTips: number;
  unallocatedTips: number;
  ordersWithTips: number;
  ordersWithTipsAndNoActiveEmployee: number;
  totalPaidHours: number;
  employeesFound: number;
  netSales: number;
  laborPercent: number;
  creditDebitSales: number;
  cashSales: number;
  giftCardSales: number;
  grubhubSales: number;
  doorDashSales: number;
  uberEatsSales: number;
  eventSales: number;
  eventTips: number;
  eventAllocatedTips: number;
  eventUnallocatedTips: number;
  eventOrders: number;
  eventOrdersWithTips: number;
  eventOrdersWithTipsAndNoActiveEmployee: number;
  totalAllocatedTips: number;
  totalUnallocatedTips: number;
};

export type CalculationResult = {
  metrics: SummaryMetrics;
  employees: EmployeeSummary[];
  allocationDetails: AllocationDetail[];
  salesOrders: SalesOrder[];
  shifts: Shift[];
  issues: ValidationIssue[];
};

const EVENT_ORDER_NUMBER = "CLOVERGO";
const EVENT_ROLE = "evento";
const SALES_REQUIRED = ["Order Date", "Order ID", "Order Number", "Tip", "Order Total"];
const TIMESHEET_REQUIRED = [
  "Name",
  "Clock in date",
  "Clock in time",
  "Clock out date",
  "Clock out time"
];

const OPTIONAL_SALES = [
  "Order Payment State",
  "Tender",
  "Gross Sales",
  "Discount",
  "Discounts",
  "Tax Amount",
  "Refunds Total",
  "Manual Refunds Total",
  "Payments Total",
  "Payment Note",
  "Order Type",
  "Note"
];
const OPTIONAL_TIMESHEET = ["Total paid hours", "Role"];

const GROSS_SALES_HEADERS = [
  "Gross Sales",
  "Gross Sales Total",
  "Gross Sale",
  "Gross Amount",
  "Subtotal",
  "Subtotal Sales",
  "Gross Sales Including Tax",
  "Gross Sales Incl Tax",
  "Gross Total",
  "Total Sales"
];
const GROSS_SALES_INCLUDES_TAX_HEADERS = [
  "Gross Sales Including Tax",
  "Gross Sales Incl Tax",
  "Gross Total",
  "Total Sales"
];
const DISCOUNT_HEADERS = ["Discount", "Discounts", "Discount Amount", "Discount Total"];
const REFUND_HEADERS = [
  "Refunds Total",
  "Manual Refunds Total",
  "Refund",
  "Refunds",
  "Refund Amount",
  "Refund Total"
];
const TAX_HEADERS = ["Tax Amount", "Tax", "Taxes", "Sales Tax"];
const PAYMENT_TOTAL_HEADERS = ["Payments Total", "Payment Total", "Amount Paid", "Paid Amount"];
const PAYMENT_NOTE_HEADERS = ["Payment Note", "Payment Notes"];
const ORDER_TYPE_HEADERS = ["Order Type"];
const NOTE_HEADERS = ["Note", "Notes"];

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};

type HeaderLookup = Record<string, number | undefined>;

type ParsedSales = {
  orders: SalesOrder[];
  issues: ValidationIssue[];
};

type ParsedTimesheet = {
  shifts: Shift[];
  issues: ValidationIssue[];
  hasRoleColumn: boolean;
};

export function calculateTipDistribution(
  salesGrid: Grid,
  timesheetGrid: Grid
): CalculationResult {
  const parsedSales = parseSalesReport(salesGrid);
  const parsedTimesheet = parseTimesheetReport(timesheetGrid);
  const issues = [...parsedSales.issues, ...parsedTimesheet.issues];

  if (issues.some((issue) => issue.severity === "error")) {
    return emptyResult(parsedSales.orders, parsedTimesheet.shifts, issues);
  }

  const employeeOrder = new Map<string, EmployeeSummary>();
  parsedTimesheet.shifts.forEach((shift) => {
    const key = normalizeName(shift.employee);
    const current = employeeOrder.get(key);
    if (current) {
      current.paidHours += shift.paidHours;
      if (shift.isEventRole) {
        current.eventHours += shift.paidHours;
      } else {
        current.storeHours += shift.paidHours;
      }
      current.shiftCount += 1;
      return;
    }

    employeeOrder.set(key, {
      employee: shift.employee,
      paidHours: shift.paidHours,
      storeHours: shift.isEventRole ? 0 : shift.paidHours,
      eventHours: shift.isEventRole ? shift.paidHours : 0,
      storeTipShare: 0,
      eventTipShare: 0,
      tipShare: 0,
      sharePercent: 0,
      review: "",
      shiftCount: 1
    });
  });

  const validShifts = parsedTimesheet.shifts.filter((shift) => shift.valid);
  if (parsedSales.orders.length === 0) {
    issues.push({
      severity: "error",
      source: "sales",
      message: "No sales rows were found after the report header."
    });
  }

  if (parsedTimesheet.shifts.length === 0) {
    issues.push({
      severity: "error",
      source: "timesheet",
      message: "No timesheet rows were found after the report header."
    });
  } else if (validShifts.length === 0) {
    issues.push({
      severity: "error",
      source: "timesheet",
      message: "No valid clock-in and clock-out shifts were found."
    });
  }

  const overlapWarnings = findOverlappingShifts(validShifts);
  issues.push(...overlapWarnings);

  if (issues.some((issue) => issue.severity === "error")) {
    return emptyResult(parsedSales.orders, parsedTimesheet.shifts, issues);
  }

  const storeOrders = parsedSales.orders.filter((order) => !order.isEvent);
  const eventOrders = parsedSales.orders.filter((order) => order.isEvent);
  const storeAllocationDetails = allocateOrders(
    storeOrders,
    "store",
    validShifts,
    employeeOrder
  );
  const eventAllocationDetails = allocateOrders(
    eventOrders,
    "event",
    validShifts,
    employeeOrder
  );
  const allocationDetails = [...storeAllocationDetails, ...eventAllocationDetails];

  allocationDetails.forEach((detail) => {
    if (detail.tip > 0 && !detail.orderDate) {
      issues.push({
        severity: "warning",
        source: "sales",
        row: detail.rowNumber,
        field: "Order Date",
        message: `A tipped ${detail.pool} order has a date/time that could not be parsed, so it is unallocated.`
      });
    }
  });

  const totalTips = sumBy(storeOrders, (order) => order.tip);
  const unallocatedTips = sumBy(
    storeAllocationDetails.filter((detail) => detail.activeStaff === 0),
    (detail) => detail.tip
  );
  const allocatedTips = totalTips - unallocatedTips;
  const eventTips = sumBy(eventOrders, (order) => order.tip);
  const eventUnallocatedTips = sumBy(
    eventAllocationDetails.filter((detail) => detail.activeStaff === 0),
    (detail) => detail.tip
  );
  const eventAllocatedTips = eventTips - eventUnallocatedTips;
  const totalAllocatedTips = allocatedTips + eventAllocatedTips;
  const totalUnallocatedTips = unallocatedTips + eventUnallocatedTips;

  const employees = [...employeeOrder.values()].map((employee) => ({
    ...employee,
    sharePercent: totalAllocatedTips === 0 ? 0 : employee.tipShare / totalAllocatedTips,
    review: employee.tipShare === 0 ? "No matching tipped orders" : ""
  }));
  const totalPaidHours = sumBy(employees, (employee) => employee.paidHours);
  const netSales = sumBy(parsedSales.orders, (order) => order.netSales);
  const laborPercent = netSales === 0 ? 0 : totalPaidHours / netSales;

  const metrics: SummaryMetrics = {
    totalTips,
    allocatedTips,
    unallocatedTips,
    ordersWithTips: storeOrders.filter((order) => order.tip > 0).length,
    ordersWithTipsAndNoActiveEmployee: storeAllocationDetails.filter(
      (detail) => detail.tip > 0 && detail.activeStaff === 0
    ).length,
    totalPaidHours,
    employeesFound: employees.length,
    netSales,
    laborPercent,
    creditDebitSales: sumBy(
      parsedSales.orders.filter((order) => isCreditDebitTender(order)),
      (order) => order.paymentTotal
    ),
    cashSales: sumBy(
      parsedSales.orders.filter((order) => isCashTender(order)),
      (order) => order.paymentTotal
    ),
    giftCardSales: sumBy(
      parsedSales.orders.filter((order) => isGiftCardTender(order)),
      (order) => order.paymentTotal
    ),
    grubhubSales: sumBy(
      parsedSales.orders.filter((order) => deliveryPlatform(order) === "grubhub"),
      (order) => order.netSales
    ),
    doorDashSales: sumBy(
      parsedSales.orders.filter((order) => deliveryPlatform(order) === "doordash"),
      (order) => order.netSales
    ),
    uberEatsSales: sumBy(
      parsedSales.orders.filter((order) => deliveryPlatform(order) === "ubereats"),
      (order) => order.netSales
    ),
    eventSales: sumBy(eventOrders, (order) => order.orderTotal),
    eventTips,
    eventAllocatedTips,
    eventUnallocatedTips,
    eventOrders: eventOrders.length,
    eventOrdersWithTips: eventOrders.filter((order) => order.tip > 0).length,
    eventOrdersWithTipsAndNoActiveEmployee: eventAllocationDetails.filter(
      (detail) => detail.tip > 0 && detail.activeStaff === 0
    ).length,
    totalAllocatedTips,
    totalUnallocatedTips
  };

  if (metrics.eventOrdersWithTips > 0 && !parsedTimesheet.hasRoleColumn) {
    issues.push({
      severity: "warning",
      source: "timesheet",
      field: "Role",
      message: "The timesheet has no Role column, so event tips cannot be matched to Evento shifts."
    });
  }

  if (metrics.eventOrdersWithTips > 0 && metrics.eventAllocatedTips === 0) {
    issues.push({
      severity: "warning",
      source: "calculation",
      message: "Event tips were found, but no active Evento shifts matched those event order times."
    });
  }

  if (parsedSales.orders.some((order) => order.paymentState && order.paymentState.toLowerCase() !== "paid")) {
    issues.push({
      severity: "warning",
      source: "sales",
      message: "Some sales rows are not marked Paid. The workbook includes them, so this app includes them too."
    });
  }

  return {
    metrics,
    employees,
    allocationDetails,
    salesOrders: parsedSales.orders,
    shifts: parsedTimesheet.shifts,
    issues
  };
}

export function parseSalesReport(grid: Grid): ParsedSales {
  const issues: ValidationIssue[] = [];
  const header = findHeader(grid, SALES_REQUIRED);

  if (!header) {
    return {
      orders: [],
      issues: [
        {
          severity: "error",
          source: "sales",
          message: `Missing required sales headers: ${SALES_REQUIRED.join(", ")}.`
        }
      ]
    };
  }

  const orderDateIndex = header.lookup[normalizeHeader("Order Date")] as number;
  const orderIdIndex = header.lookup[normalizeHeader("Order ID")] as number;
  const orderNumberIndex = header.lookup[normalizeHeader("Order Number")] as number;
  const tipIndex = header.lookup[normalizeHeader("Tip")] as number;
  const orderTotalIndex = header.lookup[normalizeHeader("Order Total")] as number;
  const grossSalesColumn = findColumn(header.lookup, GROSS_SALES_HEADERS);
  const discountIndexes = findColumns(header.lookup, DISCOUNT_HEADERS);
  const refundIndexes = findColumns(header.lookup, REFUND_HEADERS);
  const taxIndexes = findColumns(header.lookup, TAX_HEADERS);
  const paymentTotalColumn = findColumn(header.lookup, PAYMENT_TOTAL_HEADERS);
  const paymentStateIndex = header.lookup[normalizeHeader("Order Payment State")];
  const tenderIndex = header.lookup[normalizeHeader("Tender")];
  const paymentNoteIndex = findColumn(header.lookup, PAYMENT_NOTE_HEADERS)?.index;
  const orderTypeIndex = findColumn(header.lookup, ORDER_TYPE_HEADERS)?.index;
  const noteIndex = findColumn(header.lookup, NOTE_HEADERS)?.index;
  const orders: SalesOrder[] = [];
  const seenOrderIds = new Set<string>();

  grid.slice(header.rowIndex + 1).forEach((row, offset) => {
    const rowNumber = header.rowIndex + offset + 2;
    if (rowIsEmpty(row)) {
      return;
    }

    const rawDate = cellText(row[orderDateIndex]);
    const orderId = cellText(row[orderIdIndex]);
    const orderNumber = cellText(row[orderNumberIndex]);
    const tipCell = row[tipIndex];
    const orderTotalCell = row[orderTotalIndex];
    const tipText = cellText(tipCell);

    if (!rawDate && !orderId && !tipText) {
      return;
    }

    const parsedTip = parseMoney(tipCell);
    if (!parsedTip.valid) {
      issues.push({
        severity: "error",
        source: "sales",
        row: rowNumber,
        field: "Tip",
        message: "Tip must be a number."
      });
      return;
    }

    const parsedOrderTotal = parseMoney(orderTotalCell);
    if (!parsedOrderTotal.valid) {
      issues.push({
        severity: "error",
        source: "sales",
        row: rowNumber,
        field: "Order Total",
        message: "Order Total must be a number."
      });
      return;
    }

    const grossSales = grossSalesColumn
      ? parseOptionalMoney(row[grossSalesColumn.index])
      : parsedOrderTotal.value;
    const discounts = sumOptionalDeductions(row, discountIndexes);
    const refunds = sumOptionalDeductions(row, refundIndexes);
    const taxes = sumOptionalDeductions(row, taxIndexes);
    const grossSalesIncludesTaxes =
      !grossSalesColumn ||
      GROSS_SALES_INCLUDES_TAX_HEADERS.some(
        (headerName) => normalizeHeader(headerName) === normalizeHeader(grossSalesColumn.header)
      );
    const netSales = grossSales - discounts - refunds - (grossSalesIncludesTaxes ? taxes : 0);
    const paymentTotal = paymentTotalColumn
      ? parseOptionalMoney(row[paymentTotalColumn.index])
      : parsedOrderTotal.value;

    if (!orderId) {
      issues.push({
        severity: "warning",
        source: "sales",
        row: rowNumber,
        field: "Order ID",
        message: "Order ID is blank. The row is still included in the calculation."
      });
    } else if (seenOrderIds.has(orderId)) {
      issues.push({
        severity: "warning",
        source: "sales",
        row: rowNumber,
        field: "Order ID",
        message: "Duplicate Order ID found. Confirm the sales export was not appended twice."
      });
    }

    if (orderId) {
      seenOrderIds.add(orderId);
    }

    orders.push({
      rowNumber,
      orderDate: parseOrderDate(rawDate),
      orderId,
      orderNumber,
      grossSales,
      discounts,
      refunds,
      taxes,
      netSales,
      orderTotal: parsedOrderTotal.value,
      paymentTotal,
      tip: parsedTip.value,
      paymentState: paymentStateIndex === undefined ? "" : cellText(row[paymentStateIndex]),
      tender: tenderIndex === undefined ? "" : cellText(row[tenderIndex]),
      paymentNote: paymentNoteIndex === undefined ? "" : cellText(row[paymentNoteIndex]),
      orderType: orderTypeIndex === undefined ? "" : cellText(row[orderTypeIndex]),
      note: noteIndex === undefined ? "" : cellText(row[noteIndex]),
      rawDate,
      isEvent: normalizeEventOrderNumber(orderNumber) === EVENT_ORDER_NUMBER
    });
  });

  return { orders, issues };
}

export function parseTimesheetReport(grid: Grid): ParsedTimesheet {
  const issues: ValidationIssue[] = [];
  const header = findHeader(grid, TIMESHEET_REQUIRED);

  if (!header) {
    return {
      shifts: [],
      hasRoleColumn: false,
      issues: [
        {
          severity: "error",
          source: "timesheet",
          message: `Missing required timesheet headers: ${TIMESHEET_REQUIRED.join(", ")}.`
        }
      ]
    };
  }

  const nameIndex = header.lookup[normalizeHeader("Name")] as number;
  const clockInDateIndex = header.lookup[normalizeHeader("Clock in date")] as number;
  const clockInTimeIndex = header.lookup[normalizeHeader("Clock in time")] as number;
  const clockOutDateIndex = header.lookup[normalizeHeader("Clock out date")] as number;
  const clockOutTimeIndex = header.lookup[normalizeHeader("Clock out time")] as number;
  const totalPaidHoursIndex = header.lookup[normalizeHeader("Total paid hours")];
  const roleIndex = header.lookup[normalizeHeader("Role")];
  const shifts: Shift[] = [];

  grid.slice(header.rowIndex + 1).forEach((row, offset) => {
    const rowNumber = header.rowIndex + offset + 2;
    if (rowIsEmpty(row)) {
      return;
    }

    const employee = cellText(row[nameIndex]);
    if (isSkippedTimesheetName(employee)) {
      return;
    }

    const role = roleIndex === undefined ? "" : cellText(row[roleIndex]);
    const clockIn = parseShiftDateTime(row[clockInDateIndex], row[clockInTimeIndex]);
    const clockOut = parseShiftDateTime(row[clockOutDateIndex], row[clockOutTimeIndex]);
    const paidHoursFromReport =
      totalPaidHoursIndex === undefined
        ? { valid: false, value: 0 }
        : parseMoney(row[totalPaidHoursIndex], false);
    const computedPaidHours =
      clockIn && clockOut && clockOut >= clockIn ? diffHours(clockIn, clockOut) : 0;
    const paidHours = paidHoursFromReport.valid ? paidHoursFromReport.value : computedPaidHours;
    const valid = Boolean(employee && clockIn && clockOut && clockOut >= clockIn);

    if (!valid) {
      issues.push({
        severity: "warning",
        source: "timesheet",
        row: rowNumber,
        message: `Shift for ${employee || "an employee"} is missing a valid clock-in or clock-out time.`
      });
    }

    if (paidHours < 0) {
      issues.push({
        severity: "error",
        source: "timesheet",
        row: rowNumber,
        field: "Total paid hours",
        message: "Paid hours cannot be negative."
      });
    }

    shifts.push({
      rowNumber,
      employee,
      role,
      isEventRole: isEventRole(role),
      clockIn,
      clockOut,
      paidHours: Math.max(0, paidHours),
      valid
    });
  });

  return { shifts, issues, hasRoleColumn: roleIndex !== undefined };
}

export function formatDateTime(value: Date | null): string {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(roundMoney(value));
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function emptyResult(
  salesOrders: SalesOrder[],
  shifts: Shift[],
  issues: ValidationIssue[]
): CalculationResult {
  return {
    metrics: {
      totalTips: 0,
      allocatedTips: 0,
      unallocatedTips: 0,
      ordersWithTips: 0,
      ordersWithTipsAndNoActiveEmployee: 0,
      totalPaidHours: 0,
      employeesFound: 0,
      netSales: 0,
      laborPercent: 0,
      creditDebitSales: 0,
      cashSales: 0,
      giftCardSales: 0,
      grubhubSales: 0,
      doorDashSales: 0,
      uberEatsSales: 0,
      eventSales: 0,
      eventTips: 0,
      eventAllocatedTips: 0,
      eventUnallocatedTips: 0,
      eventOrders: 0,
      eventOrdersWithTips: 0,
      eventOrdersWithTipsAndNoActiveEmployee: 0,
      totalAllocatedTips: 0,
      totalUnallocatedTips: 0
    },
    employees: [],
    allocationDetails: [],
    salesOrders,
    shifts,
    issues
  };
}

function findHeader(grid: Grid, requiredHeaders: string[]) {
  for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
    const lookup: HeaderLookup = {};
    grid[rowIndex].forEach((cell, columnIndex) => {
      const key = normalizeHeader(cellText(cell));
      if (key) {
        lookup[key] = columnIndex;
      }
    });

    if (requiredHeaders.every((header) => lookup[normalizeHeader(header)] !== undefined)) {
      OPTIONAL_SALES.concat(OPTIONAL_TIMESHEET).forEach((header) => {
        const key = normalizeHeader(header);
        if (lookup[key] === undefined) {
          return;
        }
      });
      return { rowIndex, lookup };
    }
  }

  return null;
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeEventOrderNumber(value: string): string {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function normalizeRole(value: string): string {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isEventRole(role: string): boolean {
  return normalizeRole(role) === EVENT_ROLE;
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value).trim();
}

function rowIsEmpty(row: CellValue[]): boolean {
  return row.every((cell) => cellText(cell) === "");
}

function parseMoney(value: CellValue, blankIsZero = true): { valid: boolean; value: number } {
  if (value === null || value === undefined || cellText(value) === "") {
    return { valid: blankIsZero, value: 0 };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { valid: true, value };
  }

  const raw = cellText(value);
  const negativeParentheses = /^\(.+\)$/.test(raw);
  const cleaned = raw.replace(/[$,\s]/g, "").replace(/[()]/g, "");
  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) {
    return { valid: false, value: 0 };
  }

  return { valid: true, value: negativeParentheses ? -parsed : parsed };
}

function parseOptionalMoney(value: CellValue): number {
  const parsed = parseMoney(value);
  return parsed.valid ? parsed.value : 0;
}

function findColumn(
  lookup: HeaderLookup,
  headers: string[]
): { index: number; header: string } | null {
  for (const header of headers) {
    const index = lookup[normalizeHeader(header)];
    if (index !== undefined) {
      return { index, header };
    }
  }

  return null;
}

function findColumns(lookup: HeaderLookup, headers: string[]): number[] {
  const indexes = new Set<number>();
  headers.forEach((header) => {
    const index = lookup[normalizeHeader(header)];
    if (index !== undefined) {
      indexes.add(index);
    }
  });

  return [...indexes];
}

function sumOptionalDeductions(row: CellValue[], indexes: number[]): number {
  return indexes.reduce((total, index) => total + Math.abs(parseOptionalMoney(row[index])), 0);
}

function isCreditDebitTender(order: SalesOrder): boolean {
  const text = paymentSearchText(order);
  if (matchesPhrase(text, ["gift card", "giftcard", "house account", "houseaccount"])) {
    return false;
  }

  return matchesPhrase(text, ["credit card", "debit card", "credit", "debit"]);
}

function isCashTender(order: SalesOrder): boolean {
  return matchesPhrase(paymentSearchText(order), ["cash"]);
}

function isGiftCardTender(order: SalesOrder): boolean {
  return matchesPhrase(paymentSearchText(order), ["gift card", "giftcard"]);
}

function deliveryPlatform(order: SalesOrder): "grubhub" | "doordash" | "ubereats" | null {
  const text = searchableText(
    order.tender,
    order.paymentNote,
    order.orderType,
    order.note,
    order.orderNumber,
    order.orderId
  );

  if (matchesPhrase(text, ["grubhub", "grub hub"])) {
    return "grubhub";
  }

  if (matchesPhrase(text, ["doordash", "door dash"])) {
    return "doordash";
  }

  if (matchesPhrase(text, ["uber eats", "ubereats"])) {
    return "ubereats";
  }

  return null;
}

function matchesPhrase(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(searchableText(phrase)));
}

function paymentSearchText(order: SalesOrder): string {
  return searchableText(order.tender || order.paymentNote);
}

function searchableText(...values: string[]): string {
  return values
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseOrderDate(value: CellValue): Date | null {
  if (value instanceof Date && isValidDate(value)) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return excelSerialToDate(value);
  }

  const raw = cellText(value);
  if (!raw) {
    return null;
  }

  const clover = raw.match(
    /^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)/i
  );
  if (clover) {
    const day = Number(clover[1]);
    const month = MONTHS[clover[2].toLowerCase()];
    const year = Number(clover[3]);
    const hour = to24Hour(Number(clover[4]), clover[6]);
    const minute = Number(clover[5]);
    return safeDate(year, month, day, hour, minute);
  }

  const numeric = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AP]M)?)?/i
  );
  if (numeric) {
    const month = Number(numeric[1]) - 1;
    const day = Number(numeric[2]);
    const year = expandYear(Number(numeric[3]));
    const hour = numeric[4] ? to24Hour(Number(numeric[4]), numeric[6] || "") : 0;
    const minute = numeric[5] ? Number(numeric[5]) : 0;
    return safeDate(year, month, day, hour, minute);
  }

  const parsed = new Date(raw);
  return isValidDate(parsed) ? parsed : null;
}

function parseShiftDateTime(dateValue: CellValue, timeValue: CellValue): Date | null {
  const datePart = parseDateOnly(dateValue);
  const timePart = parseTimeOnly(timeValue);

  if (!datePart || !timePart) {
    return null;
  }

  return safeDate(datePart.year, datePart.month, datePart.day, timePart.hour, timePart.minute);
}

function parseDateOnly(value: CellValue): { year: number; month: number; day: number } | null {
  if (value instanceof Date && isValidDate(value)) {
    return {
      year: value.getFullYear(),
      month: value.getMonth(),
      day: value.getDate()
    };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const date = excelSerialToDate(value);
    return date
      ? {
          year: date.getFullYear(),
          month: date.getMonth(),
     