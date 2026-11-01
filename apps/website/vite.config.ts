import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages 项目站点部署在子路径下，用 VITE_BASE 指定（例如 /DigBear/）。
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist" },
});
