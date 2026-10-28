# Nino — Fase 3

Implementado em 22/10/2026. As alterações de interface desta entrega estão no checkout local e ainda não foram publicadas.

## Animações por pose

O componente `Nino` aplica um gesto curto à arte oficial, sem alterar as imagens:

| Pose | Movimento | Duração |
| --- | --- | --- |
| `wave` | Balanço de boas-vindas, diminuindo até parar. | 1,6 s |
| `think` | Inclinação pensativa com pausa e pequeno sinal de entendimento. | 2,8 s |
| `happy` | Dois pulinhos leves. | 1,4 s |
| `celebrate` | Salto maior, balanço e aterrissagem macia. | 1,8 s |

O gesto começa com a imagem carregada e visível, repete ao voltar à área visível ou trocar de pose e termina em repouso. `prefers-reduced-motion: reduce` desativa os movimentos. `animated={false}` mantém uma instância estática. As poses `rest` e `keys` continuam estáticas.

```tsx
<Nino pose="wave" size={120} />
<Nino pose="think" size={56} />
<Nino pose="happy" size={96} />
<Nino pose="celebrate" size={96} />
<Nino pose="wave" size={120} animated={false} />
```

As animações ficam em `src/components/nino.css`. O planejamento e a tela de acesso usam os mesmos gestos do componente, substituindo suas animações anteriores.

Na landing page, `wave` acompanha as boas-vindas e `think` apresenta a ajuda do Nino. O planejamento usa `think`, `celebrate` após uma conquista salva e `rest` quando o ambiente está completo. No convite do Chá de Casa Nova, `wave` recebe os convidados e `happy` aparece após reservar um presente ou enviar um recado. As poses `keys` dos planos continuam estáticas.

Validação: `npm run test:nino` e `npx playwright test tests/nino.spec.ts tests/nino-motion.spec.ts`. Os testes de movimento cobrem 320, 375 e 425 px, carregamento/visibilidade, término do gesto e movimento reduzido.

## Estados no planejamento

O `NinoAssistant` aparece no planejamento. O balão dentro da lista do ambiente foi removido por feedback de design, junto da variante, dos estilos exclusivos e dos testes dessa interface.

| Estado | Gatilho |
| --- | --- |
| Pensativo, com prancheta e trena | Ambiente com pendências, ambiente vazio ou consulta em andamento. |
| Comemorando | Um item pendente passa a Comprado, Recebido ou Já tenho, após o servidor confirmar o salvamento. Dura quatro segundos. |
| Descansando no arco | O ambiente tem ao menos um item e todos estão conquistados; aparece também ao abrir um ambiente já completo. |

O progresso considera todos os itens do ambiente, mesmo com busca e filtros. Desfazer, excluir o item comemorado ou trocar de ambiente remove a comemoração daquele contexto. Editar um item já conquistado não dispara nova comemoração. A animação tem término e respeita `prefers-reduced-motion`; os textos usam uma região de status acessível.

No planejamento, **Pedir sugestão** usa o contrato existente `POST /api/ai/recommend` (`enxovalId`, `categoryId`). Só consulta ao clicar; só adiciona após a escolha da pessoa. Respostas de uma lista ou ambiente anterior são descartadas. Sem Jev, os estados visuais e o progresso continuam disponíveis e o botão de consulta fica oculto. Nenhuma rota da API foi alterada.

`public/brand/nino-rest.{png,webp}` é a nova arte de repouso, derivada da referência do mascote. Os WebPs de 260 e 500 px seguem o `srcSet` das demais poses.

## Evidência de configuração de produção

Em **22/10/2026**, o CLI autenticado da Railway confirmou o projeto **Apps**, serviço **Casa Mia**, ambiente **production**, com deployment `6271daa8-a57a-493d-a93b-6dac7ec97aab` em `SUCCESS`.

