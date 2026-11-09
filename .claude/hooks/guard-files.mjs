// PreToolUse (Edit|Write): protege segredos, lockfile e artefatos gerados.
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const caminho = String(input.tool_input?.file_path ?? '').replace(/\\/g, '/')

const protegidos = [
  [/(^|\/)\.env(\.(?!example$)[^/]+)?$/, 'Arquivos .env contêm segredos. Edite .env.example e peça ao usuário para ajustar o real.'],
  [/(^|\/)package-lock\.json$/, 'O lockfile é gerado pelo npm. Use `npm install <pacote>`.'],
  [/(^|\/)(dist|node_modules|test-results|playwright-report)\//, 'Diretório gerado. Edite a fonte.'],
  [/(^|\/)design\/inventario\/capturas-brutas\//, 'Capturas brutas podem ter dados pessoais e não são versionadas.'],
]

for (const [regex, mensagem] of protegidos) {
  if (regex.test(caminho)) {
    console.error(`Bloqueado (${caminho}): ${mensagem}`)
    process.exit(2)
  }
}
