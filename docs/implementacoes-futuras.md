# Plano Faseado de Implementações Futuras: Casa Mia

> **Objetivo:** Reunir as próximas entregas técnicas e de produto do **Casa Mia**.
>
> **Este documento lista só o que falta fazer.** Revisado em **22/10/2026**, considerando o código atual, inclusive alterações locais. A numeração das fases foi preservada para manter as referências entre documentos. Configurações de produção devem ser confirmadas no ambiente antes de serem consideradas pendências.

---

## 1. O que ainda falta

1. **Pagamentos (produção):** concluir cadastro Stripe, configurar chaves/preços/webhook live e URL de produção, ativar Pix live e validar compra até a liberação de acesso no processo publicado; para a NFS-e (código pronto), obter certificado A1, confirmar habilitação e política contábil e homologar no Emissor Nacional antes de ativar a transmissão (Fases 2 e 5; ver [`pagamentos-e-notas-fiscais.md`](./pagamentos-e-notas-fiscais.md)).
2. **Nino (validação operacional):** validar uma consulta ao Jev a partir do processo publicado (Fase 3).
3. **Chá de Casa Nova:** sem rotas públicas, tabela ou Pix (Fase 4).
4. **Produção:** Dockerfile, confirmação de backups, domínio e DNS; e-mails de boas-vindas/presente/resumo, ativação da emissão fiscal e depósito de marca (Fase 5).
5. **Analytics (restante):** configuração e validação do Google em produção, conversões de cobranças recorrentes, SEO, funis e dashboards, fluxos adicionais de reengajamento e retorno do provedor de e-mail (Fase 7).
6. **Idiomas e preço por região:** app só em português e reais (Fase 8).
7. **Segurança e banimento (restante):** auditoria das ações da equipe, linha do tempo de segurança, contas relacionadas, Turnstile/Cloudflare e lista de e-mails descartáveis (Fase 9).
8. **Lista "Meu enxoval" (restante):** bucket de documentos em produção, leitura automática da nota, lembretes de garantia no limite do ciclo de vida e validação do modo loja offline em aparelhos reais (Fase 11).

---

## 2. Roadmap Faseado de Implementação

```mermaid
flowchart LR
    Fase2["Fase 2: Pix em Produção"] --> Fase3["Fase 3: Validação Operacional do Jev"]
    Fase3 --> Fase4["Fase 4: Chá de Casa Nova (Viral)"]
    Fase4 --> Fase5["Fase 5: Infraestrutura Railway & Go-to-Market"]
    Fase5 --> Fase7["Fase 7: Operação de Analytics & Novos Fluxos"]
    Fase5 --> Fase8["Fase 8: Idiomas EN/ES & Preço por Região"]
    Fase5 --> Fase9["Fase 9: Segurança, IP & Banimento"]
    Fase9 -.-> Fase2
    Fase8 -.-> Fase2
```

---

### FASE 2: Pix em Produção

#### 2.1 Pendências operacionais de lançamento
* Concluir o cadastro Stripe e habilitar cobranças reais. Os ambientes `staging` e `production` na Railway ainda usam chave de teste e URL de staging.
* Configurar chave, preços, URL e webhook próprios de produção; ativar Pix na configuração live.
* Publicar o código e validar uma compra real autorizada no Passe em BRL, incluindo confirmação assinada no webhook, liberação única de acesso e tratamento de expiração. Seguir o procedimento de [`pagamentos-e-notas-fiscais.md`](./pagamentos-e-notas-fiscais.md).

---

### FASE 3: Validação Operacional do Jev em Produção

* Validar uma consulta ao Jev a partir do processo publicado, pelo fluxo autenticado do app. Ver o procedimento e os limites da verificação em [Nino — Fase 3](./nino-fase3.md).

---

### FASE 4: Página Pública de Chá de Casa Nova (Viral Loop)

A funcionalidade que transforma convidados em novos clientes da plataforma.

