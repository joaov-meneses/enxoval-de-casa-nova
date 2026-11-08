import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const cmd = String(input.tool_input?.command ?? '')
const rules = [
  [/git\s+push\b[^\n]*(--force|--force-with-lease|\s-f\b)/i, 'Push forçado não é permitido.'],
  [/git\s+push\b[^\n]*\b(main|master)\b/i, 'Push direto em main não é permitido. Use develop → homologacao → main via PR.'],
  [/git\s+reset\s+--hard/i, 'git reset --hard descarta trabalho. Prefira um commit WIP.'],
  [/git\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/i, 'Esse comando descarta mudanças locais.'],
  [/git\s+clean\s+[^\n]*-[a-z]*f/i, 'git clean -f apaga arquivos não rastreados.'],
  [/git\s+stash(\s+(pop|drop|clear))?\s*($|[;&|])/i, 'O stash é compartilhado entre worktrees; prefira um commit WIP.'],
  [/--no-verify|--no-gpg-sign/i, 'Não pule hooks nem assinatura de commit.'],
]

for (const [regex, reason] of rules) {
  if (regex.test(cmd)) {
    console.error(`Bloqueado: ${reason}`)
    process.exit(2)
  }
}
