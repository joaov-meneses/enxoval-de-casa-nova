import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const toolInput = input.tool_input ?? {}
const patch = String(toolInput.command ?? toolInput.patch ?? '')
const paths = [toolInput.file_path, ...[...patch.matchAll(/^\+\+\+ (?:b\/)?(.+)$/gm)].map((m) => m[1])]
  .filter(Boolean)
  .map((p) => String(p).replace(/\\/g, '/').replace(/^\//, ''))

const protections = [
  [/(^|\/)\.env(\.(?!example$)[^/]+)?$/i, 'Arquivos .env contêm segredos. Edite .env.example.'],
  [/(^|\/)package-lock\.json$/i, 'O lockfile é gerado pelo npm. Use npm install para atualizá-lo.'],
  [/(^|\/)(dist|node_modules|test-results|playwright-report)\//i, 'Diretório gerado. Edite a fonte.'],
  [/(^|\/)design\/inventario\/capturas-brutas\//i, 'Capturas brutas podem conter dados pessoais e não são versionadas.'],
]

for (const path of paths) {
  for (const [regex, reason] of protections) {
    if (regex.test(path)) {
      console.error(`Bloqueado (${path}): ${reason}`)
      process.exit(2)
    }
  }
}
