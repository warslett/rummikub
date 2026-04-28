import { defineConfig } from "vitest/config";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@rummikub/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
});
