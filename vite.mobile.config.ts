// The interface for the Android build: the same renderer as the desktop app,
// with a bridge to the native scanner in place of Electron's.
import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: resolve("src/mobile"),
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve("out/mobile"),
    emptyOutDir: true,
    target: "es2022",
  },
});