#### 4.1 Estrutura de Banco de Dados
* Nova tabela `housewarming_lists`:
  * `id`: uuid
  * `user_id`: uuid
  * `slug`: text unique (ex.: `lar-da-ana-e-leo`)
  * `title`: text (*"Chá de Casa Nova da Ana e do Léo"*)
  * `message`: text (*"Estamos montando nosso cantinho e ficaremos muito felizes com a sua presença e carinho!"*)
  * `event_date`: timestamp
  * `pix_key`: text (chave Pix do casal)
  * `pix_key_type`: text (`cpf`, `email`, `phone`, `random`)
  * `is_public`: boolean

#### 4.2 Interface Pública do Chá (`/cha/:slug`)
* Página de visualização pública, leve e responsiva (sem necessidade de cadastro do convidado).
* **Ações do Convidado:**
  1. **"Vou presentear com este item":** o convidado informa seu nome e e-mail; o item é marcado como "Reservado/Presenteado" na lista em tempo real.
  2. **"Presentear via Pix":** gera o QR Code e código copia-e-cola direto com a chave Pix cadastrada pelos moradores.
  3. **Deixar Recado de Boas-Vindas:** campo de texto onde o convidado deixa uma mensagem de afeto.
* **Experiência do Anfitrião:**
  * O morador recebe notificação no app: *"Maria reservou o Jogo de Pratos para a sua Cozinha e deixou um recado!"*.
* **Rodapé Viral:**
  * Em destaque no final da página: *"Lista organizada com amor no Casa Mia. Monte o seu enxoval também! [Começar Grátis]"*.

---

### FASE 5: Infraestrutura Railway, Automação Fiscal e Lançamento

#### 5.1 Hospedagem no Railway
* Dockerfile do serviço Node.js/Express (não existe no repositório).
* Confirmar PostgreSQL dedicado com backups diários automáticos no ambiente de produção.
* Confirmar domínio personalizado (`app.casamia.com.br` ou `casamiaapp.com.br`).

#### 5.2 E-mails Transacionais com Resend Pro
* Confirmar autenticação DNS do domínio (SPF, DKIM e DMARC).
* Templates novos com a assinatura do Nino: boas-vindas após a confirmação da conta, presente recebido no Chá de Casa Nova e resumo mensal de conquistas.

#### 5.3 Ativação Fiscal e Registro de Marca
* **NFS-e Nacional (pendências operacionais):** a integração direta com o Emissor Público Nacional está implementada e validada localmente (simulação, PostgreSQL e certificado sintético). Nenhuma nota real foi emitida. Falta:
  1. Obter o certificado ICP-Brasil A1 da empresa e configurar `NFSE_NACIONAL_CERT_PATH`, `NFSE_NACIONAL_KEY_PATH` e `NFSE_NACIONAL_KEY_PASSPHRASE`.
  2. Confirmar a habilitação do CNPJ para emitir pelo Emissor Nacional em Camaçari/BA (2905701). A transição para ME/EPP do Simples está prevista para 01/11/2026 (CGSN 191/2026); a adesão do município ao ADN não basta como permissão de emissão.
  3. Obter da contabilidade, por escrito, o momento de emissão e a competência; preencher `NFSE_NACIONAL_TAX_CONFIG`, `NFSE_NACIONAL_ISSUE_ON`, `NFSE_NACIONAL_COMPETENCE` e `NFSE_NACIONAL_ACCOUNTING_REFERENCE`. Até lá, a emissão fica manual.
  4. Emitir e consultar uma nota em produção restrita (`NFSE_NACIONAL_ENVIRONMENT="homologacao"`) antes de ativar a produção.
  5. Ativar `NFSE_NACIONAL_ENABLED` e `NFSE_NACIONAL_ISSUER_ENABLED` em produção e acompanhar a primeira emissão real. Ver [`pagamentos-e-notas-fiscais.md`](./pagamentos-e-notas-fiscais.md).
* Depósito de marca mista no INPI nas classes 9, 35 e 42.

---

### FASE 6: Catálogo Compartilhado (só quando escalar)

> Nada pendente hoje. Os itens abaixo só valem quando o uso crescer.

* **Na Railway:** o Redis só vale a pena quando houver mais de uma instância; ao ligá-lo, configure `REDIS_URL` (e `REDIS_KEY_PREFIX` diferente se homologação e produção dividirem o mesmo Redis).
* **Escala:** se o catálogo passar de dezenas de milhares de itens, migrar a similaridade em memória para `pg_trgm`.

---

