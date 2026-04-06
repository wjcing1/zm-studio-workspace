import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = process.cwd();

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env.TLDRAW_ENV": JSON.stringify("production"),
    "process.env.VITE_TLDRAW_LICENSE_KEY": JSON.stringify(""),
  },
  build: {
    emptyOutDir: false,
    outDir: path.join(rootDir, "scripts", "generated", "workspace"),
    lib: {
      entry: path.join(rootDir, "src", "workspace", "main.tsx"),
      formats: ["es"],
      fileName: () => "workspace-app.js",
      cssFileName: "workspace-app",
    },
    rollupOptions: {
      output: {
        assetFileNames: "[name][extname]",
      },
    },
  },
});
