import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const VENDOR_CHUNKS: readonly [name: string, pattern: RegExp][] = [
  ['vendor-react', /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/],
  ['vendor-ui', /[\\/]node_modules[\\/](radix-ui|@radix-ui|react-resizable-panels|lucide-react)[\\/]/],
  ['vendor-graphics', /[\\/]node_modules[\\/](culori|d3-path|es-toolkit|zustand)[\\/]/],
];

export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        // React Compiler: automatic memoization, so unchanged subtrees skip re-rendering.
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
  server: {
    port: 5174,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => VENDOR_CHUNKS.find(([, pattern]) => pattern.test(id))?.[0],
      },
    },
  },
});
