import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api goes to a locally running backend. In compose, nginx does the same job.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { "/api": "http://localhost:8080" },
  },
});
