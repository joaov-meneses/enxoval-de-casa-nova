import { readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });
dotenv.config({ quiet: true });
const directory = path.resolve('dist');
const cli = path.resolve('node_modules/@posthog/cli/run-posthog-cli.js');
const upload = process.env.POSTHOG_UPLOAD_SOURCEMAPS === 'true';
function run(args) {
  const result = spawnSync(process.execPath, [cli, 'sourcemap', ...args, '--directory', directory], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Falha ao preparar ou enviar source maps ao PostHog.');
}
async function removeMaps(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) await removeMaps(file);
    else if (entry.isFile() && entry.name.endsWith('.map')) await rm(file);
  }
}
try {
  if (upload) {
    if (!process.env.POSTHOG_CLI_API_KEY || !process.env.POSTHOG_CLI_PROJECT_ID) {
      throw new Error('Configure POSTHOG_CLI_API_KEY e POSTHOG_CLI_PROJECT_ID para enviar source maps.');
    }
    run(['inject']);
    run(['upload', '--delete-after']);
  } else {
    console.log('PostHog: envio de source maps desligado; mapas removidos do build público.');
  }
} finally {
  // Source maps include source code. Never leave them in Express's static folder,
  // including when an upload fails or is disabled for a local build.
  await removeMaps(directory);
}
