// Stop: se há .ts/.tsx alterado, roda `npm run lint` (tsc --noEmit).
// Falhou → código 2 devolve o erro ao agente para corrigir. Roda uma vez só (stop_hook_active evita laço).
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
if (input.stop_hook_active) process.exit(0)
if (!existsSync('node_modules')) process.exit(0)

const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout ?? ''
const mexeuEmTs = status.split('\n').some((l) => /\.(ts|tsx)\s*$/.test(l))
if (!mexeuEmTs) process.exit(0)

const r = spawnSync('npm', ['run', 'lint'], { encoding: 'utf8', shell: true, timeout: 170_000 })
if (r.status !== 0) {
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n')
  console.error(`npm run lint falhou. Corrija antes de encerrar:\n${saida}`)
  process.exit(2)
}
