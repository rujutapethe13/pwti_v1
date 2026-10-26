import type { Metadata } from "next";

import { DM_Serif_Display, Figtree, Inter } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatusLabelMigration } from "@/components/shared/status-label-migration";
import { UserProvider } from "@/lib/user-context";
import { WorkspaceProvider } from "@/lib/workspace-context";
import { siteConfig } from "@/config/site";
import "@/styles/globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/* Editorial display face. Exposed as `--font-dm-serif` so the
   `font-display` utility and `.metric-figure` can reach it without a
   second network request to a font CDN. */
const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dm-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${figtree.variable} ${inter.variable} ${dmSerif.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delayDuration={300}>
            {/* Outside WorkspaceProvider: the top bar, not the provider, binds the
                active workspace into it, so there is no cycle between them. */}
            <UserProvider>
              <WorkspaceProvider>
                {/* One-time repair of Status column labels (runs once per app load). */}
                <StatusLabelMigration />
                {children}
              </WorkspaceProvider>
            </UserProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
