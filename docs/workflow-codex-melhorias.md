# Melhorias no workflow Codex

Data: 2026-11-08

## O que mudou

O fluxo usa os perfis TOML como fonte dos modelos; prevê validação responsiva e Playwright aplicável, revisão e testes no mesmo commit, hooks como auxílio, processo proporcional ao risco e consulta ao CI para selecionar validações.

## Como validar

Compare `AGENTS.md`, as skills `entregar-mudanca-codex` e `verificar-mudanca` e os perfis do planejador e testador com `.github/workflows/ci.yml`. Em uma próxima entrega, confira que revisão e testes identificam o mesmo commit e registram o que ficou pendente no CI.

## Estado

Instruções atualizadas; a execução do fluxo completo depende de uma próxima mudança aplicável.
