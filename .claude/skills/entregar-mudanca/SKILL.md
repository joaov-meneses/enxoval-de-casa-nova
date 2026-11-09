---
name: entregar-mudanca
description: Receita de ponta a ponta para uma mudança no Casa Mia, orquestrando subagentes e worktrees. Use quando o usuário pedir uma feature, correção ou refactor que toque mais de um arquivo ou módulo.
---

# Entregar uma mudança

Para mudança pequena e localizada, faça direto. Para o resto, siga a cadeia abaixo. Os modelos vêm dos agentes em `.claude/agents/`.

1. **Explorar** — agente `explorador` (haiku, high). Pede o mapa de arquivos, rotas e testes afetados.
2. **Planejar** — agente `planejador` (opus, high). Recebe o mapa e devolve passos, riscos, testes e docs.
3. **Implementar** — agente `implementador` (sonnet, medium) em worktree, branch `agente/<slug>`. Trabalhos independentes viram vários implementadores em paralelo, cada um com escopo sem sobreposição de arquivos (ver `trabalhar-em-worktree`).
4. **Verificar em paralelo** — `revisor` (opus, high) e `testador` (sonnet, medium, worktree própria). Veja `revisar-diff` e `verificar-mudanca`.
5. **Documentar** — `atualizar-docs`.
6. **Integrar** — o usuário decide o merge. Nada de push em `main`.

## Automático

A ferramenta `Workflow` roda 1 a 4 de forma determinística:

```
Workflow({ name: "entregar-mudanca", args: { tarefa: "...", base: "develop", testes: ["test:nino"] } })
```

O resultado traz `pronto`, `branch`, `plano`, `revisao` e `testes`. Leia os achados antes de integrar; `pronto: false` significa trabalho a corrigir.

## Regras

- O contexto da conversa não passa sozinho para o subagente. Escreva o prompt com a tarefa, os arquivos e o critério de pronto.
- Se o revisor achar algo real, volte ao implementador com o achado, não corrija à mão na worktree dele.
- Relate falhas como elas são, com a saída do comando.
