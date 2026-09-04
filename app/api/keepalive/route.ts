import { NextResponse } from "next/server";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Keeps the Supabase project awake.
 *
 * The free tier pauses a project after roughly a week without database activity, which
 * takes the login down and only the account owner can resume it. A Vercel cron calls this
 * daily (see vercel.json) and it issues a real query so the pause timer resets.
 *
 * The route reads nothing and returns no data: row level security gives an anonymous
 * caller an empty set, so the response only ever says whether the database answered.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getSupabaseConfig();

  if (!config) {
    return NextResponse.json(
      { ok: false, reason: "Supabase is not configured." },
      { status: 503 }
    );
  }

  try {
    const response = await fetch(
      `${config.url}/rest/v1/profiles?select=id&limit=1`,
      {
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${config.publishableKey}`
        },
        cache: "no-store"
      }
    );

    return NextResponse.json(
      { ok: response.ok, status: response.status },
      { status: response.ok ? 200 : 502 }
    );
  } catch (error) {
    console.error("keepalive ping failed", error);
    return NextResponse.json({ ok: false, reason: "unreachable" }, { status: 502 });
  }
}
