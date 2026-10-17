# Inventário de telas: Casa Mia

> Preenchido a partir do app real em `localhost`. Itens não verificados ficam marcados como **não verificado**, com o motivo.

## 1. Metadados da captura

- **Data:** 2026-10-17
- **Ambiente:** `http://localhost:3000` (`npm run dev`, Postgres em Docker). Janela do navegador com viewport de 1536 x 674 px.
- **Versão do app / commit:** branch `homologacao`, a partir do commit `3680fc6`, com as alterações locais ainda não commitadas.
- **Conta de teste utilizada:** perfil gratuito, sem assinatura. Uma conta de teste já existente no navegador (só leitura, para as telas do app) e uma conta criada pelo fluxo de cadastro (usada para o funil `/comecar` e para marcar 14 itens como conquistados). Nenhuma credencial é registrada aqui.
- **Responsável pela captura:** Claude Code (agente), a pedido de Jeo Araujo.

## 2. Fontes consultadas

- Navegação no app real
- `docs/branding-casa-mia.md` (paleta, tipografia, voz, princípios)
- `design/inventario/referencias/enxovaly.md` (análise da referência, ideias R01 a R07)
- Código: `src/index.css`, `src/landing.css`, `src/product.css`, `src/components/*`
- `docs/onboarding-funil.md` e `docs/onboarding-funil-v2.md`: não relidos nesta rodada (o funil foi percorrido no app).

## 3. Mapa de telas

As capturas finais ficam em `design/inventario/capturas/` (reduzidas e mascaradas). As brutas ficam em `capturas-brutas/`, ignorada pelo Git. Os arquivos levam o ID da tela no nome.

| ID | Nome | Rota | Perfil necessário | Estados capturados | Captura final | Status |
|---|---|---|---|---|---|---|
| T01 | Home (landing) | `/` | público | padrão (topo); seção do carrossel (depois da alteração); celular só por emulação em iframe de 390 px | `T01-landing-topo.webp`, `T01-landing-carrossel-depois.webp` | verificada (desktop); celular verificado por iframe |
| T02 | Entrar | `/login` | público | padrão, antes e depois do carrossel | `T02-login.webp`, `T02-login-depois.webp` | verificada. Erro e carregando: **não verificado** |
| T03 | Criar conta | `/cadastro` | público | padrão, antes e depois do carrossel | `T03-cadastro.webp`, `T03-cadastro-depois.webp` | verificada. Erro e carregando: **não verificado** |
| T04 | Visão geral | `/app` | autenticado (gratuito) | 0% com poucos dados; 8% com 14 itens conquistados e desconto registrado | `T04-app-visao-geral.webp`, `T04-visao-geral-conta-antiga.webp` | verificada |
| T05 | Lista de um ambiente | `/app` (clique em um ambiente da barra lateral) | autenticado | não capturado | | **não verificado** (priorizei as telas de maior valor) |
| T06 | Meu enxoval (lista de itens) | `/app` | autenticado | com itens conquistados e itens "Sem preço" | `T06-app-meu-enxoval.webp` | verificada. Vazio e item expandido: **não verificado** |
| T07 | Planejamento ("Quando comprar cada coisa") | `/app` | autenticado | perfil de gasto, faixa esperada, etapas da compra | `T07-app-planejamento.webp`, `T07-planejamento-conta-antiga.webp` | verificada |
| T08 | Ajuda do Nino (dentro do Planejamento) | `/app` | autenticado | padrão; com sugestão do Nino | `T08-app-ajuda-nino.webp`, `T08-nino-prioritarios-antigo.webp` | verificada |
| T09 | Importar itens (planilha) | `/app` (modal) | autenticado | padrão | `T09-importar-planilha.webp` | verificada |
| T10 | Novo item com "Importar por link" | `/app` (modal) | autenticado | padrão. Busca por link (resultado): **não verificado**, pois exigiria acessar loja de terceiros | `T10-novo-item-importar-link.webp` | verificada (estado inicial) |
| T11 | Convidar pessoa | `/app` (modal) | autenticado | padrão (e-mail do dono coberto na captura final) | `T11-convidar.webp` | verificada |
| T12 | Descontos e cashback | `/app` (modal) | autenticado | padrão, sem descontos | `T12-descontos.webp` | verificada |
| T13 | Planos do Casa Mia (paywall) | `/app` (modal) | autenticado (gratuito) | padrão. Paywall disparado pelo limite de itens: **não verificado** | `T13-planos.webp` | verificada |
| T14 | Central de ajuda | `/app` (modal) | autenticado | escolha do assunto. Formulário de envio: **não verificado** (enviaria mensagem) | `T14-ajuda.webp` | verificada |
| T15 | Funil de entrada | `/comecar` | autenticado, sem enxoval | boas-vindas, nome, momento, data, orçamento, preocupações, plano pronto, ambientes, comparação com lista genérica, salvar | `T15-funil-*.webp` | verificada. Etapas de estado, clima, tipo de casa, pessoas, espaços, itens que já tem e estilo foram percorridas sem captura de tela |
| T16 | Esqueci minha senha | `/esqueci-senha` | público | padrão | `T16-esqueci-senha.webp` | verificada. Envio do e-mail: **não verificado** |
| T17 | Política de privacidade | `/privacidade` | público | topo da página | `T17-privacidade.webp` | verificada |
| T18 | Troca de senha obrigatória | `/change-password` | autenticado, com troca pendente | | | **não verificado**: exige conta marcada para trocar a senha |
| T19 | Redefinir senha | `/redefinir-senha` | público, com token do e-mail | | | **não verificado**: exige o link enviado por e-mail |
| T20 | Convite recebido | `/convite` | público, com token do e-mail | | | **não verificado**: exige o link de convite |
| T21 | Administração | `/admin` | administrador | | | **não verificado**: exige credencial própria da administração, que não foi usada |
| T22 | Página do Chá de Casa Nova (convidado) | não encontrada | público | | | **não verificado**: a landing e o plano pago prometem a página, mas não há rota nem tela no código. Registrado como lacuna |
| T23 | Menu Exportar, histórico de preço, abertura do item | `/app` | autenticado | | | **não verificado**: o menu abre abaixo da dobra e não foi capturado |

