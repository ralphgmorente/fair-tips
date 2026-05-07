# Clover Tip Distribution Business Rules

This app recreates the logic from `Clover_Tip_Distribution_Template.xlsx`.

## Workbook Structure

- `Sales Report Paste`: raw Clover order export. Required columns are `Order Date`, `Order ID`, and `Tip`.
- `Timesheet Report Paste`: raw Clover timesheet export. Required columns are `Name`, `Clock in date`, `Clock in time`, `Clock out date`, and `Clock out time`.
- `Shift Calc`: cleaned shift rows with employee name, clock-in, clock-out, paid hours, validity, and first employee row.
- `Tip Allocation Detail`: one row per sale and one allocation column per employee.
- `Summary`: manager payout table.
- `Current Report Check`: saved check values for the sample reports.
- `How To Use`: workbook workflow notes.

## Calculation Rules

- A timesheet row is ignored when `Name` is blank, `-`, `Name`, or starts with `Totals for`.
- A valid shift has an employee name, a parseable clock-in, a parseable clock-out, and `clock-out >= clock-in`.
- Paid hours come from `Total paid hours` when that value is numeric. Otherwise paid hours are calculated as `(clock-out - clock-in) * 24`.
- Every sales row contributes its `Tip` amount to total tips.
- For each sale, active staff are employees with a valid shift where `clock-in <= order date/time <= clock-out`.
- If active staff exist, the order tip is split evenly across those active employees.
- If no active staff exist, the order tip is unallocated and appears for review.
- Employee paid hours are summed by employee across timesheet rows.
- Employee tip share is the sum of all per-order allocations for that employee.
- Employee share percent is `employee tip share / allocated tips`.
- Employees with hours but no allocated tips are marked `No matching tipped orders`.

## Validation

- The app blocks calculation when required columns are missing, tips are not numeric, paid hours are negative, no sales rows exist, or no valid shifts exist.
- The app warns about blank order IDs, duplicate order IDs, tipped orders with unparseable order times, non-paid sales rows, invalid shifts, and overlapping shifts for the same employee.
- Overlapping shifts for the same employee are counted once per order in the web app so one person cannot receive two shares for one order.
