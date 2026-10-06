import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Same transform the app runs (vite.config.ts), React Compiler included.
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset({ target: "19" })] })],
  test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx"] },
});
