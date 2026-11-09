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
  [/--no-verify|--no-gpg-sign/, 'Não pule hooks nem assinatura de commit.'],
]

for (const [regex, mensagem] of regras) {
  if (regex.test(cmd)) {
    console.error(`Bloqueado: ${mensagem}`)
    process.exit(2)
  }
}

// O stash é compartilhado entre todas as worktrees e sessões: só passa o que não
// pode pegar ou apagar a entrada de outra pessoa.
const STASH_AJUDA =
  'O stash é compartilhado entre worktrees. Prefira um commit WIP. Se precisar: ' +
  '`git stash push -u -m "<tag>"`, guarde o SHA com `git stash list --format="%H %gs"`, ' +
  'restaure com `git stash apply <sha>` e, para descartar, localize a posição pela tag no mesmo comando: ' +
  '`git stash drop "$(git stash list --format=%gd --grep=<tag>)"`.'

const motivoStash = (args) => {
  const [sub = '', ...resto] = args
  const temMensagem = args.some((a) => a === '-m' || a === '--message' || a.startsWith('--message=') || /^-[a-zA-Z]*m/.test(a))
  const posicional = (a) => /^(refs\/)?stash(@\{\d+\})?$/.test(a) || /^\d+$/.test(a)
  if (sub === '' || sub.startsWith('-')) return temMensagem ? null : 'stash sem `-m "<tag>"` não identifica a entrada.'
  if (sub === 'push') return temMensagem ? null : '`git stash push` precisa de `-m "<tag>"`.'
  if (['list', 'show', 'create'].includes(sub)) return null
  if (sub === 'apply') {
    const alvo = resto.find((a) => !a.startsWith('-'))
    if (!alvo || posicional(alvo)) return '`git stash apply` só por SHA, nunca pela posição.'
    return null
  }
  if (sub === 'drop') {
    const alvo = resto.find((a) => !a.startsWith('-'))
    if (!alvo || posicional(alvo)) return '`git stash drop` pela posição fixa pode apagar a entrada de outra sessão.'
    return null
  }
  // pop, clear, branch, save, store e afins aplicam e apagam, ou apagam tudo.
  return `\`git stash ${sub}\` não é permitido.`
}

// Separa os comandos encadeados, respeitando aspas e $(...), e analisa cada `git ... stash`.
const segmentos = []
let atual = ''
let aspas = null
let sub = 0
for (let i = 0; i < cmd.length; i++) {
  const c = cmd[i]
  if (aspas) {
    if (c === aspas) aspas = null
    else if (c === '$' && cmd[i + 1] === '(' && aspas === '"') { sub++; atual += c + cmd[++i]; continue }
    else if (c === ')' && sub > 0) sub--
    atual += c
    continue
  }
  if (c === '"' || c === "'") { aspas = c; atual += c; continue }
  if (c === '$' && cmd[i + 1] === '(') { sub++; atual += c + cmd[++i]; continue }
  if (c === ')' && sub > 0) { sub--; atual += c; continue }
  if (sub === 0 && (c === ';' || c === '|' || c === '&' || c === '\n')) { segmentos.push(atual); atual = ''; continue }
  atual += c
}
segmentos.push(atual)

const tokens = (s) => (s.match(/"(?:[^"\\]|\\.)*"|'[^']*'|\S+/g) ?? []).map((t) => t.replace(/^(["'])([\s\S]*)\1$/, '$2'))
for (const segmento of segmentos) {
  const t = tokens(segmento)
  const g = t.findIndex((x) => x === 'git' || /[\\/]git(\.exe)?$/.test(x))
  if (g < 0) continue
  let i = g + 1
  while (i < t.length && t[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree'].includes(t[i]) ? 2 : 1
  if (t[i] !== 'stash') continue
  const motivo = motivoStash(t.slice(i + 1))
  if (motivo) {
    console.error(`Bloqueado: ${motivo} ${STASH_AJUDA}`)
    process.exit(2)
  }
}
