/**
 * Site Configuration
 *
 * Central place for app-wide metadata and navigation constants.
 * Keeps hardcoded strings out of components and makes
 * rebranding / i18n easier in the future.
 *
 * ── Usage ──────────────────────────────────────────────────
 *   import { siteConfig } from "@/config/site";
 * ────────────────────────────────────────────────────────────
 */

export const siteConfig = {
  name: "Powerweave Studio OS",
  description:
    "A no-code Production Operating System for creative production studios — boards, batches, analytics, and AI insights.",

  /** Used for SEO <title> suffix and OG tags */
  tagline: "Studio Operations, Connected.",

  /** URLs */
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",

  /** Navigation — expand as new domains are added */
  nav: {
    main: [
      { label: "Boards", href: "/boards" },
      { label: "Batches", href: "/batches" },
      { label: "Clients", href: "/clients" },
      { label: "Analytics", href: "/analytics" },
    ],
  } as const,

  /** Feature flags (future) */
  features: {
    aiInsights: false,
    connectedBoards: false,
  } as const,
} as const;

export type SiteConfig = typeof siteConfig;