Estados mínimos a cobrir por tela: padrão, vazio, carregando, erro, e paywall quando aplicável. Carregando e erro não foram capturados em nenhuma tela (exigiriam simular falha de rede).

## 4. Componentes recorrentes

| Componente | Variantes observadas | Telas onde aparece | Observações |
|---|---|---|---|
| Botão primário | terracota cheio (`.cm-btn-primary` na home, `.button-dark` no login/cadastro e `Adicionar item` no app); secundário com borda; fantasma | T01 a T15 | Todos usam `--cm-action` (`#b5532f`), um terracota mais escuro que o oficial, para dar contraste AA com texto branco |
| Card de item | linha com círculo de conquista, etiquetas de ambiente e semana, preço e situação | T06 | Itens conquistados ficam riscados, em oliva |
| Campo de formulário | campo com rótulo acima, ícone de mostrar senha | T02, T03, T10, T11, T16 | |
| Navegação | barra lateral (Visão geral, Planejamento, Meu enxoval, ambientes); barra superior com ações; menu de vidro na home | T01, T04 a T07 | Em telas estreitas, a home usa menu recolhido |
| Mascote Nino | pose "wave" (acenando) e "think" (com a pranchetinha) | T01, T07, T08, T15 e agora no carrossel (slide do Nino) | |
| Carrossel de funcionalidades (novo) | tom claro (home) e tom escuro (login e cadastro) | T01, T02, T03 | Componente `src/components/FeatureCarousel.tsx` |

## 5. Tokens visuais

### Cores

