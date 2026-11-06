// PreToolUse (Bash): bloqueia comandos git destrutivos ou que burlam o fluxo do projeto.
// Saída com código 2 devolve a mensagem de stderr ao agente.
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8') || '{}')
const cmd = String(input.tool_input?.command ?? '')

const regras = [
  [/git\s+push\b[^\n]*(--force|--force-with-lease|\s-f\b)/, 'Push forçado não é permitido. Peça ao usuário.'],
  [/git\s+push\b[^\n]*\b(main|master)\b/, 'Push direto em main não é permitido. Use develop → homologacao → main via PR.'],
  [/git\s+reset\s+--hard/, 'git reset --hard descarta trabalho. Prefira um commit WIP ou peça confirmação.'],
  [/git\s+(checkout|restore)\s+(--\s+)?\.(\s|$)/, 'Isso descarta todas as mudanças locais. Peça confirmação.'],
  [/git\s+clean\s+[^\n]*-[a-z]*f/, 'git clean -f apaga arquivos não rastreados. Peça confirmação.'],
  [/git\s+stash(\s+pop|\s+drop|\s+clear)?\s*($|[;&|])/, 'O stash é compartilhado entre worktrees. Use `git stash push -u -m "<tag>"` e `git stash apply <sha>`, ou um commit WIP.'],
  [/--no-verify|--no-gpg-sign/, 'Não pule hooks nem assinatura de commit.'],
]

for (const [regex, mensagem] of regras) {
  if (regex.test(cmd)) {
    console.error(`Bloqueado: ${mensagem}`)
    process.exit(2)
  }
}
