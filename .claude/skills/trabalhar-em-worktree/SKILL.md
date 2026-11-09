---
name: trabalhar-em-worktree
description: Receita para trabalho paralelo e testes isolados com git worktrees no Casa Mia. Use quando duas ou mais tarefas são independentes, ou para testar uma branch sem mexer na worktree atual.
---

# Worktrees

A worktree atual é um checkout isolado (`orca/workspaces/.../<branch>`). Não troque de diretório para a raiz original.

## Quando usar

- Tarefas independentes que não editam os mesmos arquivos: uma worktree por tarefa.
- Testar uma branch sem sujar a atual: worktree do `testador`.
- Experimento que pode ser descartado.

Evite quando as tarefas dependem uma da outra ou editam os mesmos arquivos. Faça em sequência.

## Como

- Subagentes: `Agent` com `isolation: "worktree"` (os agentes `implementador` e `testador` já têm isso). Sem mudanças, a worktree se remove sozinha.
- Cada worktree precisa de `npm ci` na primeira vez.
- Branch por agente: `agente/<slug>`. Uma branch só pode estar aberta em uma worktree; para testar outra, use `git checkout --detach <branch>`.
- Banco: um só Postgres local (`npm run db:up`). Testes `*-db` em paralelo podem colidir; rode-os em série.
- Porta do dev server: duas worktrees não sobem `npm run dev` ao mesmo tempo na mesma porta.

## Stash

O stash é compartilhado por todas as worktrees. Prefira um commit WIP. Se precisar: `git stash push -u -m "<tag-unica>"`, guarde o SHA (`git stash list --format='%H %gs'`), restaure com `git stash apply <sha>` e só então apague a entrada. O hook `guard-bash` bloqueia `git stash` e `git stash pop` sem argumentos.
