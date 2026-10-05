import { defineConfig } from "vitest/config";
import path from "node:path";
import react from "@vitejs/plugin-react";

const src = path.resolve(__dirname, "src");

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/tests/setup.ts"],
    alias: {
      "@": src,
      "@/components": path.join(src, "components"),
      "@/lib": path.join(src, "lib"),
      "@/features": path.join(src, "features"),
      "@/types": path.join(src, "types"),
      "@/config": path.join(src, "config"),
      "@/hooks": path.join(src, "hooks"),
      "@/styles": path.join(src, "styles"),
    },
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
    },
  },
  resolve: {
    alias: {
      "@": src,
      "@/components": path.join(src, "components"),
      "@/lib": path.join(src, "lib"),
      "@/features": path.join(src, "features"),
      "@/types": path.join(src, "types"),
      "@/config": path.join(src, "config"),
      "@/hooks": path.join(src, "hooks"),
      "@/styles": path.join(src, "styles"),
      "server-only": path.resolve(src, "tests/mocks/server-only.ts"),
    },
  },
});
