---
name: entregar-mudanca-codex
description: Orquestra mudanças Casa Mia que atravessam mais de um arquivo ou módulo usando subagentes Codex para explorar, planejar, implementar e verificar.
---

# Entregar uma mudança com Codex

Use para features, correções ou refactors que cruzem arquivos/módulos. Para uma edição pequena e localizada, trabalhe direto.

1. **Explorar:** delegue ao subagente `explorador` o mapa de código, usos, rotas, testes e docs afetados. Peça síntese com caminhos e linhas.
2. **Planejar:** passe tarefa, mapa, base e testes obrigatórios ao `planejador`. Obtenha arquivos, sequência, riscos, comandos e docs.
3. **Implementar:** delegue o plano ao `implementador`. Para isolamento, instrua explicitamente a criar branch `agente/<slug>` e worktree a partir da base indicada. Agentes Codex compartilham o filesystem por padrão; não execute implementadores concorrentes na mesma worktree. Paralelize só com worktrees diferentes e escopos disjuntos.
4. **Verificar em paralelo:** depois da implementação, delegue leitura do diff ao `revisor` e execução de validações ao `testador`. Use worktree separada para testar branch; rode testes `*-db` em série.
5. **Fechar:** se houver achados, encaminhe-os ao implementador e repita as verificações afetadas. Relate fielmente branch/worktree, achados e cada comando executado. Não integre nem faça push sem solicitação.

## Prompts de delegação

Cada subagente recebe um prompt autocontido: objetivo, branch/base, arquivos ou escopo, critério de pronto, restrições e formato de resposta. Não presuma que ele recebeu o histórico da conversa.

## Escolha do modelo

Perfis de raciocínio mais exigentes usam `gpt-6.1-sol` com `high` (planejador e revisor); buscas/testes objetivos podem usar `gpt-6-luna`. São escolhas de perfil OpenAI, não equivalências técnicas garantidas aos nomes Haiku/Sonnet/Opus. Se um modelo não estiver disponível no cliente/conta, use outro modelo OpenAI disponível com esforço compatível.

## Resultado esperado

Termine com `pronto` ou `atenção`, branch e caminho da worktree, resumo do plano, achados de revisão e lista de comandos de validação com passou/falhou. Não declare testes que não foram executados.
