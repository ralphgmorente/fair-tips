# Clover Tip Distribution Business Rules

This app recreates the logic from `Clover_Tip_Distribution_Template.xlsx`.

## Workbook Structure

- `Sales Report Paste`: raw Clover order export. Required columns are `Order Date`, `Order ID`, `Order Number`, `Tip`, and `Order Total`.
- `Timesheet Report Paste`: raw Clover timesheet export. Required columns are `Name`, `Clock in date`, `Clock in time`, `Clock out date`, and `Clock out time`.
- `Shift Calc`: cleaned shift rows with employee name, role, work area, clock-in, clock-out, paid hours, validity, and first employee row.
- `Tip Allocation Detail`: one row per sale and one allocation column per employee.
- `Summary`: manager payout table.
- `Current Report Check`: saved check values for the sample reports.
- `How To Use`: workbook workflow notes.

## Calculation Rules

- A timesheet row is ignored when `Name` is blank, `-`, `Name`, or starts with `Totals for`.
- A valid shift has an employee name, a parseable clock-in, a parseable clock-out, and `clock-out >= clock-in`.
- Paid hours come from `Total paid hours` when that value is numeric. Otherwise paid hours are calculated as `(clock-out - clock-in) * 24`.
- A timesheet row where `Role` equals `Evento` is an event shift. Blank or other role values are store shifts.
- Sales rows with `Order Number` equal to `CLOVERGO` are event/kiosk sales.
- Event/kiosk sales are separated from the store tip pool.
- Event sales are totaled from `Order Total`.
- Event tips are totaled from `Tip`.
- Event tips are split only across active event shifts where `Role` equals `Evento`.
- Store sales are rows where `Order Number` is blank or anything other than `CLOVERGO`.
- Every store sales row contributes its `Tip` amount to store tips.
- For each store sale, active staff are non-event employees with a valid shift where `clock-in <= order date/time <= clock-out`.
- If active staff exist, the store order tip is split evenly across those active employees.
- If active event staff exist, the event order tip is split evenly across those active event employees.
- If no active staff exist in the matching pool, the order tip is unallocated and appears for review.
- Employee paid hours are summed by employee across timesheet rows.
- Employee tip share is the sum of all store and event per-order allocations for that employee.
- Employee share percent is `employee tip share / total allocated tips`.
- Employees with hours but no allocated tips are marked `No matching tipped orders`.

## Validation

- The app blocks calculation when required columns are missing, tips are not numeric, paid hours are negative, no sales rows exist, or no valid shifts exist.
- The app warns about blank order IDs, duplicate order IDs, tipped orders with unparseable order times, non-paid sales rows, invalid shifts, missing `Role` when event tips exist, event tips with no active `Evento` shift matches, and overlapping shifts for the same employee.
- Overlapping shifts for the same employee are counted once per order in the web app so one person cannot receive two shares for one order.
