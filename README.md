# ShiftFlow

A simple SaaS-style web app for restaurant and coffee shop managers to review business metrics and calculate fair weekly tip payouts from Clover sales and timesheet reports.

The app recreates the logic from the original Excel workbook: each tipped order is matched to the employees who were clocked in at the order time, then the tip is split equally among those active employees.

## Features

- Sign in with a per-manager account backed by Supabase Auth
- Publish a finished period so staff can sign in and see their own tips
- Install to a phone home screen as a PWA
- Upload Clover orders/sales report or the newer Clover payments report
- Upload Clover timesheet report
- Validate report structure before calculating
- Split each order tip across clocked-in staff
- Separate event/kiosk sales marked as `CLOVERGO`
- Use the timesheet `Role` value `Evento` to split event tips only across event staff
- Show store tips, event tips, and total payout in the employee summary
- Show employee payout summary
- Flag unallocated tips for manager review
- Collapse non-blocking validation warnings
- Export the payout summary to Excel
- Mobile-friendly manager dashboard

## Business Rules

- Sales report can be either the original Clover orders export or the newer Clover payments export.
- Original orders exports must include `Order Date`, `Order ID`, `Order Number`, `Tip`, and `Order Total`.
- Payments exports must include `Payment Date`, `Payment ID`, `Amount`, `Tip Amount`, `Order ID`, `Order Date`, and `Result`.
- Failed payments are skipped; successful payments use `Amount` as payment total and `Tip Amount` as tips.
- Timesheet report must include `Name`, `Clock in date`, `Clock in time`, `Clock out date`, and `Clock out time`.
- A valid shift requires an employee name, clock-in time, clock-out time, and `clock-out >= clock-in`.
- Paid hours come from `Total paid hours` when available. Otherwise they are calculated from clock-in and clock-out.
- Rows where `Order Number` equals `CLOVERGO` are event/kiosk sales and are not mixed into the store tip pool.
- Timesheet rows where `Role` equals `Evento` are treated as event shifts. Blank or other roles are treated as store shifts.
- Event sales are totaled from `Order Total`, and event tips are split evenly between active `Evento` employees at the event order time.
- Store order tips are split evenly between active non-event employees at the order date/time.
- Store or event tips with no active employee in that pool are marked as unallocated for manager review.
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

The app is wired to a hosted Supabase project (`mhulczwvcecygugiuuew`, "ShiftFlow" in
the Mark AI Lab org). `.env.local` holds its URL and keys and is not committed. To work
against that project, run `supabase link --project-ref mhulczwvcecygugiuuew` and skip to
"Run the development server".

To work offline instead, start the local Supabase stack (needs Docker):

```bash
supabase start
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Fill in the values `supabase start` printed:

```text
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

Apply the schema and create the first manager account:

```bash
supabase db reset
npm run seed:user
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

## Accounts

There are three roles. `admin` and `manager` both see the full dashboard and can publish
payouts; `staff` see only their own tips at `/my-tips`.

Self-signup is disabled. Accounts are created with the server-only secret key:

```bash
npm run seed:user -- --email manager@example.com --password 'a good password' --name 'Ana Diaz' --role manager
```

Re-running the command for an existing email resets that account's password, name, and
role, so it is safe to use for password resets. Supabase Auth rejects passwords shorter
than 6 characters.

A staff account must be linked to the person's name exactly as it appears in the Clover
timesheet, or they will sign in and see nothing:

```bash
npm run seed:user -- --email caio@example.com --password 'a good password' \
  --name 'Caio Corazzari' --role staff --employee 'Caio Corazzari'
```

Roles and the employee link are stored in Supabase `app_metadata` and mirrored into
`public.profiles`. They are deliberately not read from `user_metadata`, which the user
themselves can edit — someone able to rewrite their own employee link could read a
colleague's payout.

## Publishing to staff

Tip calculation happens in the manager's browser and uploaded reports are never stored.
Pressing **Publish to staff** on the Tips view saves only the per-person totals — name,
hours, store and event tips, share of the pool — to `pay_periods` and `payouts`.

Row level security does the enforcing: a staff session can read only its own payout row,
only for a published period, and cannot write either table. Managers read and write both.

Sign-in is throttled to 10 failed attempts per IP and email pair per 15 minutes. Attempts
are recorded in `public.login_attempts` under a hash of the address and email, and the
table is unreachable from the Data API.

## Verification

The project includes a sample verification command that compares the app calculation against the original workbook's saved check sheet:

```bash
npm run verify:sample -- /path/to/Clover_Tip_Distribution_Template.xlsx
```

The reference workbook holds real payroll data and is not committed, so pass its path (or
set `TIP_WORKBOOK_PATH`).

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
- Per-user login with server-enforced sessions

Not included yet:

- Self-service signup and password reset emails
- Payments
- Payroll integrations
- Multi-location accounts
- Saved history
- Advanced role-based tip pooling

## Project Structure

```text
middleware.ts            Session refresh + route protection
app/
  page.tsx               Server-side session check, renders the dashboard
  dashboard-client.tsx   Main app UI
  login/                 Sign-in page and server action
  my-tips/               Staff view of their own payouts
  actions/               Publish payouts to staff
  manifest.ts            PWA manifest
  auth/signout/          Sign-out route handler
  globals.css            SaaS dashboard styling
lib/
  supabase/              Browser, server, and middleware Supabase clients
  tip-calculator.ts      Core tip distribution logic
  spreadsheet-file.ts    Report file parsing
  export-results.ts      Excel export
scripts/
  seed-user.ts           Creates or updates a login
  generate-pwa-assets.py Regenerates icons and iOS launch images
  deploy-status.ts       Build state and production health
  verify-sample.ts       Workbook parity verification
supabase/
  migrations/            profiles, payouts, RLS, auth triggers
BUSINESS_RULES.md        Detailed calculation rules
```

## Notes

This app is designed as a clean operational tool for small food-service businesses. Tip
calculation still happens entirely in the browser — uploaded Clover reports are never sent
to a server or stored. Supabase holds only login accounts, not payroll data.
