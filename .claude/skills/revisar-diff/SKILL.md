---
name: revisar-diff
description: Receita de revisão de código do Casa Mia combinando o agente revisor com as skills code-review, security-review e simplify. Use antes de integrar uma branch ou quando o usuário pedir revisão.
---

# Revisar um diff

1. **Correção:** skill `code-review` (nível `high`). Não use `max` nem `ultra` sem o usuário pedir.
2. **Segurança:** skill `security-review` se a mudança tocar `server/`, autenticação, pagamentos, notas fiscais, upload ou documentos.
3. **Revisor do projeto:** agente `revisor` (opus, high), que conhece as áreas sensíveis do Casa Mia. Rode em paralelo com os passos 1 e 2.
4. **Limpeza:** skill `simplify` só depois que os achados reais foram resolvidos.
5. **UI:** se mexeu em tela, veja `auditar-ui`.

## Saída

Achados ordenados por gravidade: `arquivo:linha`, defeito, cenário que falha. Sem achados reais, diga "nada encontrado". Separe o que é bug do que é preferência.
