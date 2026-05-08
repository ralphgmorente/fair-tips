import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

export async function POST(request: Request) {
  const configuredPassword = process.env.FAIR_TIPS_PASSWORD || process.env.APP_PASSWORD;

  if (!configuredPassword) {
    return NextResponse.json(
      {
        ok: false,
        message: "Password is not configured. Set FAIR_TIPS_PASSWORD in the environment."
      },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const submittedPassword = typeof body?.password === "string" ? body.password : "";

  if (!submittedPassword || !passwordsMatch(submittedPassword, configuredPassword)) {
    return NextResponse.json(
      {
        ok: false,
        message: "Password is incorrect."
      },
      { status: 401 }
    );
  }

  return NextResponse.json({ ok: true });
}

function passwordsMatch(submittedPassword: string, configuredPassword: string) {
  const submitted = Buffer.from(submittedPassword);
  const configured = Buffer.from(configuredPassword);

  if (submitted.length !== configured.length) {
    return false;
  }

  return timingSafeEqual(submitted, configured);
}
