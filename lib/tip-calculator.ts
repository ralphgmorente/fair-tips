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
  orderTotal: number;
  tip: number;
  paymentState: string;
  tender: string;
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

const OPTIONAL_SALES = ["Order Payment State", "Tender"];
const OPTIONAL_TIMESHEET = ["Total paid hours", "Role"];

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

  const metrics: SummaryMetrics = {
    totalTips,
    allocatedTips,
    unallocatedTips,
    ordersWithTips: storeOrders.filter((order) => order.tip > 0).length,
    ordersWithTipsAndNoActiveEmployee: storeAllocationDetails.filter(
      (detail) => detail.tip > 0 && detail.activeStaff === 0
    ).length,
    totalPaidHours: sumBy(employees, (employee) => employee.paidHours),
    employeesFound: employees.length,
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
  const paymentStateIndex = header.lookup[normalizeHeader("Order Payment State")];
  const tenderIndex = header.lookup[normalizeHeader("Tender")];
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
      orderTotal: parsedOrderTotal.value,
      tip: parsedTip.value,
      paymentState: paymentStateIndex === undefined ? "" : cellText(row[paymentStateIndex]),
      tender: tenderIndex === undefined ? "" : cellText(row[tenderIndex]),
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
          day: date.getDate()
        }
      : null;
  }

  const raw = cellText(value);
  if (!raw) {
    return null;
  }

  const monthName = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthName) {
    const month = MONTHS[monthName[1].toLowerCase()];
    return month === undefined
      ? null
      : {
          year: Number(monthName[3]),
          month,
          day: Number(monthName[2])
        };
  }

  const numeric = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (numeric) {
    return {
      year: expandYear(Number(numeric[3])),
      month: Number(numeric[1]) - 1,
      day: Number(numeric[2])
    };
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]) - 1,
      day: Number(iso[3])
    };
  }

  const parsed = new Date(raw);
  return isValidDate(parsed)
    ? {
        year: parsed.getFullYear(),
        month: parsed.getMonth(),
        day: parsed.getDate()
      }
    : null;
}

function parseTimeOnly(value: CellValue): { hour: number; minute: number } | null {
  if (value instanceof Date && isValidDate(value)) {
    return { hour: value.getHours(), minute: value.getMinutes() };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const minutes = Math.round((value % 1) * 24 * 60);
    return {
      hour: Math.floor(minutes / 60),
      minute: minutes % 60
    };
  }

  const raw = cellText(value).toLowerCase();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/);
  if (!match) {
    return null;
  }

  return {
    hour: to24Hour(Number(match[1]), match[3] || ""),
    minute: match[2] ? Number(match[2]) : 0
  };
}

function to24Hour(hour: number, meridiem: string): number {
  const suffix = meridiem.toLowerCase();
  if (suffix === "pm") {
    return hour === 12 ? 12 : hour + 12;
  }

  if (suffix === "am") {
    return hour === 12 ? 0 : hour;
  }

  return hour;
}

function expandYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

function safeDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): Date | null {
  const date = new Date(year, month, day, hour, minute, 0, 0);
  return isValidDate(date) &&
    date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date
    : null;
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) {
    return null;
  }

  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  const fractionalDay = serial - Math.floor(serial) + 0.0000001;
  const totalSeconds = Math.floor(86400 * fractionalDay);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds / 60) % 60;

  return new Date(
    dateInfo.getUTCFullYear(),
    dateInfo.getUTCMonth(),
    dateInfo.getUTCDate(),
    hours,
    minutes,
    seconds
  );
}

function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

function diffHours(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 36e5;
}

function allocateOrders(
  orders: SalesOrder[],
  pool: TipPool,
  validShifts: Shift[],
  employeeOrder: Map<string, EmployeeSummary>
): AllocationDetail[] {
  const shiftsForPool = validShifts.filter((shift) =>
    pool === "event" ? shift.isEventRole : !shift.isEventRole
  );

  return orders.map((order) => {
    const activeEmployees = order.orderDate
      ? uniqueActiveEmployees(order.orderDate, shiftsForPool)
      : [];
    const activeStaff = activeEmployees.length;
    const tipPerPerson = activeStaff === 0 ? 0 : order.tip / activeStaff;

    activeEmployees.forEach((employee) => {
      const summary = employeeOrder.get(normalizeName(employee));
      if (!summary) {
        return;
      }

      if (pool === "event") {
        summary.eventTipShare += tipPerPerson;
      } else {
        summary.storeTipShare += tipPerPerson;
      }
      summary.tipShare += tipPerPerson;
    });

    return {
      pool,
      rowNumber: order.rowNumber,
      orderDate: order.orderDate,
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      orderTotal: order.orderTotal,
      tip: order.tip,
      activeEmployees,
      activeStaff,
      tipPerPerson,
      allocatedTip: activeStaff === 0 ? 0 : order.tip,
      paymentState: order.paymentState,
      tender: order.tender,
      status: formatAllocationStatus(pool, order.orderDate, activeStaff)
    };
  });
}

function formatAllocationStatus(
  pool: TipPool,
  orderDate: Date | null,
  activeStaff: number
): string {
  if (!orderDate) {
    return "NO VALID ORDER TIME";
  }

  if (activeStaff === 0) {
    return pool === "event" ? "NO ACTIVE EVENT EMPLOYEE" : "NO ACTIVE STORE EMPLOYEE";
  }

  return `${activeStaff} active ${pool}`;
}

function uniqueActiveEmployees(orderDate: Date, validShifts: Shift[]): string[] {
  const active = new Map<string, string>();
  validShifts.forEach((shift) => {
    if (!shift.clockIn || !shift.clockOut) {
      return;
    }

    if (shift.clockIn <= orderDate && shift.clockOut >= orderDate) {
      active.set(normalizeName(shift.employee), shift.employee);
    }
  });

  return [...active.values()];
}

function findOverlappingShifts(validShifts: Shift[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byEmployee = new Map<string, Shift[]>();

  validShifts.forEach((shift) => {
    const key = normalizeName(shift.employee);
    const group = byEmployee.get(key) ?? [];
    group.push(shift);
    byEmployee.set(key, group);
  });

  byEmployee.forEach((shifts) => {
    const sorted = [...shifts].sort(
      (a, b) => (a.clockIn?.getTime() ?? 0) - (b.clockIn?.getTime() ?? 0)
    );

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (previous.clockOut && current.clockIn && previous.clockOut > current.clockIn) {
        issues.push({
          severity: "warning",
          source: "timesheet",
          row: current.rowNumber,
          message: `${current.employee} has overlapping shifts. They are counted once per order.`
        });
      }
    }
  });

  return issues;
}

function isSkippedTimesheetName(name: string): boolean {
  const normalized = normalizeName(name);
  return (
    normalized === "" ||
    normalized === "-" ||
    normalized === "name" ||
    normalized === "totals" ||
    normalized.startsWith("totals for")
  );
}

function sumBy<T>(items: T[], getValue: (item: T) => number): number {
  return items.reduce((total, item) => total + getValue(item), 0);
}
