import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // CI builds may deploy under a COS prefix; set VITE_BASE (e.g. /crawl-bear/).
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist" },
});