| Papel | Valor no app | Valor na marca | Divergência |
|---|---|---|---|
| Fundo geral | `#fbf3e6` (`--cm-bg`, `--color-brand-cream`) | `#FBF3E6` | nenhuma |
| Texto e títulos | `#3b2a20` (`--cm-text`) | `#3B2A20` | nenhuma |
| Primária / ação | `#c2603f` (`--cm-primary`); botões usam `#b5532f` (`--cm-action`); texto e hover usam `#a34c30` | `#C2603F` | **Intencional e já documentada no CSS**: o terracota oficial dá 4,2:1 com texto branco (abaixo de AA); os tons mais escuros dão 4,9:1 ou mais. Mantido. Recomendo registrar a exceção no manual de marca |
| Apoio / sucesso | `#5c6643` (`--cm-success`); barras e itens riscados usam tons de oliva mais claros | `#5C6643` | tons claros de oliva e de azul/verde nos cartões do Planejamento não constam na paleta oficial (são variações de superfície). Não alterado |
| Acento / informação | `#244b66` (`--cm-accent`) | `#244B66` | nenhuma |

Nenhuma cor nova foi criada nesta rodada. O carrossel usa apenas `--cm-bg`, `--cm-text`, `--cm-primary`, `--cm-primary-dark`, `--cm-accent` e os neutros já definidos em `.cm-page` (`--cm-card`, `--cm-line`, `--cm-muted`). No tom escuro, usa o creme `#fbf3e6` com transparência e `#e0c2a1`, que já aparecia em `.auth-story-copy h2 em`.

### Tipografia

| Uso | Valor no app | Valor na marca | Divergência |
|---|---|---|---|
| Títulos e logotipo | Fraunces (`--font-serif`) | Fraunces | nenhuma |
| Interface e inputs | **Nunito** (`--font-sans`, importada em `src/index.css`) | DM Sans | **Divergência.** O app inteiro usa Nunito; DM Sans não é carregada em lugar nenhum. A referência Enxovaly também usa Nunito. Não troquei a fonte global (fora do escopo e afeta todas as telas). O carrossel herda a fonte do app para ficar coerente |
| Preços e números | Nunito, com figuras tabulares só em poucos pontos (`catalog-admin.css`, `onboarding.css`) | DM Sans com figuras tabulares | **Divergência.** Valores em `T04`, `T06` e `T07` não usam figuras tabulares |

### Espaçamento, raios e sombras

| Token | Valor observado | Onde aparece |
|---|---|---|
| Raio de botões | 14 px (`.cm-btn`) | home |
| Raio do quadro do carrossel | 18 px, sombra suave `0 24px 48px -28px` em café com transparência | carrossel |
| Duração e curva de transição | 0,45 s com `cubic-bezier(0.23, 1, 0.32, 1)` | carrossel e frase rotativa do hero |

## 6. Copy e tom

Verificar se as mensagens do app seguem o glossário da marca (seção 5 de `docs/branding-casa-mia.md`).

| Trecho no app | Tela | Termo proibido ou tom fora da marca | Sugestão de termo oficial |
|---|---|---|---|
| "Comprar" (botão do Passe da Casa Nova) | T13 | Termo frio de e-commerce | "Quero o Passe", como já está na home. Os botões da home já usam esse tom |
| "Comprar: 2 semanas antes" e "Atrasado · " | T06 | "Atrasado" tem tom de cobrança | "Conquistar: 2 semanas antes"; "Na fila" no lugar de "Atrasado" |
| "Mais atrasado" (ambiente com menos progresso) | T04 | Tom acusatório | "Esperando por você" ou "Próximo da fila" |
| "Preciso comprar", "Comprei" | T06 | Status em tom de e-commerce | "Quero conquistar", "Conquistei" |
| "Excluir enxoval", "Excluir ambiente" | T04 a T07 | Verbo agressivo | "Tirar da lista" / "Deixar para depois" |
| "Os planos já estão disponíveis para compra? Ainda não…" | T01 (FAQ) | **Conteúdo desatualizado**: o app já tem pagamento pela Stripe (T13) | Revisar a resposta e o aviso "nenhuma cobrança é realizada" na seção de preços |
| "Acima da faixa" (etapa da compra) | T07 | Aceitável: etiqueta em salmão suave, sem vermelho berrante | manter; o glossário sugere "Passou do limite previsto" |

Textos novos do carrossel seguem o glossário: usam "conquistou", "conquista", "riscar" e não usam "comprar" como chamada.

