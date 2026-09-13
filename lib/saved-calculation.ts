import type { CalculationResult } from "@/lib/tip-calculator";

/**
 * Keeps the last calculation across a page refresh.
 *
 * Uploaded reports live only in the browser, so a reload used to throw away the whole
 * period and mean re-picking both files. This stores the finished result locally — the
 * same data the person just uploaded, on their own machine, never sent anywhere.
 */
const KEY = "shiftFlowLastCalculation";
const VERSION = 1;

export type SavedUpload = {
  kind: "orders" | "payments" | "timesheet";
  fileName: string;
  rowCount: number;
  contentHash: string;
};

type Saved = {
  version: number;
  savedAt: string;
  result: CalculationResult;
  uploads: SavedUpload[];
};

/** Fields that are Date objects in memory but plain strings once serialised. */
const DATE_PATHS: Array<[keyof CalculationResult, string[]]> = [
  ["salesOrders", ["orderDate"]],
  ["shifts", ["clockIn", "clockOut"]],
  ["allocationDetails", ["orderDate"]]
];

function reviveDates(result: CalculationResult): CalculationResult {
  DATE_PATHS.forEach(([collection, fields]) => {
    const rows = result[collection] as unknown as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) {
      return;
    }
    rows.forEach((row) => {
      fields.forEach((field) => {
        const value = row[field];
        if (typeof value === "string") {
          const parsed = new Date(value);
          row[field] = Number.isNaN(parsed.getTime()) ? null : parsed;
        }
      });
    });
  });
  return result;
}

export function saveCalculation(result: CalculationResult, uploads: SavedUpload[]): void {
  try {
    const payload: Saved = {
      version: VERSION,
      savedAt: new Date().toISOString(),
      result,
      uploads
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // A full or disabled store simply means the refresh will not restore. Not worth
    // interrupting a finished calculation over.
  }
}

export function loadCalculation(): { result: CalculationResult; uploads: SavedUpload[] } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Saved;
    if (parsed.version !== VERSION || !parsed.result) {
      return null;
    }
    return { result: reviveDates(parsed.result), uploads: parsed.uploads ?? [] };
  } catch {
    return null;
  }
}

export function clearCalculation(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do: the caller is resetting anyway.
  }
}
