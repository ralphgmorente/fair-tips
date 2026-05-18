# Clover Tip Distribution

A simple SaaS-style web app for restaurant and coffee shop managers to calculate fair weekly tip payouts from Clover sales and timesheet reports.

The app recreates the logic from the original Excel workbook: each tipped order is matched to the employees who were clocked in at the order time, then the tip is split equally among those active employees.

## Features

- Upload Clover sales report
- Upload Clover timesheet report
- Validate report structure before calculating
- Split each order tip across clocked-in staff
- Separate event/kiosk sales marked as `CLOVERGO`
- Show event sales and event tips as dashboard metrics
- Show employee payout summary
- Flag unallocated tips for manager review
- Collapse non-blocking validation warnings
- Export the payout summary to Excel
- Mobile-friendly manager dashboard

## Business Rules

- Sales report must include `Order Date`, `Order ID`, `Order Number`, `Tip`, and `Order Total`.
- Timesheet report must include `Name`, `Clock in date`, `Clock in time`, `Clock out date`, and `Clock out time`.
- A valid shift requires an employee name, clock-in time, clock-out time, and `clock-out >= clock-in`.
- Paid hours come from `Total paid hours` when available. Otherwise they are calculated from clock-in and clock-out.
- Rows where `Order Number` equals `CLOVERGO` are event/kiosk sales and are not mixed into the store tip pool.
- Event sales are totaled from `Order Total`, and event tips are totaled from `Tip`.
- Store order tips are split evenly between employees clocked in at the order date/time.
- Store tips with no active employee are marked as unallocated for manager review.
- Overlapping shifts for the same employee are counted once per order.

More detail is documented in [BUSINESS_RULES.md](./BUSINESS_RULES.md).

## Tech Stack

- Next.js
- React
- TypeScript
- SheetJS for spreadsheet import/export
- Lucide React icons

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Set the temporary app password:

```text
FAIR_TIPS_PASSWORD=your-manager-password
```

Run the development server:

```bash
npm run dev
```

Open the app:

```text
http://127.0.0.1:3000
```

Build for production:

```bash
npm run build
```

## Verification

The project includes a sample verification command that compares the app calculation against the original workbook's saved check sheet:

```bash
npm run verify:sample
```

This verifies:

- Total tips
- Allocated tips
- Unallocated tips
- Employee paid hours
- Employee tip shares

## How Managers Use It

1. Export the Clover orders or sales report.
2. Export the Clover timesheet report.
3. Upload both files.
4. Click `Calculate tips`.
5. Review warnings and unallocated tips.
6. Export the Excel payout workbook.

## MVP Scope

Included:

- Report uploads
- Tip calculation
- Employee payout summary
- Validation
- Excel export
- Responsive manager UI
- Lightweight password screen

Not included yet:

- Login
- Payments
- Payroll integrations
- Multi-location accounts
- Saved history
- Advanced role-based tip pooling

## Project Structure

```text
app/
  page.tsx          Main app UI
  globals.css      SaaS dashboard styling
lib/
  tip-calculator.ts    Core tip distribution logic
  spreadsheet-file.ts  Report file parsing
  export-results.ts    Excel export
scripts/
  verify-sample.ts     Workbook parity verification
BUSINESS_RULES.md      Detailed calculation rules
```

## Notes

This app is designed as a clean operational tool for small food-service businesses. The calculation happens locally in the browser, and no login, payment, or server-side storage is included in the MVP.