## 7. Lacunas e não verificado

- T05, T18 a T23 e estados de carregando e erro: ver tabela da seção 3.
- **Celular no app autenticado:** não verificado (o redimensionamento da janela não funcionou, a largura permaneceu em 1536 px). A home, o login e o cadastro foram conferidos em 390 px por meio de um iframe na mesma origem, que aplica as media queries de verdade; isso é uma emulação, não um aparelho.
- **Carrossel no celular nas telas de login e cadastro:** por design existente, a coluna da foto (`.auth-story`) some abaixo de 600 px. O carrossel some junto. Não alterei esse comportamento.
- **Busca por link (T10):** o resultado não foi capturado, pois exigiria acessar loja de terceiros.
- **Funil `/comecar`:** as etapas de estado, clima, tipo de casa, número de pessoas, espaços, itens que já tem e estilo foram percorridas pelo script, sem captura.
- **Limite do plano gratuito:** na conta de teste criada, o funil gerou 165 itens em 7 ambientes sem que o paywall aparecesse, apesar da tela de salvar dizer que "entram os 2 primeiros ambientes com até 10 itens cada". Não investiguei; vale conferir se o limite é aplicado no servidor.
- **Conta usada no teste:** ao registrar a conta de teste, o navegador preencheu o e-mail e a senha salvos do dono da máquina (preenchimento automático), e a conta foi criada no Postgres local com esse e-mail. Nenhum dado foi lido ou repetido aqui. Ver a entrega para o que fazer com essa conta.

### Protótipo no Penpot (arquivo "Casa Mia", 9 páginas)

- Páginas 00 a 08: capa e índice, design system, site público, acesso e conta, onboarding (24 passos em 5 grupos), app (telas principais e diálogos), paywall e planos, admin.
- Fidelidade: T01, T40–T42 e T44–T50 seguem as capturas. As demais telas foram reconstruídas do código. Textos de descrição em T05–T13, T33–T36, T61–T63 e os cards de recursos e planos Grátis/Mensal da landing são ilustrativos.
- O Nino do protótipo é um desenho simplificado; a arte real está em `public/brand`.
- Não conferido visualmente por exportação: grupos do funil (exceto geometria), acesso e conta, admin.
- Versão mobile e estados vazio, carregando e erro (exceto T42b, T03b e T50d, que são reconstruções) não foram prototipados.

## 8. Propostas de melhoria

> Esta seção contém propostas, não mudanças aplicadas, exceto onde a coluna Status disser o contrário. Cada item só vira mudança no protótipo ou no app depois de aprovado.

| ID | Tela | Problema observado | Princípio ou heurística | Proposta | Status |
|---|---|---|---|---|---|
| P01 | Home (FAQ e preços) | A resposta "Os planos já estão disponíveis para compra? Ainda não" e o aviso de que nenhuma cobrança é realizada contradizem T13, que já vende o Passe e o plano mensal | Honestidade com o usuário | Atualizar o texto da FAQ e o aviso da seção de preços | proposta |
| P02 | Home e planos | O Chá de Casa Nova é prometido (home, FAQ, plano pago), mas não existe tela para o convidado | Não prometer o que não existe | Marcar como "em breve" ou priorizar a página pública (ver R04) | proposta |
| P03 | App (lista e visão geral) | Vocabulário de cobrança: "Atrasado", "Mais atrasado", "Comprar" | Glossário da marca (seção 5) | Trocar pelos termos da tabela da seção 6 | proposta |
| P04 | Todo o app | DM Sans não é usada; números sem figuras tabulares | Tipografia oficial (seção 7 da marca) | Decidir entre adotar DM Sans ou atualizar o manual para Nunito; aplicar `font-variant-numeric: tabular-nums` nos valores | proposta |
| P05 | Login e cadastro | No celular a coluna com a foto some, e o carrossel some junto | Mostrar valor antes do cadastro | Avaliar uma versão compacta do carrossel abaixo do formulário no celular | proposta |
| P06 | Home | A seção "Como funciona" e o carrossel repetem parte do conteúdo (plano, lista, lista a dois) | Clareza e economia de rolagem | Se o carrossel ficar, enxugar os passos de "Como funciona" ou trocar os slides repetidos | proposta |

