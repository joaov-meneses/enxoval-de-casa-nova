---
name: verificar-mudanca
description: Receita para validar uma mudança no Casa Mia: escolhe lint, build e os testes certos conforme a área alterada. Use depois de implementar, antes de revisar ou integrar.
---

# Verificar uma mudança

1. Veja o que mudou (`git diff --stat`) e ache a área na tabela "Testes por área" do `AGENTS.md`.
2. Sempre: `npm run lint`. Se tocou em build, servidor ou rotas, também `npm run build`.
3. Consulte `.github/workflows/ci.yml` e rode os testes pertinentes à área. Fora da tabela, procure também em `tests/` e `package.json`; o CI não substitui testes locais nem se presume executado. Em mudanças de interface, confira as telas afetadas em 320, 375 e 425 px e rode os testes Playwright existentes aplicáveis.
4. Scripts `*-db` precisam de Postgres: `npm run db:up` antes, `npm run db:down` depois, se você subiu. Em worktrees paralelas, só um agente sobe o banco; os outros reaproveitam. Rode-os em série.
5. Em validação delegada, confirme o hash do commit e o estado limpo da worktree. Relate cada comando com passou/falhou, saída relevante das falhas, limitações e checagens pendentes no CI. Não diga "verificado" sem ter rodado.
