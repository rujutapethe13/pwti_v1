/**
 * Supabase Middleware
 *
 * Handles session refresh on every request. Wraps `createServerClient`
 * for use in `middleware.ts` at the app root. This ensures:
 * 1. Auth cookies are refreshed before page render.
 * 2. Protected routes can check session status.
 * 3. The session is available consistently across server components.
 *
 * ── Usage (in src/middleware.ts) ───────────────────────────
 *   import { updateSession } from "@/lib/supabase/middleware";
 *   export async function middleware(request) {
 *     return await updateSession(request);
 *   }
 * ────────────────────────────────────────────────────────────
 */

import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { clientEnv } from "@/config/env";
import { getDevAutoLoginCredentials } from "@/lib/supabase/dev-auth";
import type { AppRole } from "@/lib/rbac/types";

export async function updateSession(request: NextRequest, enableDevAutoLogin = false) {
  const supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const credentials = enableDevAutoLogin ? getDevAutoLoginCredentials() : null;

  if (!user && credentials) {
    const { error } = await supabase.auth.signInWithPassword(credentials);

    if (!error) {
      const {
        data: { user: devUser },
      } = await supabase.auth.getUser();

      if (devUser?.email_confirmed_at) {
        return { response: supabaseResponse, user: devUser };
      }
    }
  }

  return { response: supabaseResponse, user };
}

/**
 * The caller's role, read from the database for this request.
 *
 * Deliberately not read from a JWT claim. A role cached in app_metadata would go
 * stale the moment an admin demotes someone, so a demoted admin would keep admin
 * for as long as their token lived — which is exactly the "revocation must take
 * effect immediately" property the RBAC model is supposed to have.
 *
 * One RPC on the routes that need it is cheaper than that staleness. Returns
 * null when it cannot be resolved, and callers must treat null as the most
 * restricted role rather than as "internal".
 */
export async function getRequestRole(request: NextRequest): Promise<AppRole | null> {
  try {
    const supabase = createServerClient(
      clientEnv.NEXT_PUBLIC_SUPABASE_URL,
      clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            // Middleware already owns the response cookie writes in
            // updateSession; this client is read-only.
          },
        },
      },
    );

    const { data, error } = await supabase.rpc("current_role", {} as never);
    if (error) return null;

    const role = data as AppRole | null;
    return role ?? "client";
  } catch (error) {
    console.error("[middleware] could not resolve role:", error);
    return null;
  }
}