### FASE 7: Analytics, Funil de Aquisição e Reengajamento (restante)

> **Referências:** [`analytics-funil-e-reengajamento.md`](./analytics-funil-e-reengajamento.md) e [`analytics.md`](./analytics.md). Validar a coleta em produção antes de qualquer gasto com anúncios.

#### 7.1 Configuração e validação em produção
* Configurar e validar o contêiner do **Google Tag Manager**, as tags e os eventos do **GA4**, a ligação com Google Ads e Search Console e os sinais do Consent Mode v2, conforme o ambiente.
* Validar o proxy `/ingest`, a atribuição do cadastro e as conversões de compras com as chaves e serviços reais.
* Validar o ciclo de vida em modo `simulate` antes de ativar `LIFECYCLE_MODE=send` em produção.

#### 7.2 Atribuição orgânica e paga
* Ampliar as conversões de receita para a primeira cobrança após o trial e as renovações mensais (`invoice.paid`); o envio atual depende de um checkout com pagamento confirmado.
* Completar o SEO técnico para o orgânico: URL canônica, sitemap e regras de indexação das páginas públicas e privadas.
* Alertas de erro por versão e monitoramento das rotinas agendadas.

#### 7.3 Funis e dashboards
* Completar os funis F1 a F6 e os painéis de retenção semanal, calibrar a definição de **ativação** e validar as perguntas de negócio com dados reais.

#### 7.4 Ciclo de vida: fluxos adicionais e operação
* Fluxos restantes: resumo de atrasos, marcos de progresso, convite parado e pesquisa de pós-mudança (+30 dias).
* Integrar os alertas de queda de preço ao limite de frequência e às preferências comuns do ciclo de vida.
* Receber e validar webhooks do provedor de e-mail para entrega, rejeição e reclamação de spam; alimentar `lifecycle_events` e a lista de supressão. Medir cliques e retorno ao app por fluxo.
* Configurar públicos de remarketing pago conforme o consentimento e criar campanhas pontuais por segmento em `/admin`.
* Medir o efeito dos fluxos em comparação com o grupo de controle nos dashboards.

---

### FASE 8: Idiomas (Inglês e Espanhol) e Preço por Região

> **Documentação:** [`internacionalizacao-regiao-e-seguranca.md`](./internacionalizacao-regiao-e-seguranca.md), partes A e B.

#### 8.1 Três idiomas no app inteiro
* Português (base), **inglês e espanhol** em interface, landing, funil, e-mails, erros do servidor, catálogo, planilhas, textos legais e Nino. Atualizar o inventário de textos antes da extração das traduções.
* Infra com `i18next`, chaves tipadas, teste de paridade entre idiomas, pseudolocalização, erros do servidor por **código** e URLs por idioma com `hreflang`. **A infra vem primeiro: nenhum texto novo entra fixo no código.**
* Não é só tradução: o catálogo já tem `slug` e `translations` por item, a geografia e o clima deixam de ser só Brasil (país → região → cidade, hemisfério) e o conceito de "enxoval" é adaptado a cada mercado.

#### 8.2 Preço por região e segregação regional
* Tabelas `regions`, `region_countries` e `plan_prices` (preço versionado por região e moeda), integradas à Stripe com várias moedas, impostos (Stripe Tax) e meios de pagamento locais; NFS-e só no Brasil.
* País de cobrança confirmado no pagamento e anti-abuso de preço regional (VPN, cartão de outro país). Países bloqueados.
* Segregam-se por região: preços e moedas, impostos, textos legais e consentimento, pacote de itens, relatórios e modelos de e-mail. A conta continua global.

---

### FASE 9: Confiança, Segurança e Proteção contra Abuso (IP, Dispositivo e Banimento)

> **Documentação:** [`internacionalizacao-regiao-e-seguranca.md`](./internacionalizacao-regiao-e-seguranca.md), parte C.

