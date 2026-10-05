import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* ── Path Aliases ───────────────────────────────────────────
   * Base alias is set in tsconfig.json; this extends it for
   * runtime resolution. Feature-based folders are mapped so
   * imports stay clean: `import { x } from "@/features/boards"`.
   * ──────────────────────────────────────────────────────────── */
  experimental: {
    // Enable for improved static analysis in Next 15
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
    ],
  },

  /* ── Image domains (placeholder — expand as needed) ─────── */
  images: {
    // Future: add S3 / Supabase storage domains here
    remotePatterns: [],
  },
};

export default nextConfig;

