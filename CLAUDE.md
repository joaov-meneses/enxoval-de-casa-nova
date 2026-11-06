@AGENTS.md

# Claude Code — orquestração

Projeto, comandos, testes, git, docs e cuidados do domínio estão no `AGENTS.md` (importado acima). Aqui fica só o que é do Claude Code.

## Subagentes

Use subagentes por padrão. A sessão principal decide, delega e integra; não faça sozinha o que um agente faz melhor.

| Papel | Agente | Modelo / esforço | Observação |
| --- | --- | --- | --- |
| Sessão principal | — | opus / high | `settings.json` |
| Busca e mapeamento | `explorador` | haiku / high | só leitura |
| Plano | `planejador` | opus / high | só leitura |
| Implementação | `implementador` | sonnet / medium | worktree |
| Revisão | `revisor` | opus / high | só leitura |
| Validação | `testador` | sonnet / medium | worktree |

- Trabalho independente em paralelo: uma worktree por agente, escopos sem arquivos em comum (skill `trabalhar-em-worktree`).
- O subagente não vê a conversa. O prompt leva tarefa, arquivos e critério de pronto.
- Suba o modelo quando o erro só aparece depois (arquitetura, segurança); desça quando a resposta é verificável (teste, busca).

## Workflows: autorização permanente

O dono do projeto autoriza, de forma permanente e por escrito neste arquivo, o uso da ferramenta `Workflow` em tarefas substanciais, sem precisar pedir a cada vez. Não pergunte "quer que eu use um workflow?": escolha e rode.

Como escolher:
1. Liste `.claude/workflows/` e leia o `meta.whenToUse` de cada um.
2. Se um encaixa, rode com `args` preenchidos a partir do pedido.
3. Se nenhum encaixa, escreva um workflow sob medida (skill `workflow-authoring`) e rode. Se ele for reutilizável, salve em `.claude/workflows/` com `whenToUse`.

| Pedido | Workflow |
| --- | --- |
| Implementar feature, correção ou refactor que toque mais de um arquivo ou módulo | `entregar-mudanca` |
| Revisar uma branch ou diff | sob medida: `revisor` por dimensão (correção, segurança, privacidade), verificação adversarial dos achados |
| Auditar várias telas ou módulos | sob medida: um `revisor` por tela/módulo em paralelo (`pipeline`), depois síntese |
| Migração em muitos arquivos | sob medida: descobrir os pontos, `implementador` por grupo em worktree, `testador` |

Não use workflow em: pergunta conversacional, edição trivial de um arquivo, ajuste mecânico, ou quando o usuário disser para fazer direto. Nesses casos, delegue a um subagente só se ajudar.

Ao terminar, leia o resultado (`pronto`, achados, testes) e relate com fidelidade antes de propor integração.

## Skills (receitas)

Do projeto: `entregar-mudanca`, `verificar-mudanca`, `revisar-diff`, `atualizar-docs`, `trabalhar-em-worktree`, `auditar-ui`, `analise-referencias-ux`, `inventario-e-prototipo-telas`.

Do Claude, quando a tarefa casar: `code-review`, `security-review`, `simplify`, `impeccable` (UI), `design:accessibility-review`, `design:design-critique`, `design:ux-copy`, `engineering:testing-strategy`, `engineering:debug`, `engineering:architecture`, `engineering:tech-debt`, `claude-api` (Nino e `server/ai.ts`).

Nova tarefa repetível vira skill em `.claude/skills/<nome>/SKILL.md`, com `description` dizendo quando usar.

## Hooks (`.claude/settings.json`)

- `SessionStart`: branch, mudanças locais, worktree, `node_modules` ausente.
- `PreToolUse` Bash: bloqueia push forçado/em main, `reset --hard`, `stash` sem argumentos, `--no-verify`.
- `PreToolUse` Edit/Write: protege `.env*`, `package-lock.json`, `dist/`, capturas brutas.
- `Stop`: com `.ts/.tsx` alterado, roda `npm run lint` e devolve o erro se falhar.
