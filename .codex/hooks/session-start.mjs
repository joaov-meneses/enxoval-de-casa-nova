import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const git = (...args) => spawnSync('git', args, { encoding: 'utf8' }).stdout?.trim() ?? ''
const branch = git('rev-parse', '--abbrev-ref', 'HEAD') || 'desconhecida'
const changes = git('status', '--porcelain').split('\n').filter(Boolean).length
const worktree = git('rev-parse', '--git-dir') !== git('rev-parse', '--git-common-dir')
const lines = [`Casa Mia — branch ${branch}${worktree ? ' (worktree)' : ''}, ${changes} arquivo(s) com mudanças locais.`]
if (!existsSync('node_modules')) lines.push('node_modules ausente: rode npm ci antes de lint, build ou testes.')
if (['main', 'master'].includes(branch)) lines.push('Você está em main. Trabalhe em branch derivada de develop.')
lines.push('Fluxo proporcional ao risco: consulte AGENTS.md e a skill $entregar-mudanca-codex.')
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') } }))
