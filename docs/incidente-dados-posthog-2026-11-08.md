# Incidente: dados pessoais e credenciais enviados ao PostHog

Data do registro: 2026-11-08. Estado: **contido em homologação; em produção o envio continua** até a correção chegar à `main`.

Este documento reúne os fatos para a avaliação do incidente pela LGPD. Não é parecer jurídico: a decisão de comunicar a ANPD e as pessoas afetadas é do controlador (DEVSPOT TECNOLOGIA LTDA).

## O que aconteceu

Três caminhos enviavam ao PostHog (empresa nos EUA) dados que não deveriam sair do sistema:

1. **Analytics do navegador** (com consentimento de análise): os eventos `application.ui.action`, `application.api.*` e `application.navigation` levavam valores digitados em formulários (inclusive senha no login), corpos e respostas da API, rótulos com e-mail e nome e URLs com query. O `$exception` de falhas da API levava o corpo da requisição. Origem: commit `fab6769` (20/10/2026). Detalhes em [analytics-sem-valores-de-campos.md](analytics-sem-valores-de-campos.md).
2. **Logs do servidor** (sem depender de consentimento): o log HTTP gravava corpo, cabeçalhos, cookies e query; os logs de e-mail gravavam destinatário, assunto e corpo, incluindo links com token de redefinição de senha, convite, verificação e preferências. Origem: `b1e325e` (18/10/2026, envio ao PostHog Logs) e `fab6769` (20/10/2026, corpo no log). Detalhes em [correcao-logs-sem-segredos-2026-11-08.md](correcao-logs-sem-segredos-2026-11-08.md).
3. **Captura de exceções do servidor**: levava query, corpo e cabeçalhos da requisição.

## Volume medido no PostHog (2026-11-08, somente leitura)

| Fonte | Período presente | Registros | Observação |
| --- | --- | --- | --- |
| Eventos `application.*` | 19/10 a 06/11 | 10.552 | 297 citam a palavra "password" em alguma propriedade (nem todos são valores de senha) |
| `$exception` com `error_source=api` | 19/10 a 05/11 | 30 | |
| PostHog Logs | 25/10 a 05/11 (medido) | cerca de 75 mil | 38 citam "password"; nenhum cita `token=` na busca simples. Retenção de 14 dias: o que é anterior a ~25/10 já foi apagado automaticamente |

## Dados envolvidos

Senhas digitadas em login e cadastro (texto puro), e-mails, nomes, endereços IP e user-agent, links com token, conteúdo de formulários (itens, anotações, possivelmente chave Pix e dados de presentes), mensagens da central de ajuda.

## Contenção e mitigação

- **Código:** corrigido e integrado em `homologacao` em 2026-11-08 (analytics do navegador, logs do servidor e captura de exceções). **Produção (`main`) ainda envia esses dados** até a promoção da correção.
- **Tokens:** em 2026-11-09 00:37 UTC, consulta somente leitura nos bancos de produção e de staging encontrou **zero** tokens válidos de redefinição de senha (validade de 1 hora), verificação de e-mail (48 horas) e convite (7 dias), e nenhum token de preferências guardado. Não há o que invalidar.
- **Logs no PostHog:** a retenção é de 14 dias e não há exclusão seletiva pela interface. Os registros remanescentes expiram sozinhos até cerca de 22/11 se a produção parar de gerar novos.
- **Eventos no PostHog:** não há exclusão por nome de evento pela interface. Caminhos: pedido de exclusão pela API com escopo `data_deletion` (exige chave de API pessoal criada pelo dono) ou pedido ao suporte do PostHog.

## Pontos para a decisão do controlador

- **Senhas em texto puro em terceiro:** quem fez login entre 18/10 e a correção em produção pode ter a senha exposta a quem tem acesso ao projeto do PostHog. Considerar pedir a troca de senha dessas contas e avaliar o risco para quem reutiliza a senha em outros serviços.
- **Comunicação:** a Resolução CD/ANPD nº 15/2024 trata da comunicação de incidentes que possam acarretar risco ou dano relevante aos titulares (o envolvimento de credenciais de autenticação é um dos critérios). Confirme o enquadramento e o prazo com assessoria jurídica.
- **Registro do incidente:** manter este documento e as evidências (consultas e commits) no registro de incidentes, mesmo que se decida não comunicar.
- **Transferência internacional:** PostHog opera nos EUA. A política de privacidade já informa isso.
