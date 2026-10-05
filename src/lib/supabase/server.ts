/**
 * Supabase Server Client
 *
 * Creates a Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Reads cookies from `next/headers` for session
 * management, following Supabase's SSR pattern.
 *
 * ── Usage (Server Component) ───────────────────────────────
 *   import { createClient } from "@/lib/supabase/server";
 *   import { cookies } from "next/headers";
 *   const supabase = await createClient(await cookies());
 * ────────────────────────────────────────────────────────────
 */

import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

import { clientEnv, serverEnv } from "@/config/env";

export async function createClient(cookieStore?: ReadonlyRequestCookies) {
  const store = cookieStore ?? (await import("next/headers")).cookies();

  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        },
      },
    },
  );
}

export async function createServiceClient() {
  return createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    },
  );
}

