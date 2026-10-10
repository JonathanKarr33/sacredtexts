/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Pure client-side SPA. `base: '/'` (absolute asset URLs) so deep links such as
// `/t/sunni-islam/JLS-001` resolve `/assets/...` correctly on a root-served host (Railway).
// A relative base ('./') would break asset loading on nested routes.
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
