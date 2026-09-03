"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_WINDOW_MINUTES,
  clearAttempts,
  isRateLimited,
  recordFailedAttempt
} from "@/lib/rate-limit";

export type LoginState = { error: string };

/** Only allow redirecting back to a path on this app, never to another origin. */
function safeRedirectTo(value: FormDataEntryValue | null) {
  const target = typeof value === "string" ? value : "";
  return target.startsWith("/") && !target.startsWith("//") ? target : "/";
}

/**
 * Best-effort client address. x-forwarded-for is set by the platform proxy; the value is
 * only ever used as a throttling key, never for authorization, so a spoofed header buys
 * an attacker nothing beyond their own bucket.
 */
async function clientIp() {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  return headerList.get("x-real-ip") ?? "unknown";
}

export async function signIn(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const ip = await clientIp();

  if (await isRateLimited(ip, email)) {
    return {
      error: `Too many sign-in attempts. Try again in ${RATE_LIMIT_WINDOW_MINUTES} minutes.`
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await recordFailedAttempt(ip, email);
    // Deliberately generic: never reveal whether the email exists.
    return { error: "Email or password is incorrect." };
  }

  await clearAttempts(ip, email);

  redirect(safeRedirectTo(formData.get("redirectTo")));
}
