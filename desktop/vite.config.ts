import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects a fixed dev port (see src-tauri/tauri.conf.json devUrl).
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({
      presets: [reactCompilerPreset({ target: "19" })],
    }),
  ],
  clearScreen: false,
  resolve: {
    alias: [
      {
        find: "@warpforge/protocol",
        replacement: fileURLToPath(new URL("../packages/protocol/src/index.ts", import.meta.url)),
      },
      {
        find: /@warpforge\/daemon\/(.+)/,
        replacement: `${fileURLToPath(new URL("../packages/daemon/src", import.meta.url))}/$1.ts`,
      },
      {
        find: "@warpforge/daemon",
        replacement: fileURLToPath(new URL("../packages/daemon/src/index.ts", import.meta.url)),
      },
      {
        find: /@warpforge\/core\/(.+)/,
        replacement: `${fileURLToPath(new URL("../packages/core/src", import.meta.url))}/$1.ts`,
      },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: "vendor-react", test: /node_modules\/(react|react-dom|scheduler)/ },
            { name: "vendor-query", test: /node_modules\/@tanstack/ },
            { name: "vendor-radix", test: /node_modules\/@radix-ui/ },
            { name: "vendor-codemirror", test: /node_modules\/@codemirror/ },
            { name: "daemon", test: /src\/daemon\// },
          ],
        },
      },
    },
  },
});
