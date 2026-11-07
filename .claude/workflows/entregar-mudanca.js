export const meta = {
  name: 'entregar-mudanca',
  description: 'Explora, planeja, implementa em worktree, revisa e testa uma mudança no Casa Mia',
  whenToUse: 'Mudança que toca mais de um módulo. args: { tarefa: string, base?: string, testes?: string[] }',
  phases: [
    { title: 'Explorar', detail: 'haiku/high mapeia o código afetado' },
    { title: 'Planejar', detail: 'opus/high desenha o plano', model: 'opus' },
    { title: 'Implementar', detail: 'sonnet/medium em worktree', model: 'sonnet' },
    { title: 'Verificar', detail: 'revisor (opus/high) e testador (sonnet/medium) em paralelo' },
  ],
}

const tarefa = args?.tarefa
if (!tarefa) throw new Error('args.tarefa é obrigatório')
const base = args?.base ?? 'develop'
const testes = args?.testes ?? []

const MAPA = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    arquivos: { type: 'array', items: { type: 'string' } },
    testesRelacionados: { type: 'array', items: { type: 'string' } },
  },
  required: ['resumo', 'arquivos'],
}

const PLANO = {
  type: 'object',
  properties: {
    slug: { type: 'string' },
    passos: { type: 'array', items: { type: 'string' } },
    riscos: { type: 'array', items: { type: 'string' } },
    testes: { type: 'array', items: { type: 'string' } },
    docs: { type: 'array', items: { type: 'string' } },
  },
  required: ['slug', 'passos', 'testes'],
}

const IMPL = {
  type: 'object',
  properties: {
    branch: { type: 'string' },
    worktree: { type: 'string' },
    arquivos: { type: 'array', items: { type: 'string' } },
    resultado: { type: 'string' },
    sucesso: { type: 'boolean' },
  },
  required: ['branch', 'resultado', 'sucesso'],
}

const REVISAO = {
  type: 'object',
  properties: {
    achados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          local: { type: 'string' },
          defeito: { type: 'string' },
          cenario: { type: 'string' },
          gravidade: { type: 'string' },
        },
        required: ['local', 'defeito', 'cenario'],
      },
    },
  },
  required: ['achados'],
}

const TESTES = {
  type: 'object',
  properties: {
    todosPassaram: { type: 'boolean' },
    comandos: {
      type: 'array',
      items: {
        type: 'object',
        properties: { comando: { type: 'string' }, passou: { type: 'boolean' }, saida: { type: 'string' } },
        required: ['comando', 'passou'],
      },
    },
  },
  required: ['todosPassaram', 'comandos'],
}

phase('Explorar')
const mapa = await agent(
  `Mapeie o código afetado por esta tarefa do Casa Mia e liste testes relacionados.\n\nTarefa: ${tarefa}`,
  { label: 'explorar', phase: 'Explorar', agentType: 'explorador', model: 'haiku', effort: 'high', schema: MAPA },
)

phase('Planejar')
const plano = await agent(
  `Planeje a implementação.\n\nTarefa: ${tarefa}\nBase: ${base}\n\nMapa do código:\n${JSON.stringify(mapa)}\n\nTestes obrigatórios: ${JSON.stringify(testes)}`,
  { label: 'planejar', phase: 'Planejar', agentType: 'planejador', model: 'opus', effort: 'high', schema: PLANO },
)

phase('Implementar')
const impl = await agent(
  `Implemente o plano abaixo. Branch base: ${base}. Nome da branch: agente/${plano.slug}.\n\nTarefa: ${tarefa}\n\nPlano:\n${JSON.stringify(plano)}`,
  { label: 'implementar', phase: 'Implementar', agentType: 'implementador', model: 'sonnet', effort: 'medium', isolation: 'worktree', schema: IMPL },
)

if (!impl?.sucesso) {
  log('Implementação não terminou com sucesso; revisão e testes pulados.')
  return { mapa, plano, impl }
}

phase('Verificar')
const [revisao, testesRes] = await parallel([
  () =>
    agent(
      `Revise a branch ${impl.branch} contra ${base} (git diff ${base}...${impl.branch}).\n\nTarefa original: ${tarefa}\nPlano: ${JSON.stringify(plano)}`,
      { label: 'revisar', phase: 'Verificar', agentType: 'revisor', model: 'opus', effort: 'high', schema: REVISAO },
    ),
  () =>
    agent(
      `Valide a branch ${impl.branch}. Rode lint, build e estes testes: ${JSON.stringify([...new Set([...(plano.testes ?? []), ...testes])])}`,
      { label: 'testar', phase: 'Verificar', agentType: 'testador', model: 'sonnet', effort: 'medium', isolation: 'worktree', schema: TESTES },
    ),
])

const pronto = Boolean(testesRes?.todosPassaram) && (revisao?.achados?.length ?? 0) === 0
log(pronto ? `Pronto: branch ${impl.branch} sem achados e com testes verdes.` : `Atenção: branch ${impl.branch} tem achados ou testes falhando.`)

return { pronto, branch: impl.branch, worktree: impl.worktree, plano, revisao, testes: testesRes }
