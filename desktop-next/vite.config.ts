import { fileURLToPath, URL } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import babel from "@rolldown/plugin-babel"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [tailwindcss(), react(), babel({ presets: [reactCompilerPreset({ target: "19" })] })],
  clearScreen: false,
  resolve: {
    dedupe: ["react", "react-dom", "lucide-react"],
    alias: [
      {
        find: /@warpforge\/daemon\/(.+)/,
        replacement: `${fileURLToPath(new URL("../packages/daemon/src", import.meta.url))}/$1.ts`,
      },
      {
        find: "@warpforge/daemon",
        replacement: fileURLToPath(new URL("../packages/daemon/src/index.ts", import.meta.url)),
      },
      {
        find: "@warpforge/protocol",
        replacement: fileURLToPath(new URL("../packages/protocol/src/index.ts", import.meta.url)),
      },
      {
        find: /@warpforge\/core\/(.+)/,
        replacement: `${fileURLToPath(new URL("../packages/core/src", import.meta.url))}/$1.ts`,
      },
      {
        find: "@warpforge/ui/styles.css",
        replacement: fileURLToPath(new URL("../packages/ui/src/styles.css", import.meta.url)),
      },
      {
        find: /@warpforge\/ui\/components\/(.+)/,
        replacement: `${fileURLToPath(new URL("../packages/ui/src/components", import.meta.url))}/$1.tsx`,
      },
      {
        find: /@warpforge\/ui\/(lib|hooks)\/(.+)/,
        replacement: `${fileURLToPath(new URL("../packages/ui/src", import.meta.url))}/$1/$2.ts`,
      },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
  server: { port: 5174, strictPort: true },
})
