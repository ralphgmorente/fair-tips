import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The throttle needs the server-only secret key. If it is absent the app should still let
 * people sign in — an unthrottled login is bad, a login nobody can use is worse — so every
 * entry point below degrades to a no-op and says so in the logs.
 */
function adminClientOrNull() {
  if (!process.env.SUPABASE_SECRET_KEY) {
    console.warn("SUPABASE_SECRET_KEY is not set; sign-in throttling is disabled.");
    return null;
  }

  try {
    return createAdminClient();
  } catch (error) {
    console.error("login throttle client unavailable", error);
    return null;
  }
}

/** Failed attempts allowed per IP + email pair before sign-in is refused. */
const MAX_ATTEMPTS = 10;
/** How far back failed attempts are counted, and how long a lockout therefore lasts. */
const WINDOW_MINUTES = 15;

/**
 * Neither the client IP nor its pairing with an email is stored in the clear — only this
 * digest, so the throttle table is not a record of who tried to sign in from where.
 */
function identifierFor(ip: string, email: string) {
  return createHash("sha256").update(`${ip}|${email.toLowerCase()}`).digest("hex");
}

function windowStart() {
  return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
}

/**
 * Returns true when this IP + email pair has exhausted its attempts.
 *
 * A database error here deliberately does NOT block the login: an unreachable throttle
 * table should degrade to "unthrottled", not lock every manager out of payroll night.
 */
export async function isRateLimited(ip: string, email: string): Promise<boolean> {
  const supabase = adminClientOrNull();
  if (!supabase) {
    return false;
  }

  const { count, error } = await supabase
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("identifier", identifierFor(ip, email))
    .gte("attempted_at", windowStart());

  if (error) {
    console.error("login throttle lookup failed", error);
    return false;
  }

  return (count ?? 0) >= MAX_ATTEMPTS;
}

export async function recordFailedAttempt(ip: string, email: string): Promise<void> {
  const supabase = adminClientOrNull();
  if (!supabase) {
    return;
  }

  const identifier = identifierFor(ip, email);

  const { error } = await supabase.from("login_attempts").insert({ identifier });
  if (error) {
    console.error("login throttle insert failed", error);
  }

  // Opportunistic pruning, so the table cannot grow without bound.
  await supabase.from("login_attempts").delete().lt("attempted_at", windowStart());
}

/** Clears the counter after a successful sign-in so a legitimate user is never locked out. */
export async function clearAttempts(ip: string, email: string): Promise<void> {
  const supabase = adminClientOrNull();
  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from("login_attempts")
    .delete()
    .eq("identifier", identifierFor(ip, email));

  if (error) {
    console.error("login throttle clear failed", error);
  }
}

export const RATE_LIMIT_WINDOW_MINUTES = WINDOW_MINUTES;
