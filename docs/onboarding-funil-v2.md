# Proposta: funil pós-cadastro v2 (`/comecar`)

Status: **proposta para decisão**. Nada foi implementado. O funil atual está em [onboarding-funil.md](onboarding-funil.md).

## Resumo em uma frase

Inverter a ordem do funil: **primeiro o plano (valor), depois as perguntas que refinam (dados)**, transformando as perguntas extras em "missões" opcionais que melhoram o plano de forma visível.

## Por que mudar

1. **O funil atual foi desenhado para convencer a criar conta, e a conta agora vem antes.** As telas `compare` ("a diferença de ter um plano") e o bloco "o que a conta libera" na tela `save` persuadem alguém que já se cadastrou. Elas custam tempo e não entregam valor novo.
2. **Hoje o plano só aparece depois de 15 telas de pergunta** (inclusive `worries` e `usage`, que quase não mudam o plano). O valor chega tarde.
3. **A lista de ideias traz ~20 perguntas novas.** Somadas às atuais, o funil passaria de 30 telas antes do primeiro resultado. Sem reordenar, isso derruba a conclusão.
4. **O risco de abandono mudou.** Com a conta já criada, quem sai no meio não deixa de ser lead (já temos e-mail). O que se perde é ativação. Então as perguntas que só enriquecem o lead podem ficar **depois** do plano pronto, onde pular não custa nada e a motivação é maior.

## O que a pesquisa sustenta (e o que não)

| Achado | Força da evidência | Uso aqui |
|---|---|---|
| **Efeito de progresso concedido** (Nunes e Drèze, 2006, *Journal of Consumer Research*): quem recebe um começo já marcado persiste mais e termina mais rápido | Forte (estudo acadêmico) | A barra começa com "Conta criada" já marcada, o que é verdade |
| Barra de progresso em seleção de plano: +5% a +10% de conversão em um teste, sem tamanho de amostra | Fraca (um caso, de blog) | Manter a barra, sem esperar um número |
| Efeito IKEA: o esforço só vale mais quando termina em algo concluído e que a pessoa possui | Média (Norton, Mochon e Ariely, 2011; revisões críticas) | O esforço das perguntas precisa terminar em plano visível |
| Efeito Zeigarnik ("tarefa incompleta gruda") | Contestada (replicações mistas) | **Não** usar como argumento nem como mecânica |
| Quizzes longos funcionam quando cada resposta muda visivelmente o produto, há progresso visível, motivo da pergunta e um momento de síntese (benchmark Lazyweb, 119 apps, 13 com 10+ perguntas) | Média (descritivo, sem taxa de conclusão) | Base do desenho: pergunta que não muda nada não entra |
| SaaS B2B usa 1 a 4 perguntas de boas-vindas e roteia por resposta (Canva, Airtable, Loom, Slack) | Média (exemplos reais, texto de fornecedor) | Vale como contraponto: o nosso é quiz de consumo, mas a regra "só pergunte o que usa" é a mesma |
| Duolingo faz a primeira lição **antes** de pedir conta e mostra um número concreto do plano já durante as perguntas | Média (análises de UX de terceiros) | Origem das telas "experimente" e dos números ao vivo |

**Limites da pesquisa, para não superestimar:**

- **Reddit, Hacker News e Indie Hackers não foram lidos.** A ferramenta de busca e o navegador bloqueiam o Reddit; a busca no Hacker News não retornou resultados; o Indie Hackers trouxe pouco. Quase tudo acima vem de blogs de fornecedores (Userpilot, Appcues, Chameleon) e de estudos acadêmicos. **Não há aqui nenhuma taxa de conversão de quiz funnel que possa ser tomada como verdade.** Se você tiver threads em mãos, vale colar para entrar na análise.
- Não achei dados de queda por pergunta. O número de perguntas ideal só sai de teste A/B nosso (o funil já emite os eventos de `step_view`/`step_complete`).
- Estatísticas como "35% de retenção com personalização" e "40 a 60% de queda" vêm de blogs sem fonte primária. Não usei.

## Princípios novos

