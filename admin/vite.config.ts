import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// In dev, /api goes to a locally running backend. In compose, nginx does the same job.
export default defineConfig({
  plugins: [react()],
  // Tests read design/tokens.css?raw (contrast.test.ts), so CSS must not be stubbed out.
  test: { css: true },
  server: {
    port: 5173,
    // design/tokens.css lives one level up, shared with the demo.
    fs: { allow: [".."] },
    proxy: { "/api": "http://localhost:8080", "/mcp": "http://localhost:8080" },
  },
});
