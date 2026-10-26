import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the site at /<repo>/
export default defineConfig({
  base: "/run_program/",
  plugins: [react()],
});
