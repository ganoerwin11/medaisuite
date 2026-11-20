import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const copyWidgetLoader = {
  name: "copy-widget-loader",
  async closeBundle() {
    const widgetOutput = path.resolve(projectRoot, "dist", "widget");
    await mkdir(widgetOutput, { recursive: true });
    await copyFile(
      path.resolve(projectRoot, "public-widget", "loader.js"),
      path.join(widgetOutput, "loader.js"),
    );
  },
};

export default defineConfig({
  root: "client",
  plugins: [react(), copyWidgetLoader],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/widget": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
