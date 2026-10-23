# Melhorias do Impeccable no onboarding

Escopo: `/comecar`, seguindo o `DESIGN.md` e a identidade “A prancheta do Nino”. Modo da superfície: Operate. A revisão preserva as perguntas, as regras de geração do plano e a contratação existente.

## Planos implementados

- [x] **Consistência visual:** superfícies de linho e areia, divisores discretos, sombras curtas, cantos da escala do sistema e cores derivadas de `--cm-*`. Fraunces com SOFT 100 nos títulos; Nunito com números tabulares nas quantidades, estimativas e contadores. Conquistas em sálvia, com check e texto riscado.
- [x] **Orientação:** progresso escrito “Pergunta X de 12” também no celular, descrição acessível da barra e estado de respostas concluídas em sálvia. Os passos informativos não aumentam o número de perguntas.
- [x] **Movimento e teclado:** animações do Nino com término, respeito a movimento reduzido e foco visível no cartão da opção operado pelo teclado. Removidos os rótulos decorativos acima dos títulos.
- [x] **Retomada e recuperação:** abrir novamente as boas-vindas não sobrescreve a etapa salva. Falhas de conexão ou do servidor permitem tentar novamente no onboarding; a sessão não autenticada continua seguindo ao cadastro.
- [x] **Salvamento:** texto de espera legível, bloqueio de pedidos duplicados durante o envio, foco na mensagem de erro e manutenção das respostas para tentar novamente.
- [x] **Verificação:** jornada, geração do plano, movimento, teclado, retomada, erros, responsividade e acessibilidade automática, acompanhados de inspeção das telas renderizadas.

## Verificação reproduzível

```powershell
npm run lint
npm run build
npx playwright test tests/onboarding-journey.spec.ts tests/onboarding-quality.spec.ts
npx playwright test tests/onboarding.spec.ts -g 'o plano segue clima|com orçamento curto, compras|nenhum ambiente gerado|a localização vira|cozinha e banheiro são escolhas|comparação com a lista genérica soma|primeira noite: só|cronograma: cada|semanas e fase da mudança'
```

As duas suítes de jornada e qualidade contêm 36 testes; a seleção de regras de geração contém 9. As rotas de sessão e salvamento usam respostas controladas nos testes de navegador, sem criar contas nem alterar dados reais.

As verificações cobrem celular de 320 × 568, larguras de 390, 768 e 1440 px, e desktop de 1920 × 1080. A análise com axe percorre as perguntas e a apresentação do plano em 390, 768 e 1440 px, com WCAG 2 A/AA e 2.1 AA. Essa análise automática é complementada pelas verificações de teclado e pelas capturas em `tmp/onboarding-*.png`.

O detector do Impeccable foi executado uma vez nos três arquivos da interface. Os avisos de tamanhos intermediários e raios de borda foram revisados e os valores normalizados. Rótulos de 14/16 px seguem as variantes descritas no texto do `DESIGN.md`; os contadores de semanas e montagem mantêm escala própria de 64–96 px, em Nunito, para exibir os números da etapa.

O build também apresenta um aviso de tamanho de um pacote compartilhado acima de 500 kB; essa divisão do pacote geral não faz parte da alteração do onboarding.
