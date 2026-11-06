// SessionStart: o que for impresso entra no contexto da sessão.
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' }).stdout?.trim() ?? ''

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
const alteracoes = git('status', '--porcelain').split('\n').filter(Boolean).length
const emWorktree = git('rev-parse', '--git-dir') !== git('rev-parse', '--git-common-dir')

const linhas = [
  `Casa Mia — branch ${branch}${emWorktree ? ' (worktree)' : ''}, ${alteracoes} arquivo(s) com mudanças locais.`,
]
if (!existsSync('node_modules')) linhas.push('node_modules ausente: rode `npm ci` antes de lint, build ou testes.')
if (['main', 'master'].includes(branch)) linhas.push('Você está em main. Trabalhe em branch derivada de develop.')
linhas.push('Fluxo: Explorar (explorador) → Planejar (planejador) → Implementar em worktree (implementador) → Revisar (revisor) + Testar (testador). Detalhes no CLAUDE.md.')

console.log(linhas.join('\n'))
