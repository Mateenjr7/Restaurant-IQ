import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const cacheRoot = process.env.LOCALAPPDATA
  ?? process.env.XDG_CACHE_HOME
  ?? path.join(process.env.HOME ?? process.env.USERPROFILE ?? process.cwd(), '.cache');

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    cacheDir: path.join(cacheRoot, 'restaurantiq', 'vite'),
    resolve: {
      alias: {
        '@': projectRoot,
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