### Ideias de referências (origem: `referencias/enxovaly.md`)

| ID | Tela | Problema ou oportunidade | Princípio ou heurística | Proposta | Status |
|---|---|---|---|---|---|
| R01 | Início (hero) | Mostrar o app em uso no hero, com estado real da lista | Progresso visual concreto | A home já tem o mockup "Meu Lar" com a porta em arco e o Nino. Reforçado com capturas reais do app no carrossel (seção "Por dentro do Casa Mia") | **aplicada em parte** (hero já existia; carrossel adicionado) |
| R02 | Lista por categoria | Falta de sinal claro de conclusão por categoria | Progresso visual concreto; celebração de conquistas | Barra, contagem e estado "Completo" por categoria. Dentro do app autenticado; fora do escopo desta rodada | proposta |
| R03 | Transições gerais | Movimento pode reforçar conquistas | Confetes sutis do Nino (seção 3 da marca) | Aplicado só no carrossel: troca de slide em 0,45 s, barrinha de tempo, e sem movimento para quem pede menos movimento. Confetes não foram implementados | **aplicada em parte** |
| R04 | Página de chá (convidados) | Presentes repetidos no chá | Página de Chá de Casa Nova (seção 6 da marca) | Lista pública mostrando só o que falta e o que já foi reservado. Não aplicada: a página nem existe ainda (P02) | proposta |
| R05 | Armário / cadastro | Cadastro manual de cada peça | Inteligência prática (seção 2 da marca) | Cadastro por foto com revisão antes de salvar. Recurso novo; não aplicado. O "Importar por link" já cobre parte da dor e entrou no carrossel | proposta |
| R06 | Planejamento | Compra excessiva por insegurança | Respeito ao bolso (seção 6 da marca) | O slide "Um plano do tamanho da sua casa" destaca as quantidades ajustadas e o que não precisa ser comprado, já presentes no funil | **aplicada em parte** (copy do carrossel) |
| R07 | Chamada final | Oportunidade de tom acolhedor no fechamento da página | Acolhimento antes da cobrança (seção 2 da marca) | A chamada final da home já usa "Sem pressa. Sem cartão. Do seu jeito." O mesmo tom foi usado no carrossel. Nada alterado na chamada final | já atendida |

## 9. Carrossel de funcionalidades

Componente `src/components/FeatureCarousel.tsx`, usado na home (seção `#por-dentro`, depois de "Como funciona") e na coluna da foto de login e cadastro. Avança sozinho a cada 6,5 s, um slide por vez; pausa com o mouse ou o foco; tem setas, pontos com barrinha de tempo e botão de pausa; não avança sozinho com `prefers-reduced-motion`.

| Ordem | Funcionalidade | Captura | Por que entrou |
|---|---|---|---|
| 1 | Plano sob medida | `carrossel-01-plano.webp` (T15) | É o primeiro valor percebido: lista pensada para o clima, a casa e os moradores, sem o que não precisa comprar |
| 2 | Lista por cômodo | `carrossel-02-lista.webp` (T06) | O núcleo do produto: riscar item por item |
| 3 | Planejamento: quando comprar | `carrossel-03-quando-comprar.webp` (T07) | Responde "o que primeiro e quanto gastar" |
| 4 | Nino | `carrossel-04-nino.webp` (T08) | A voz da marca e a ajuda de priorização |
| 5 | Importar por link | `carrossel-05-link.webp` (T10) | Tira trabalho do usuário (nome, foto, preço) e acompanha queda de preço |
| 6 | Visão da casa | `carrossel-06-visao-geral.webp` (T04) | Progresso, dinheiro investido e economia |
| 7 | Lista a dois | `carrossel-07-lista-a-dois.webp` (T11) | Dor central da persona "Ninho a Dois" |

Ficaram de fora: descontos e cashback (cabe no slide 6), importar planilha (nicho) e Central de ajuda. O Chá de Casa Nova não entrou porque a tela não existe.
