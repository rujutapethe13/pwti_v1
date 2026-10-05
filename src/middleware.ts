/**
 * Next.js Middleware
 *
 * Runs on every request. Delegates session refresh to the Supabase
 * middleware helper. Expand matcher as routes are added.
 *
 * ── Note ───────────────────────────────────────────────────
 * The `matcher` config excludes static assets and Next.js internals
 * to avoid unnecessary middleware execution.
 * ────────────────────────────────────────────────────────────
 */

import { type NextRequest, NextResponse } from "next/server";

import { getRequestRole, updateSession } from "@/lib/supabase/middleware";

export const runtime = "nodejs";

/**
 * Routes that only internal roles may enter.
 *
 * UX only. Each of these surfaces is separately closed in the database — the
 * Overview RPCs are granted to service_role only, and the Client 360 and search
 * policies admit admin and staff. A user who reaches this far is asked to leave;
 * a user who bypasses this file still gets nothing from the database.
 */
const INTERNAL_ONLY_PREFIXES = [
  "/overview",
  "/client-360",
  "/client-search",
  "/client-dashboard",
  "/daily-activity",
  "/analytics",
];

const ADMIN_ONLY_PREFIXES = ["/admin", "/settings/users"];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const devAutoLoginAllowed =
    process.env.NODE_ENV === "development" &&
    isLocalhost(request) &&
    isAllowedForDevAutoLogin(pathname, request.method);

  const { response, user } = await updateSession(request, devAutoLoginAllowed);

  const isAuthRoute = pathname.startsWith("/signin") || pathname.startsWith("/signup");
  const isPublicRoute =
    pathname === "/auth/callback" ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password");
  const isApiRoute = pathname.startsWith("/api");

  if (!user && !isAuthRoute && !isPublicRoute) {
    // API routes must return structured JSON errors, never an HTML redirect.
    // An unauthenticated /api request (e.g. an internal fetch from a Server
    // Action that did not forward cookies) should get a clean 401 JSON body so
    // callers can parse it, rather than a 307 that `fetch` follows to a 200
    // sign-in HTML page — which would break JSON parsing on the caller.
    if (isApiRoute) {
      return NextResponse.json(
        { success: false, error: "Authentication required", details: null },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL("/workspace", request.url));
  }

  // Role gates. The role is read from the database for this request rather than
  // from a JWT claim, so a demotion takes effect on the next navigation instead
  // of whenever the token happens to expire. An unresolved role is treated as
  // 'client', the most restricted one, so a database hiccup closes the door
  // rather than opening it.
  //
  // These checks are UX. Each of these surfaces is separately closed in the
  // database: the Overview RPCs are granted to service_role only, and the Client
  // 360 and search policies admit admin and staff.
  const needsRoleGate =
    matchesPrefix(pathname, INTERNAL_ONLY_PREFIXES) ||
    matchesPrefix(pathname, ADMIN_ONLY_PREFIXES);

  if (user && needsRoleGate) {
    const role = await getRequestRole(request);
    const needsAdmin = matchesPrefix(pathname, ADMIN_ONLY_PREFIXES);
    const allowed = needsAdmin
      ? role === "admin"
      : role === "admin" || role === "staff";

    if (!allowed) {
      if (isApiRoute) {
        return NextResponse.json(
          { success: false, error: "Forbidden", details: null },
          { status: 403 },
        );
      }
      return NextResponse.redirect(new URL("/access-required", request.url));
    }
  }

  return response;
}

function isLocalhost(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isAllowedForDevAutoLogin(pathname: string, method: string) {
  if (method !== "GET") return false;
  if (pathname.startsWith("/api")) return false;
  if (pathname.startsWith("/auth/callback")) return false;
  return true;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - .well-known (security/.well-known)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
