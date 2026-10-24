import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {defineConfig, type Plugin} from 'vite';

function storeOfflineAssets(): Plugin {
  return { name: 'store-offline-assets', apply: 'build', generateBundle(_options, bundle) {
    const selected = new Set<string>();
    const visit = (file: string) => {
      if (selected.has(file)) return;
      const entry = bundle[file];
      if (!entry) return;
      selected.add(file);
      if (entry.type === 'chunk') entry.imports.forEach(visit);
    };
    for (const entry of Object.values(bundle)) {
      if (entry.type === 'chunk' && (entry.isEntry || ['App', 'OfflineStore', 'StoreRoute'].includes(entry.name))) visit(entry.fileName);
      if (entry.type === 'asset' && entry.fileName.endsWith('.css')) selected.add(entry.fileName);
    }
    const assets = [...selected].sort().map(file => `/${file}`);
    const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);
    this.emitFile({ type: 'asset', fileName: 'store-offline-assets.json', source: JSON.stringify({ version, assets }) });
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: readFileSync(path.resolve(__dirname, 'public/sw.js'), 'utf8').replace('__STORE_BUILD__', version) });
  } };
}

export default defineConfig(() => {
  return {
    build: { sourcemap: 'hidden' as const },
    // Versão publicada (commit da Railway) nos eventos e exceções do navegador, para alertas por versão.
    define: {
      __APP_VERSION__: JSON.stringify(
        process.env.APP_VERSION?.trim() || process.env.RAILWAY_GIT_COMMIT_SHA?.trim().slice(0, 7) || 'dev',
      ),
    },
    plugins: [react(), tailwindcss(), storeOfflineAssets()],
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