* **Próximos passos:** `auth_events` para trocas de senha e ações sensíveis; histórico de aceite e revogação de termos e consentimentos além do registro de marketing no cadastro; trilha de auditoria das ações da equipe (hoje só o autor do bloqueio fica registrado); decidir o que acontece com enxovais compartilhados quando o dono é bloqueado.
* **Prevenção:** limites persistentes para as demais rotas (hoje em memória, reiniciam a cada deploy), Cloudflare/Turnstile, lista de e-mails descartáveis e e-mail equivalente (pontos e `+` no Gmail), alertas de pico.
* **Painel `/admin`:** linha do tempo de segurança da conta, contas relacionadas (mesmo aparelho ou faixa), fila de abuso e trilha de auditoria.
* **Conformidade:** documentar a base legal e revisar a cobertura e a retenção dos registros de acesso; manter a política de privacidade alinhada às novas funcionalidades; definir o processo de revisão humana de bloqueios, a segurança dos próprios logs e o plano de incidente.

---

### FASE 11: Mais Valor na Lista "Meu enxoval" (restante)

> As seis frentes (parcelas e fluxo mensal, responsável por item, presentes e agradecimentos, comprovantes e garantias, várias lojas por item e modo loja) estão implementadas. Como funcionam e como configurar: [`lista-meu-enxoval-fase11.md`](./lista-meu-enxoval-fase11.md). Falta:

* **Bucket de documentos em produção:** criar o bucket privado (Cloudflare R2 ou S3), configurar `DOCUMENT_STORAGE=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY` e validar envio, download pela URL assinada e exclusão. Sem bucket, os arquivos ficam no Postgres (serve para desenvolvimento e homologação, não para volume). Definir `DOCUMENT_QUOTA_MB` conforme o custo (padrão 500 MB por conta).
* **Leitura automática da nota:** o Jev lê a foto da nota e preenche loja, data e valor; definir o limite de consultas para controlar o custo.
* **Lembretes de garantia no ciclo de vida:** hoje respeitam a preferência do perfil, a pausa e a categoria "lembretes"; falta contá-los no limite de frequência do ciclo de vida (Fase 7.4) e medir o retorno ao app.
* **Chá de Casa Nova (Fase 4):** ligar a reserva do convidado ao item (`gift_reservation_id`) para o "de quem foi o presente" vir preenchido.
* **Modo loja sem conexão:** a casca do app e as telas só ficam guardadas depois de abrir o modo loja uma vez com internet (service worker só no build de produção). Validar em aparelhos reais (Android e iPhone), incluindo a Wake Lock.

---

## 3. Matriz de Prioridade e Sequência de Execução

| Ordem | Entregável | Impacto Principal | Complexidade |
|:---:|---|---|:---:|
| **2º** | **Fase 2 (restante):** Cadastro Stripe, configuração live e validação do Pix em produção | Monetização e Negócio | Baixa-Média |
| **3º** | **Fase 3 (validação operacional):** Consulta ao Jev pelo fluxo autenticado do processo publicado | Retenção e Diferencial | Baixa |
| **4º** | **Fase 4:** Página pública de Chá de Casa Nova com Pix e Reservas | Crescimento Viral | Média |
| **5º** | **Fase 5 (restante):** Dockerfile, validação de infraestrutura e DNS, novos e-mails e ativação fiscal | Escala e Estabilidade | Média |
| **7º** | **Fase 7 (restante):** Validação em produção, receita recorrente, SEO, dashboards, novos fluxos e webhooks de e-mail | Aquisição, Ativação e Retenção | Média-Alta |
| **8º** | **Fase 8:** Inglês e espanhol no app inteiro + preço, impostos e conteúdo por região | Novos Mercados e Receita | Alta |
| **9º** | **Fase 9 (restante):** Auditoria, linha do tempo e contas relacionadas no painel, Turnstile e e-mails descartáveis | Proteção e Confiança | Média |
| **11º** | **Fase 11 (restante):** Bucket de documentos em produção, leitura automática da nota, lembretes de garantia no ciclo de vida e validação do modo loja offline | Retenção depois da mudança | Baixa-Média |

> **A ordem acima é de menor risco de produto, não de valor.** A validação em produção da Fase 7 (antes de comprar anúncios) e a Fase 9 devem ser **antecipadas**; a infraestrutura de idiomas da Fase 8 (nenhum texto novo fixo no código) também deve começar já, porque o custo de extração cresce a cada tela nova. Tabelas de região e preço da Fase 8 e o antifraude da Fase 9 são pré-requisitos da cobrança em outros países.
