/**
 * Normalises a timesheet name into the key that links a person to their account.
 *
 * Clover exports free-text names, so this is the only join between a payout row and a
 * staff login. It must stay identical to the expression in the sync_employee_key
 * migration, or a staff member signs in and sees nothing.
 */
export function employeeKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
