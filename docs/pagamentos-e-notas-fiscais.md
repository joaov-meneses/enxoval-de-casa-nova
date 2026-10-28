# Pagamentos e notas fiscais

> **Decisão vigente:** integração direta com a API oficial do Emissor Público Nacional da NFS-e, mantendo a Stripe nos pagamentos. Implementação e requisitos de ativação revisados em 22/10/2026.

O Passe da Casa Nova oferece **Pix ou cartão**, com pagamento único e 12 meses de acesso. O Mensal mantém o cartão, o teste de 48 horas e a renovação automática. O acesso só é concedido após confirmação na Stripe; abrir um QR Code ou retornar pela URL de sucesso não comprova pagamento.

A Stripe gera faturas e recibos. A NFS-e brasileira será emitida no backend pela SEFIN Nacional, com momento e competência aprovados pela contabilidade. A transmissão permanece desligada até a homologação oficial.

## Stripe

1. Configure `STRIPE_SECRET_KEY`, os dois preços e `STRIPE_WEBHOOK_SECRET`.
2. Ative Pix no [Dashboard da Stripe](https://dashboard.stripe.com/settings/payment_methods). O preço do Passe deve estar em BRL. `STRIPE_PIX_ENABLED=false` desativa a oferta no app.
3. No webhook `/api/billing/webhook`, habilite `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, **`invoice.paid`**, `charge.refunded`, `refund.created`, `refund.updated` e `refund.failed`.
4. Teste o Pix no ambiente de testes da Stripe, confirmando e expirando o pagamento. O código expira uma hora após a confirmação do PaymentIntent. O Passe só é liberado quando `payment_status=paid`; eventos repetidos não estendem o acesso duas vezes.

O SDK Stripe 23 usa `allowed_payment_method_types`: Passe em BRL permite `card,pix`, e Mensal permite `card`. Não envie o parâmetro removido `payment_method_types`. O Dashboard e a elegibilidade da conta continuam determinando os meios disponíveis. Fontes: [Pix no Checkout](https://docs.stripe.com/payments/pix/accept-a-payment?payment-ui=checkout) e [migração dos meios de pagamento](https://support.stripe.com/questions/fix-the-payment-method-types-error).

O Mensal permanece no cartão por decisão do responsável em 22/10/2026. Além do mandato e dos prazos próprios, a [elegibilidade atual da Stripe](https://docs.stripe.com/payments/pix) informa que **Pix Automático não está disponível para contas brasileiras**; a conta consultada é BR. Não há implementação de recorrência Pix pendente no escopo atual.

### Situação verificada em 22/10/2026

- Pix ativado na configuração padrão **de teste** da conta Stripe `acct_1UQcAPIzzRKYM0sE`; consulta posterior retornou `available=true` e preferência `on`.
- O webhook de teste `https://larume-staging.up.railway.app/api/billing/webhook` foi configurado para receber todos os eventos listados acima, preservando as inscrições anteriores.
- Checkout de teste com o preço real do Passe aceitou Pix/cartão e foi expirado após a verificação. Os cenários oficiais `succeed_immediately` e `expire_immediately` retornaram, respectivamente, `succeeded` e `requires_payment_method` com falha de pagamento. Nenhum valor real foi cobrado.
- A conta retornou `charges_enabled=false` e `details_submitted=false`. Tanto `staging` quanto `production` na Railway estão configurados com chave **de teste**; `APP_URL` em ambos aponta para staging. Não se trata de ativação de produção.
- Transmissão fiscal continua desabilitada: faltam certificado, habilitação do CNPJ e parâmetros contábeis. Nenhuma nota fiscal real foi emitida.

Diagnóstico repetível, sem imprimir credenciais:

```sh
npm run billing:ops -- check --webhook-url https://larume-staging.up.railway.app/api/billing/webhook
npm run billing:ops -- test-pix
```

`test-pix` exige `sk_test_`, cria uma sessão sem vínculo com contas do app, expira essa sessão e verifica dois PaymentIntents de R$ 1,00 **simulados**. O comando falha se os estados finais não forem observados. Não executá-lo com preços/chaves de produção.

Para lançar: concluir o cadastro da conta Stripe; configurar chave, preços, webhook e `APP_URL` próprios de produção; ativar Pix também na configuração live e repetir a conferência. Confirmar uma compra real autorizada pelo titular e a entrega assinada do webhook até a liberação do Passe no processo publicado. A validação atual cobre a API Stripe de teste e o handler local; não comprova esse percurso em produção.

## NFS-e Nacional direta: decisão e requisitos

Revisão em **22/10/2026**. A Stripe permanece responsável pelo pagamento, assinatura, Pix do Passe e cartão do Mensal. A integração com a FocusNFe foi removida: conector, token/template, variáveis de ambiente e mock. Foram reaproveitados perfil fiscal, validação de CPF/CNPJ, histórico de notas, fila, conciliação e revisão de estornos. Registros anteriores conservam `provider=legacy_focus`; não são enviados à SEFIN nem convertidos automaticamente para outra DPS. Não havia SDK Focus instalado.

### Camaçari/BA, Simples Nacional e transição

O estabelecimento informado é Camaçari/BA, IBGE **2905701**. Ser optante pelo Simples não informa sozinho se a empresa é MEI, ME ou EPP nem seu regime de apuração. A [Resolução CGSN 191/2026, disponibilizada pela SEFAZ de Camaçari](https://sefaz.camacari.ba.gov.br/wp-content/uploads/2026/08/Resol.-CGSN-n-191-2026-Revoga-a-Res.-CGSN-n-189-2026.pdf) determina o Emissor Nacional, web ou API, para serviços de ME/EPP do Simples com efeitos a partir de **01/11/2026**. Não confundir com a obrigação já existente para MEI.

A [orientação municipal de julho de 2026](https://sefaz.camacari.ba.gov.br/wp-content/uploads/2026/07/COMUNICADO-AOS-CONTRIBUINTES-NFSE-NACIONAL.pdf) mantém a emissão no STM e o compartilhamento com o ADN. Esse comunicado é anterior à resolução de agosto; o [portal municipal](https://sefaz.camacari.ba.gov.br/portal-nfse-sefaz-camacari/) publica os dois. Nossa leitura é que a transição específica de ME/EPP precisa ser aplicada com a contabilidade, distinguindo adesão ao ADN de habilitação para emissão na SEFIN. **Não foi comprovada a habilitação do CNPJ desta empresa.** Não há troca automática de emissor pela data: confirmar inscrição municipal, cadastro CNC/RFB, situação no Simples, permissão de emitir e vigência aplicável antes de marcar `NFSE_NACIONAL_ISSUER_ENABLED=true`.

### Autenticação, assinatura, leiaute e ambientes

- A API usa HTTPS com autenticação mútua por certificado ICP-Brasil, com uso de autenticação de cliente. A DPS precisa de assinatura XMLDSig própria; gov.br e senha do portal web não substituem mTLS nem fornecem uma chave de API. O [manual integrado oficial, seções 6.1.3–6.1.5 e 16.4](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/manualintegradosnnfse_v1-00-02-producao.pdf) descreve A1/A3, identificação CPF/CNPJ e assinatura sobre `infDPS`. A implementação automatizada suporta **A1 exportado para PEM**, com chave privada protegida no servidor; A3 físico/nuvem exige um assinador adicional e não está implementado. O perfil publicado usa RSA-SHA1, digest SHA1 e C14N inclusivo, com certificado final na assinatura. A autoridade fiscal valida cadeia, revogação, identidade e habilitação; a verificação local de validade/chave/EKU não prova essas condições.
- A [documentação atual de produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual), atualizada em 15/08/2026, publica leiaute **1.01**, XSD e Anexo I de **09/02/2026**, eventos e tabelas de domínio. Os quatro XSD necessários à DPS foram preservados em `server/fiscal/schemas/1.01`, com origem e SHA256. O backend monta XML UTF-8, assina, valida com os XSD e envia gzip/base64 em `dpsXmlGZipB64`. Os códigos de tributação, NBS, retenção, regime e informações IBS/CBS devem seguir a situação da empresa e a competência. Não foram presumidos códigos ou alíquotas reais para o SaaS.
- O [manual atual de contribuintes API v1.2](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf) define `POST /nfse`, `GET /dps/{id}` e `GET /nfse/{chaveAcesso}`. A emissão é síncrona. A consulta por DPS recupera a chave da nota para um certificado autorizado. O identificador contém município, tipo de inscrição, inscrição federal, série e número. A assinatura é separada da conexão TLS; a NFS-e autorizada é retornada em XML comprimido.
- A [lista oficial de ambientes](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao), atualizada em 20/08/2026, informa **produção restrita** em `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional` e **produção** em `https://sefin.nfse.gov.br/SefinNacional`. `tpAmb=2` e `tpAmb=1`, respectivamente. Produção restrita também exige certificado válido; não é uma API pública sem credenciais. Os eventos Stripe e as filas são separados por `livemode`. O ADN distribui documentos; não substitui a API de emissão da SEFIN.

### Configuração do backend

Todas as opções estão em `.env.example`. A transmissão começa **desligada**, com momento de emissão **manual**. A coleta e a transmissão são decisões separadas: pagamentos continuam gerando eventos e pendências fiscais quando a transmissão estiver desligada.

```dotenv
NFSE_NACIONAL_ENABLED=false
NFSE_NACIONAL_ENVIRONMENT=homologacao
NFSE_NACIONAL_ISSUER_ENABLED=false
NFSE_NACIONAL_CERT_PATH=/run/secrets/nfse-cert-chain.pem
NFSE_NACIONAL_KEY_PATH=/run/secrets/nfse-private-key.pem
NFSE_NACIONAL_KEY_PASSPHRASE=
NFSE_NACIONAL_TAX_CONFIG=
NFSE_NACIONAL_REQUIRE_ADDRESS=true
NFSE_NACIONAL_ISSUE_ON=manual
NFSE_NACIONAL_COMPETENCE=payment_date
NFSE_NACIONAL_ACCOUNTING_REFERENCE=
```

`TAX_CONFIG` é JSON com `cnpj`, `municipio=2905701`, `municipioPrestacao`, `serie`, `primeiroNumero`, `opSimpNac`, `regApTribSN` quando aplicável, `regEspTrib`, `cTribNac`, `descricao`, `tribISSQN` e `tpRetISSQN`. Opcionais: `inscricaoMunicipal` conforme regra cadastral, `cTribMun`, `cNBS`, `pAliq` quando cabível, `pTotTribSN` e grupo `IBSCBS` conforme XSD. ME/EPP usa `opSimpNac=3`, MEI usa `2`; isso não equivale a definir o regime efetivo de apuração ou a alíquota. No escopo implementado, serviços nacionais tributáveis (`tribISSQN=1`) sem retenção (`tpRetISSQN=1`); outras situações tributárias precisam de extensão validada, sem envio aproximado. Não envie alíquota de ISS incompatível com a apuração do Simples. O grupo IBS/CBS pode ser configurado como objeto com nomes/ordem do leiaute e será validado pelo XSD; seu enquadramento não é calculado pelo app.

Reservar **série exclusiva** para este sistema, na faixa de aplicativos do contribuinte até 49999, e definir o primeiro número livre conferido no emissor. O contador por ambiente/CNPJ/série no PostgreSQL não pode ser reiniciado nem compartilhado com outro emissor sem coordenação. Ao restaurar backup, consultar as DPS e reconciliar numeração antes de reativar envios. Lacunas por reserva sem envio são conservadas. Chaves privadas, senha e arquivos PFX/PEM reais nunca devem ir para frontend, Git, logs ou Postman. Exportar o A1 com ferramenta de confiança, mantendo cadeia para mTLS e apenas o certificado final na XMLDSig. O build copia os XSD para `dist/schemas`.

### Momento de emissão e competência

Registrar a orientação contábil em `NFSE_NACIONAL_ACCOUNTING_REFERENCE`, sem dados pessoais desnecessários. `ISSUE_ON` aceita `manual`, `payment_confirmed` ou `period_end`; `COMPETENCE` aceita `payment_date`, `period_start` ou `period_end`. A obrigação guarda uma cópia dessa política, competência e horário previsto; alterar ambiente não reclassifica notas existentes. `period_end` adia envio até o fim do período da linha de serviço da assinatura. Fatura com múltiplas linhas/prorrata ou sem período suficiente, e Passe sem período para essa política, ficam pendentes para definição manual. A competência não é a data em que uma nova tentativa roda. O valor atual corresponde ao total efetivamente pago em BRL após descontos; faturas de tributação/valores mais complexos devem ser revistas antes da automação.

Sem referência contábil, a obrigação é registrada sem agendamento automático. Para liberar uma nota pendente sem XML/transmissão anterior:

```sh
npm run fiscal:run -- --release <uuid> --competence 2026-10-01 --reason "Competência e momento de emissão conforme orientação contábil de ..."
```

A liberação é auditada, só aceita registro nacional pendente do ambiente configurado e não altera o pagamento. Para aprovar emissão automática, definir a política, referência contábil e habilitação; a transmissão deve ser habilitada somente após homologação. Obrigações registradas no modo manual continuam exigindo liberação, mesmo após habilitar automação.

### Duplicatas, falhas e regularização

1. O webhook autenticado da Stripe registra `stripe_events` e `fiscal_billing_events` na transação do pagamento. Não executa XML, configuração contábil nem requisições fiscais. Uma falha do banco exige reentrega da Stripe para preservar durabilidade; falhas de configuração, associação ao titular e SEFIN são tratadas depois, sem desfazer o acesso já pago.
2. O worker roda a cada minuto, inclusive para materializar pendências com transmissão desligada. `invoice.paid` positivo gera a obrigação da primeira cobrança/renovações do Mensal; o checkout da assinatura e o trial de valor zero não geram outra nota. Passe exige checkout com pagamento confirmado. Uma restrição por `(environment,source_id)` deduplica eventos distintos para o mesmo pagamento.
3. O lock PostgreSQL coordena instâncias, comandos de liberação e reprocessamento. A DPS recebe número reservado, identidade estável e snapshot do emissor. O XML assinado e comprimido é persistido **antes** do POST. Toda tentativa consulta a DPS; somente uma resposta de ausência permite o envio com o mesmo identificador. Falha de consulta não permite enviar.
4. Timeout, 5xx, HTML, resposta inválida ou queda após aceitação ficam em `processing`, com backoff até uma hora e limite de oito tentativas. A recuperação consulta DPS e XML pela chave, sem alocar outra DPS. Oito falhas deixam `failed`; não apagam a obrigação. `fiscal_attempts` conserva operações, resultado, código e detalhes de rejeição, sem publicá-los ao cliente ou aos logs. Apenas erro 400 estruturado da SEFIN no envio é tratado como rejeição definitiva.
5. `needs_data` pede correção do perfil; o titular vê pendências em **Meu perfil → Assinatura → Notas fiscais**. A alteração libera essas pendências e não modifica documentos autorizados. `rejected` exige revisão; o reprocessamento operacional consulta antes de reconstruir XML, mantendo a mesma DPS e numeração. Em falha ambígua conserva os mesmos bytes. `authorized` e `cancelled` não são reenviadas.

```sh
npm run fiscal:run
npm run fiscal:run -- --retry <uuid> --reason "Rejeição corrigida ou indisponibilidade resolvida; conferido por ..."
npm run billing:ops -- sync-fiscal --invoice <uuid>
npm run billing:ops -- reconcile --since "2026-10-01T00:00:00-03:00" --until "2026-11-01T00:00:00-03:00" --refresh-fiscal
```

`sync-fiscal` só recupera autorização e XML. `reconcile` é somente leitura e usa todas as páginas da Stripe. Estorno financeiro continua gerando `billing_refund_cases` para revisão, sem cancelar nota/acesso automaticamente. Cancelamento/substituição fiscal pela API de eventos exige contrato próprio e orientação contábil: **não está automatizado**. Para regularização manual, usar o emissor oficial e conservar evidências; não gerar outra nota sem verificar o documento anterior.

O XML autorizado nacional é armazenado no backend e servido por `/api/billing/fiscal/:id/xml` somente ao titular autenticado, com `no-store`, inclusive após expiração do plano. Não é exposto um endereço SEFIN que exija o certificado privado no navegador. O download de DANFSE/PDF nacional fica pendente de integração e verificação do serviço DANFSE; não se inventam URLs públicas. Links históricos são preservados. `billing:ops enqueue-fiscal` permanece disponível para UM pagamento histórico sem registro, após conciliação, motivo e conferência Stripe de pagamento/estorno/contestação; não é uma importação automática em lote.

### Ativação e evidência

Antes de produção: confirmar enquadramento ME/EPP/MEI e permissão efetiva do CNPJ; validar certificado/cadeia e vinculação ao emitente; obter códigos e tributação com a contabilidade; reservar série e numeração; aprovar política de emissão e competência; transmitir DPS em produção restrita com certificado real; conferir XML, tomador e valor; testar consulta de recuperação, primeira mensalidade e renovação. Aplicar migração, publicar backend e só então habilitar o ambiente correspondente. Manter revisão diária de inbox com `processed_at IS NULL`, notas `needs_data/rejected/failed`, obrigações manuais com `issue_at IS NULL`, conciliação e backups de documentos/numeração. Configuração inválida fica registrada como `FISCAL_CONFIGURATION` nas obrigações pendentes; desligar a transmissão preserva a fila.

Os mocks locais foram escritos com base nos manuais oficiais e no XSD. Orbit foi consultado e não retornou um contrato adequado da SEFIN; não foi usado contrato de intermediário. A busca de mock publicado/captura hospedada Postman foi dispensada porque esta sessão da CLI não está autenticada. A simulação local não exige publicar recursos nem enviar dados ao Postman hospedado.

```sh
postman simulation run postman/simulations/billing.sim.yaml --port 4928 --no-history --output ndjson
# PowerShell, em outro terminal:
$env:BILLING_SIMULATION_URL='http://127.0.0.1:4928'
npm run test:fiscal-billing-db
npm run test:fiscal-provider
npm run test:billing-db
npm run lint
npm run build
```

Passaram os testes fiscais de integração, os testes de cobrança existentes, quatro testes do conector, duas verificações de interface (375 e 1440 px), TypeScript e build. O teste de integração usa PostgreSQL em schema descartável, aplicação/SDK Stripe/transporte HTTP reais contra simulação e certificado sintético. Foram exercitados XSD, assinatura e adulteração, eventos repetidos, concorrência, valor pago, trial/renovações, 5xx/HTML, timeout após aceitação, recuperação sem POST duplicado, dados incompletos, configuração inválida, evento fora de ordem, política contábil, isolamento entre titulares, emissão desligada, histórico anterior e conciliação. Um servidor HTTPS local também confirmou autenticação mTLS com certificados sintéticos, mantendo a verificação TLS ativa. Isso não atesta cadeia ICP-Brasil, habilitação cadastral, regras de negócio da autoridade nem emissão real. Nenhum documento fiscal real foi emitido nesta revisão; homologação oficial e ativação de produção permanecem pendentes.

## Arte do Nino

A pose `keys` está em `public/brand/nino-keys.png`, com versões WebP original, de 260 e de 500 pixels. Foi criada com a ferramenta integrada de `imagegen`, usando `public/brand/nino.png` como referência, mantendo transparência. É usada no paywall e na tela de liberação da assinatura.

Prompt usado:

> Use case: precise-object-edit. Asset type: transparent mascot illustration for Casa Mia checkout/paywall. Edit the reference Nino illustration to a new pose: the same friendly little terracotta house character proudly holding a small golden house-key ring in its raised hand, welcoming the user to their new home. Preserve exactly the character identity, house silhouette, terracotta palette, dark brown rounded outlines, glowing cream arch door/belly, eyes, rosy cheeks, little brown feet, gold keychain on roof and soft hand-painted shading of the reference. Change the waving hand into a hand visibly holding a ring with two golden keys; keep a warm smiling face. Full body centered, generous transparent margins, no text, no watermark, no scenery, no backdrop, real transparent alpha. Keep the drawing simple and legible at 96 pixels wide. Do not redesign the mascot.