* `TYPESAFE_API_KEY`: presente e não vazia. O valor não foi impresso nem gravado no repositório.
* Sem sobrescrita de `TYPESAFE_DEFAULT_MODEL`, `JEV_TIMEOUT_MS` ou `JEV_DAILY_LIMIT`: valem os padrões da integração (`jev-latest`, 8.000 ms, 3.000 chamadas por dia).
* Sem `TYPESAFE_BASE_URL` personalizado na configuração consultada.
* Uma chamada real ao provedor, com dados sintéticos, usando **as variáveis de produção obtidas pela Railway**, devolveu a escolha esperada com confiança válida: `status: available`, **362 ms**, exit code **0**.

Comando reproduzível, sem imprimir a chave:

```powershell
railway run --service "Casa Mia" --environment production --no-local -- node scripts/check-jev.mjs --expect-environment production
```

O processo acima roda **localmente com a configuração de produção**. Não comprova conectividade a partir do contêiner nem o fluxo autenticado completo da versão publicada. A tentativa de verificar no contêiner por SSH foi impedida pela ausência de chave SSH registrada; nenhuma chave foi criada. Não foram encontradas chamadas concluídas nos registros de produção consultados. Assim, a presença da configuração e a disponibilidade do provedor com essa chave estão confirmadas; a consulta a partir do processo publicado continua sem evidência nesta sessão.

**Validação pelo processo publicado (23/10/2026):** na versão em produção (`enxoval-de-casa-nova-production.up.railway.app`), com uma conta autenticada, **Planejamento → Ajuda do Nino → Pedir sugestão** para o ambiente Cozinha chamou `POST /api/ai/recommend`, que respondeu **200** com a sugestão "Facas de cozinha" (essencial). A rota só devolve sugestão quando o Jev responde (`recommendNext` não tem alternativa local; sem Jev configurado ela responde `available: false`), então a consulta a partir do processo publicado está comprovada. A verificação por SSH continua indisponível (sem chave SSH registrada na Railway).

Para validar diretamente no ambiente onde o código está instalado, executar `npm run check:jev -- --expect-environment production`. O script não carrega `.env` automaticamente, faz uma única chamada sem cache ou retry e só emite metadados não secretos. Retorna código 1 em ambiente incorreto, chave ausente, erro HTTP/rede ou resposta inválida. A consulta operacional usa o SDK diretamente e não passa pelo orçamento diário do app; não é uma rotina periódica.

## Verificação reproduzível

A entrega inicial passou em 25 cenários de navegador, 3 testes de estado do Nino, 16 testes existentes do Jev, verificação HTTP do script, lint e build. Após a remoção do balão, os testes de navegador do Nino foram reduzidos aos fluxos mantidos no planejamento e à ausência do cartão na lista. O teste de estado também foi incluído no CI existente.

```powershell
npm run test:nino
npm run test:jev
npx playwright test --output tmp/nino-test-results tests/nino.spec.ts tests/app-critique.spec.ts tests/planning-interactions.spec.ts
npm run lint
npm run build
```

Na revisão inicial, os testes de navegador também foram executados sobre um build compilado em uma pasta temporária exclusiva, com análise e marketing recusados no armazenamento do navegador, para evitar interferência de outros builds e execuções de Playwright no workspace compartilhado.

A verificação do script usa o SDK real e HTTP contra uma simulação local do Postman:

```powershell
# Terminal 1
postman simulation run postman/simulations/jev.sim.yaml --port 4902 --output ndjson --no-history
# Terminal 2
npm run test:jev-check
```

Essa simulação cobre resposta válida, ausência da chave, ambiente incorreto, resposta semanticamente incorreta, HTTP 401 sem vazamento do corpo do provedor e conexão recusada. O contrato mínimo do mock vem do SDK 0.7 instalado e do servidor HTTP já usado em `tests/ai-db.mjs`; não substitui a evidência real de produção acima. A busca de mock mantido pelo provedor foi impedida pela falta de login no Postman; os arquivos locais funcionam sem login e não foram publicados.
