---
name: entregar-mudanca-codex
description: Orquestra mudanças Casa Mia que atravessam mais de um arquivo ou módulo usando subagentes Codex para explorar, planejar, implementar e verificar.
---

# Entregar uma mudança com Codex

Use para features, correções ou refactors que cruzem arquivos/módulos. Mudanças simples e de baixo risco, mesmo em mais de um arquivo, podem ser feitas diretamente com validação proporcional, sem exigir commit apenas para validação. Autenticação, dados pessoais, pagamentos, banco e fluxos de interface exigem o fluxo completo, com revisão e testes pertinentes.

1. **Explorar:** delegue ao subagente `explorador` o mapa de código, usos, rotas, testes e docs afetados. Peça síntese com caminhos e linhas.
2. **Planejar:** passe tarefa, mapa, base e testes obrigatórios ao `planejador`. Consulte também `.github/workflows/ci.yml` e obtenha arquivos, sequência, riscos, comandos locais, verificações pendentes no CI e docs.
3. **Implementar:** delegue o plano ao `implementador`. Para isolamento, instrua explicitamente a criar branch `agente/<slug>` e worktree a partir da base indicada. Agentes Codex compartilham o filesystem por padrão; não execute implementadores concorrentes na mesma worktree. Paralelize só com worktrees diferentes e escopos disjuntos. Peça um commit com o estado completo da mudança e seu hash, sem incluir alterações alheias.
4. **Verificar em paralelo:** depois da implementação, delegue leitura do diff ao `revisor` e execução de validações ao `testador`. Ambos devem avaliar o mesmo commit informado, confirmar e relatar seu hash e estado limpo e comparar com a base indicada. Use worktree separada para testar o commit; rode testes `*-db` em série.
5. **Fechar:** se houver achados, encaminhe-os ao implementador, crie novo commit e repasse seu hash a ambos para repetir a revisão e as verificações afetadas. Identifique o commit final revisado e testado; relate qualquer pendência. Relate fielmente branch/worktree, achados e cada comando executado. Não integre nem faça push sem solicitação.

## Prompts de delegação

Cada subagente recebe um prompt autocontido: objetivo, branch/base, arquivos ou escopo, critério de pronto, restrições e formato de resposta. Não presuma que ele recebeu o histórico da conversa.

## Escolha do modelo

Os arquivos `.codex/agents/*.toml` são a fonte dos modelos e esforços de raciocínio de cada perfil. A disponibilidade depende do cliente e da conta; relate qualquer substituição utilizada.

## Resultado esperado

Termine com `pronto` ou `atenção`, branch, caminho da worktree e hash final, resumo do plano, achados de revisão e lista de comandos de validação com passou/falhou. Separe o executado localmente do pendente no CI. Não declare testes que não foram executados.
