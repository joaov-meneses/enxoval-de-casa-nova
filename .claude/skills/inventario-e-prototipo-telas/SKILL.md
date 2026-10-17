---
name: inventario-e-prototipo-telas
description: Captura as telas do app Casa Mia no navegador, monta o inventário em design/inventario/, prototipa no Penpot e faz revisão de UX/UI com base nas skills de design existentes. Use quando o usuário pedir para inventariar, documentar ou prototipar as telas do app, revisar a UX/UI de uma tela, ou redesenhar a interface.
---

# Inventário e protótipo de telas (Casa Mia)

Esta skill cobre três fases em sequência: captura e inventário, protótipo no Penpot e revisão de UX/UI. Cada fase tem um papel diferente. Detalhes de cada fase estão nas referências.

## Papéis por fase

- **Captura e inventário: engenheiro.** Registrar o que existe com precisão. Valores de cor, fonte e espaçamento vêm dos estilos computados da página, não de estimativa visual. O que não foi verificado fica marcado como não verificado.
- **Protótipo no Penpot: designer.** Organizar tokens, componentes e variantes. **Por padrão, reproduzir o que existe.** Não redesenhar sem pedido explícito.
- **Revisão de UX/UI: designer crítico.** Apontar problemas com base em heurísticas e nas skills de apoio. Toda saída é **proposta**, nunca mudança aplicada direto.

## Fontes de verdade

1. **O app real** define o que existe hoje.
2. **`docs/branding-casa-mia.md`** define a marca: paleta, tipografia, voz e princípios. Quando o app divergir da marca, registrar a divergência no inventário. Não corrigir em silêncio.
3. **`docs/onboarding-funil.md`** e **`docs/onboarding-funil-v2.md`** descrevem o fluxo de entrada, útil para ordenar a captura.

## Saídas

Tudo fica em `design/inventario/` (ver `design/inventario/README.md`):

- `inventario.md`: a partir do modelo que já existe lá. Preencher sem apagar as seções.
- `capturas/`: capturas finais, mascaradas e reduzidas. Versionadas.
- `capturas-brutas/`: capturas com dados reais. Ignoradas pelo Git. Criar a pasta se ela não existir.

## Regras que não podem ser quebradas

- **Credenciais nunca são gravadas em arquivo.** Para telas autenticadas, pedir ao usuário a conta de teste ou a sessão aberta no navegador, e usar só durante a captura.
- **Dados pessoais são mascarados** antes de qualquer captura ir para `capturas/`. Isso inclui nomes, e-mails, valores de pedidos e endereços.
- **Token do Penpot** só é lido de variável de ambiente, nunca escrito em arquivo do repositório.
- **Nenhuma métrica de uso é inventada.** Sem dados reais, a revisão é heurística e deve ser tratada como hipótese.
- **Propostas não viram mudança sem aprovação.** Mudanças no protótipo ou no app só depois de o usuário aprovar a proposta.

## Skills de apoio

Usar estas skills como checklist ou método dentro de cada fase, em vez de reescrever critérios:

- `design:accessibility-review`: acessibilidade e contraste, na revisão.
- `design:design-critique`: crítica estruturada de tela, na revisão.
- `design:ux-copy`: clareza e tom de mensagens, na revisão e na conferência do glossário da marca.
- `design:design-system`: organização de tokens e componentes, no protótipo.
- `impeccable:impeccable`: comandos de crítica e auditoria, como apoio na revisão.

## Fluxo

1. **Preparação.** Ler `docs/branding-casa-mia.md` e o fluxo de onboarding. Confirmar com o usuário o ambiente a capturar e a conta de teste. Se ele não tiver, capturar só as telas públicas e registrar as demais como não verificadas.
2. **Captura e inventário.** Seguir `referencias/captura-e-inventario.md`.
3. **Protótipo.** Seguir `referencias/prototipo-penpot.md`. Caminho principal: MCP do Penpot (ferramentas `mcp__penpot__*`). Antes de qualquer escrita, chamar `high_level_overview` e confirmar com `execute_code` que o arquivo está conectado. Se o MCP não responder, verificar se o plugin está conectado no navegador. Se não houver acesso, entregar os SVGs e as instruções e perguntar ao usuário como prosseguir.
4. **Revisão de UX/UI.** Seguir `referencias/revisao-ux.md`. Registrar as propostas na seção 8 do inventário.
5. **Validação.** Lembrar o usuário de testar com pessoas reais antes de implementar. O roteiro de 5 perguntas está na seção 8 de `docs/branding-casa-mia.md`.
6. **Redesenho.** Só com pedido explícito. Seguir `referencias/redesenho.md`.

## Ao finalizar

Informar o que foi verificado, o que ficou não verificado e por quê, e quais propostas aguardam aprovação. Não declarar uma tela como fiel ao app sem tê-la capturado.