1. **Valor primeiro, refino depois.** Pergunta que muda a *estrutura* do plano (quantos itens) vem antes do plano. Pergunta que *refina* ou só enriquece o lead vem depois, opcional.
2. **Cada pergunta mostra o que mudou.** Contador do plano ao vivo ("87 itens", "+6", "−4") em todas as telas, não só em `rooms` e `style`.
3. **Gamificação só com dado real.** Nada de pontos, selos ou números inventados (mantém o princípio 5 do funil atual). A "pontuação" é a **precisão do plano**, que sobe quando a pessoa responde.
4. **Pular é permitido e registrado.** Missões têm "agora não". Guardar `pulou` separado de `não respondeu` diz quais perguntas incomodam.
5. **Dados sensíveis, mínimo necessário** (ver "Privacidade").

## Sequência proposta

### Ato 1: A sua casa (antes do plano, obrigatórias)

Barra de progresso começa com **"Conta criada" marcada**.

| Tela | Pergunta | Muda o plano? | Valor para o lead |
|---|---|---|---|
| `welcome` | Prévia animada do checklist | n/a | n/a |
| `name` | Como podemos te chamar? | Personaliza | n/a |
| `moment` | Qual é o seu momento? Vamos morar juntos / Vou morar sozinho(a) / Vou dividir com amigos / Estou recomeçando / Mudando de casa | Cama, quantidades, tom | Segmento de vida |
| `tenure` | A casa é alugada ou própria? Alugada / Própria / Ainda não sei | Itens que furam parede, portáteis, cortina sem obra | **Estágio de compra** (quem comprou gasta mais em itens grandes) |
| `date` | Quando muda? (+ opção "Já tenho as chaves") | Prioridade e cronograma | **Urgência**: o melhor sinal de intenção de compra |
| `where` | Estado e cidade (cidade opcional) | Clima e itens regionais (já suportado em `regions.ts`) | Praça |
| `housing` | Apartamento / Casa / Studio | Ambientes | Segmento |
| `layout` | Quantos quartos e quantos banheiros (dois seletores numéricos) | Camas, jogos de cama, toalhas, tapetes | Porte da casa |
| `people` | Quantas pessoas? | Quantidades | Tamanho da família |
| `owned` | O que você já tem? Marcadores por item grande (cama, geladeira, fogão, máquina de lavar, sofá, TV, micro-ondas, armário…) | **Remove da lista na hora** | **O que ainda vai comprar, por categoria** (base para descontos e cashback) |
| `style` + `budget` | Completo ou minimalista; quanto investir | Lista e faixa | Ticket |

Total: **11 telas com pergunta antes do plano** (hoje são 15). `greet`, `timeline`, `climate` e `thanks` viram **reação inline do Nino** logo abaixo da pergunta, sem tela própria (−4 telas). `rooms` deixa de ser "marque todos os espaços": os espaços saem de `housing` + `layout`, e a pessoa só confirma ("algum outro? escritório, lavanderia, área externa").

### Ato 2: O plano (dopamina principal)

| Tela | Conteúdo |
|---|---|
| `building` | Mantida (≈ 4 s, checklist que vai marcando) |
| `ready` | Números sobem, ambientes entram em cascata. **Precisão do plano: 70%** |
| `try` (nova) | **"Experimente":** a pessoa marca 3 itens da primeira noite e vê o anel de progresso e o total mudarem. É o momento de valor do produto (marcar o que comprou) vivido antes de usar o app. Sem preço gravado: a estimativa de referência continua sem virar preço do item |

### Ato 3: Turbine seu plano (missões opcionais)

Cartões com "agora não". Cada missão leva **uma tela, um toque**, e termina mostrando o que mudou ("+6 itens", "3 alertas de voltagem"). A precisão sobe a cada uma até 100%.

| Missão | Pergunta | Efeito visível no plano | Valor para o lead |
|---|---|---|---|
| **Quem mora com você** | Criança pequena em casa? Algum bicho (cachorro, gato, outro)? Trabalha em home office? | Pet: comedouro, caminha, arranhador. Criança: protetor de tomada, tapete emborrachado. Home office: mesa, cadeira, luminária | Segmento de família; categorias de maior ticket |
| **Voltagem e gás** | Tomadas: 110 V, 220 V ou não sei. Gás: encanado, botijão, sem gás ou não sei | **Alertas nos eletros** ("confira a voltagem antes de comprar"), ajuste de fogão e itens de gás | Qualifica compra de eletros; evita queimar aparelho, dor real (há casos documentados de micro-ondas queimado em 220 V) |
| **Área externa** | Varanda, quintal, área gourmet ou nenhuma | Móveis externos, churrasqueira, mangueira | Segmento |
| **O que mais te preocupa** | `worries` (já existe) | Texto do resumo e ordem dos primeiros passos | **Melhor dado qualitativo para copy e marketing** |

