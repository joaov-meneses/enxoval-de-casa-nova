---
name: verificar-mudanca
description: Receita para validar uma mudança no Casa Mia: escolhe lint, build e os testes certos conforme a área alterada. Use depois de implementar, antes de revisar ou integrar.
---

# Verificar uma mudança

1. Veja o que mudou (`git diff --stat`) e ache a área na tabela "Testes por área" do `AGENTS.md`.
2. Sempre: `npm run lint`. Se tocou em build, servidor ou rotas, também `npm run build`.
3. Rode os testes da área. Fora da tabela, procure em `tests/` e `package.json`. A lista completa roda no CI.
4. Scripts `*-db` precisam de Postgres: `npm run db:up` antes, `npm run db:down` depois, se você subiu. Em worktrees paralelas, só um agente sobe o banco; os outros reaproveitam. Rode-os em série.
5. Relate cada comando com passou/falhou e a saída dos que falharam. Não diga "verificado" sem ter rodado.
