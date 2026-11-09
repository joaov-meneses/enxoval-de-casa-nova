import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
if (input.stop_hook_active || !existsSync('node_modules')) process.exit(0)
const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).stdout ?? ''
const changedTypeScript = status.split('\n').some((line) => /\.(ts|tsx)\s*$/.test(line))
if (!changedTypeScript) process.exit(0)

const result = spawnSync('npm', ['run', 'lint'], { encoding: 'utf8', shell: true, timeout: 170_000 })
if (result.status !== 0) {
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n')
  console.error(`npm run lint falhou. Corrija antes de encerrar:\n${output}`)
  process.exit(2)
}
process.exit(0)