`usage` ("como quer usar o Casa Mia") **sai**: não muda nada e pode ser inferido do que a pessoa faz no app.

### Ato 4: Valor consolidado e fim

Ordem: `savings` → `firstnight` → `schedule` (só com data) → `save`.

- **Sai `compare`** (persuasão sem função agora).
- `save` troca "o que a conta libera" por **"Convide quem vai morar com você"** para quem escolheu casal ou dividir (aproveita o convite por e-mail que já existe) e confete só aqui e em 100% de precisão.
- Confete e som, no máximo, em 3 momentos (`ready`, 100% de precisão, `save`). Mais que isso vira ruído.

## O que vira dado de lead

Além do perfil já gravado em `enxovais.onboarding_profile`, derivar no servidor (nada disso aparece para a pessoa):

- `intent_stage`: `explorando` (sem data), `planejando` (data > 8 semanas), `comprando_agora` (data ≤ 8 semanas ou chaves em mãos).
- `urgency_weeks`, `ticket_band` (orçamento × porte × estilo).
- `missing_categories`: grandes itens que a pessoa **não** marcou em `owned`.
- `skipped[]`: missões puladas.
- Painel de admin (`server/admin.ts`) com os cortes: estágio × estado, categorias faltantes, preocupação mais citada.

## Privacidade (LGPD)

- **Criança:** perguntar só "tem criança pequena em casa? sim/não". **Não** coletar nome, idade nem data de nascimento. O art. 14 da LGPD exige tratamento no melhor interesse da criança e consentimento específico de um responsável para dados de crianças; o sim/não sobre a casa não identifica ninguém, mas vale confirmar com quem responde juridicamente pelo serviço (a busca não trouxe orientação da ANPD).
- **Bicho:** só o tipo (cachorro, gato, outro).
- Atualizar `/privacidade` (`PrivacyPage.tsx`) com os novos campos antes de lançar, e mostrar o "por que perguntamos" em cada tela.
- Cada pergunta nova precisa de validação estrita em `server/onboarding-profile.ts`.

## Custo real da implementação

O trabalho pesado **não é a interface**, é o **catálogo**: pergunta que não muda o plano viola o princípio 1.

1. **Catálogo** (`catalog.ts`): novas marcas para inquilino/proprietário, pet, criança, home office, voltagem/gás, área externa. Estimativa: 40 a 60 itens novos ou marcados.
2. **Tipos e gerador**: `Answers`, `plan.ts` (voltagem vira nota no item, não filtra), `savingsFor` (novos motivos de exclusão).
3. **Armazenamento**: migrar `casamia.onboarding.v1` para v2 sem perder progresso.
4. **Servidor**: `parseOnboardingProfile`, colunas/derivados do lead, painel admin.
5. **UI**: reação inline do Nino, contador ao vivo, tela `try`, tela de missões, remover 5 telas.
6. **Testes**: `tests/onboarding.spec.ts` já está desatualizado em relação à ordem conta → funil (ver memória do projeto); atualizar junto.

Sugestão de entrega em fases independentes, cada uma já útil:

- **Fase 1:** reordenar (plano antes das perguntas de refino), cortar `compare`, `usage` e respiros, `tenure` e `layout`. Reduz o funil sem criar dado novo.
- **Fase 2:** missões (família, voltagem/gás, externa) com catálogo.
- **Fase 3:** `owned` por item, tela `try`, ficha do lead e painel.

## Como medir (A/B)

Eventos novos: `mission_view`, `mission_complete`, `mission_skip`, `precision_change`, `try_complete`. Comparar:

1. Conclusão até `save` (v1 × v2).
2. **Ativação em 7 dias** (≥ 1 item marcado). É a métrica que importa; cadastro já está garantido.
3. Taxa de aceitação por missão (se uma é pulada por mais de 60%, a pergunta não vale).
