"use client";

/**
 * ThemeProvider
 *
 * Wraps the app with `next-themes` for dark/light mode support.
 * Uses ShadCN's theming conventions — CSS variables in `globals.css`
 * handle the actual color changes; this just manages the `class` toggle.
 *
 * ── Why "attribute"="class" ────────────────────────────────
 * ShadCN/Tailwind use CSS class-based theming (`.dark` class on `<html>`).
 * `next-themes` syncs the user preference and persists it.
 * ────────────────────────────────────────────────────────────
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ThemeProviderProps } from "next-themes";
import type { ReactNode } from "react";

type Props = ThemeProviderProps & { children: ReactNode };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ThemesProvider = NextThemesProvider as any;

export function ThemeProvider({ children, ...props }: Props) {
  return (
    <ThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </ThemesProvider>
  );
}

