import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Backend FastAPI server (token issuance, health, config).
      "/api": "http://localhost:8000",
    },
  },
});
