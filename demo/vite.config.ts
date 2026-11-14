import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api goes to a locally running backend. In compose, nginx does the same job.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // design/tokens.css and the SDK live one level up.
    fs: { allow: [".."] },
    proxy: { "/api": "http://localhost:8080" },
  },
});
