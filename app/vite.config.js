import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Build for the Parroquia "home" launcher app (see capacitor.config.ts).
// Deliberately isolated from the VitePress site build: it outputs plain
// static assets under app/dist (Capacitor's webDir) and nothing here touches
// the docs/ pipeline. Use `./` so the built app works from Capacitor's local
// origin and when opened as a plain file for quick checks.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  // Relative base so the built app works from Capacitor's local origin and
  // when opened as a plain file for quick checks.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
