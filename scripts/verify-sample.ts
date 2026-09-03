import * as XLSX from "xlsx";
import {
  calculateTipDistribution,
  roundMoney,
  type Grid
} from "../lib/tip-calculator";

import { existsSync } from "node:fs";
import { resolve } from "node:path";

// The reference workbook is not committed (it holds real payroll data), so its location is
// configurable. Defaults to the repo root; override with TIP_WORKBOOK_PATH or argv[2].
const workbookPath = resolve(
  process.argv[2] ||
    process.env.TIP_WORKBOOK_PATH ||
    "Clover_Tip_Distribution_Template.xlsx"
);

if (!existsSync(workbookPath)) {
  console.error(
    `Reference workbook not found at ${workbookPath}\n` +
      "Pass a path, or set TIP_WORKBOOK_PATH:\n" +
      "  npm run verify:sample -- /path/to/Clover_Tip_Distribution_Template.xlsx"
  );
  process.exit(1);
}

const workbook = XLSX.readFile(workbookPath, { cellDates: false });

function sheetGrid(sheetName: string): Grid {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Missing sheet: ${sheetName}`);
  }

  return XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false
  }) as Grid;
}

const result = calculateTipDistribution(
  sheetGrid("Sales Report Paste"),
  sheetGrid("Timesheet Report Paste")
);

const check = sheetGrid("Current Report Check");
const expectedTotalTips = Number(check[1]?.[5] ?? 0);
const expectedUnallocated = Number(check[2]?.[5] ?? 0);
const expectedEmployees = check
  .slice(1)
  .filter((row) => row[0])
  .map((row) => ({
    employee: String(row[0]),
    paidHours: Number(row[1]),
    tipShare: Number(row[2])
  }));

const failures: string[] = [];

if (Math.abs(result.metrics.totalTips - expectedTotalTips) > 0.01) {
  failures.push(
    `Total tips expected ${expectedTotalTips}, received ${result.metrics.totalTips}`
  );
}

if (Math.abs(result.metrics.unallocatedTips - expectedUnallocated) > 0.01) {
  failures.push(
    `Unallocated tips expected ${expectedUnallocated}, received ${result.metrics.unallocatedTips}`
  );
}

expectedEmployees.forEach((expected) => {
  const actual = result.employees.find((employee) => employee.employee === expected.employee);
  if (!actual) {
    failures.push(`Missing employee ${expected.employee}`);
    return;
  }

  if (Math.abs(actual.paidHours - expected.paidHours) > 0.02) {
    failures.push(
      `${expected.employee} hours expected ${expected.paidHours}, received ${actual.paidHours}`
    );
  }

  if (Math.abs(actual.tipShare - expected.tipShare) > 0.02) {
    failures.push(
      `${expected.employee} tips expected ${expected.tipShare}, received ${actual.tipShare}`
    );
  }
});

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Sample workbook verification passed");
console.log(
  JSON.stringify(
    {
      totalTips: roundMoney(result.metrics.totalTips),
      allocatedTips: roundMoney(result.metrics.allocatedTips),
      unallocatedTips: roundMoney(result.metrics.unallocatedTips),
      employeesFound: result.metrics.employeesFound,
      issues: result.issues.length
    },
    null,
    2
  )
);
