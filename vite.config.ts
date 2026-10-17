import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so dist/ works on any static host / subpath.
  base: './',
  server: {
    host: true,
    port: 3847,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 3847,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
  },
});
