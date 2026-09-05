import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on every path except static assets and image files, so that no page or route
     * handler is reachable without a verified session.
     *
     * sw.js and the web manifest are excluded on purpose: the browser fetches both
     * without credentials before anyone signs in, and redirecting them to /login makes
     * the app fail to install. Neither exposes any data.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"
  ]
};
