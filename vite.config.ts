import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    build: { sourcemap: 'hidden' as const },
    // Versão publicada (commit da Railway) nos eventos e exceções do navegador, para alertas por versão.
    define: {
      __APP_VERSION__: JSON.stringify(
        process.env.APP_VERSION?.trim() || process.env.RAILWAY_GIT_COMMIT_SHA?.trim().slice(0, 7) || 'dev',
      ),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
