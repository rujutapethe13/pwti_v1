"use client";

/**
 * Supabase Browser Client
 *
 * Creates a single Supabase client instance for use in client components
 * (`"use client"`). Follows the Supabase SSR pattern for Next.js App Router.
 *
 * The client uses the anon key (safe for public exposure) and reads
 * environment variables validated by `@/config/env`.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   import { supabase } from "@/lib/supabase/client";
 *   const { data } = await supabase.from("table").select("*");
 * ────────────────────────────────────────────────────────────
 */

import { createBrowserClient } from "@supabase/ssr";

import { clientEnv } from "@/config/env";

export function createClient() {
  return createBrowserClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export const supabase = new Proxy(
  {} as ReturnType<typeof createClient>,
  {
    get(_target, prop: string | symbol) {
      if (!supabaseInstance) {
        supabaseInstance = createClient();
      }
      const value = (supabaseInstance as unknown as Record<string, unknown>)[
        prop as string
      ];
      return typeof value === "function" ? value.bind(supabaseInstance) : value;
    },
  },
);
