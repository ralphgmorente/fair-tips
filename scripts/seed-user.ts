/**
 * Creates (or updates) a ShiftFlow login.
 *
 * Self-signup is disabled, so accounts are created here with the Supabase secret key.
 * That key is server-only and must never reach the browser.
 *
 *   npm run seed:user
 *   npm run seed:user -- --email manager@example.com --password 'correct horse' --name 'Ana Diaz' --role admin
 *
 * A staff account must be linked to the name exactly as it appears in the Clover
 * timesheet, or they will sign in and see nothing:
 *
 *   npm run seed:user -- --email caio@example.com --password 'a good password' \
 *     --name 'Caio Corazzari' --role staff --employee 'Caio Corazzari'
 */
import { createClient } from "@supabase/supabase-js";
import { employeeKey } from "../lib/employee-key";

type Args = Record<string, string>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = "true";
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local before seeding."
    );
  }

  const email = args.email || process.env.SEED_ADMIN_EMAIL || "mark@vibecode.review";
  const password = args.password || process.env.SEED_ADMIN_PASSWORD || "123456";
  const fullName = args.name || process.env.SEED_ADMIN_NAME || "ShiftFlow Manager";
  const role = args.role || process.env.SEED_ADMIN_ROLE || "admin";
  // Staff are matched to their payouts by timesheet name; default to their full name.
  const employee = args.employee || (role === "staff" ? fullName : "");

  if (role === "staff" && !employee) {
    throw new Error("A staff account needs --employee '<name as it appears in the timesheet>'.");
  }

  if (password.length < 6) {
    throw new Error(
      `Password must be at least 6 characters — Supabase Auth rejects anything shorter. Got ${password.length}.`
    );
  }

  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Role lives in app_metadata, never user_metadata: user_metadata is editable by the
  // user themselves and must never drive an authorization decision.
  const attributes = {
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: employee ? { role, employee_key: employeeKey(employee) } : { role }
  };

  const { data: created, error: createError } =
    await supabase.auth.admin.createUser(attributes);

  if (!createError) {
    console.log(
      `Created ${email} (${role}${employee ? `, paid as "${employee}"` : ""}), id ${created.user?.id}`
    );
    return;
  }

  const alreadyExists =
    createError.status === 422 || /already been registered/i.test(createError.message);

  if (!alreadyExists) {
    throw createError;
  }

  // Already there — reset the password and role so the script is safe to re-run.
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    throw listError;
  }

  const existing = list.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  );
  if (!existing) {
    throw new Error(`${email} reported as existing but was not found.`);
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(
    existing.id,
    attributes
  );
  if (updateError) {
    throw updateError;
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      email,
      full_name: fullName,
      role,
      ...(employee ? { employee_key: employeeKey(employee) } : {})
    })
    .eq("id", existing.id);
  if (profileError) {
    throw profileError;
  }

  console.log(
    `Updated existing ${email} (${role}${employee ? `, paid as "${employee}"` : ""}), id ${existing.id}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
