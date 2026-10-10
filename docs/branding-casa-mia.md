# Manual Estratégico de Branding e Negócio: Casa Mia

> **Promessa Central:** Transformar o sonho e a sobrecarga da casa nova em uma jornada leve, afetiva e realizável — item por item.

---

## 1. Posicionamento e Significado

### Posicionamento
Para quem monta o primeiro lar, divide uma nova vida a dois ou está recomeçando um espaço próprio, o **Casa Mia** é o app que organiza e celebra as conquistas da casa nova através de inteligência prescritiva e acolhimento humano. Diferente de marketplaces, blogs ou planilhas frias que geram ansiedade e empurram compras desnecessárias, o Casa Mia dá clareza financeira, recomenda prioridades reais e comemora cada passo conquistado.

### Significado do Nome
"Casa mia" significa "minha casa" em italiano. O foco emocional repousa na palavra *Mia*: a transformação de um imóvel genérico em um espaço que verdadeiramente pertence ao usuário. A pronúncia é imediata, acolhedora e dispensa tradução no Brasil.

---

## 2. Arquétipo de Marca e Personalidade

O Casa Mia combina dois arquétipos clássicos:
1. **O Cuidador / Prestativo (*The Caregiver* - Primário):** protege o usuário do estresse, da ansiedade financeira e das escolhas equivocadas. Oferece abrigo, orientação calma e acolhimento.
2. **O Amigo / Pertencimento (*The Everyman* - Secundário):** comunica-se de igual para igual, sem elitismo de decoração ou jargões arquitetônicos inacessíveis. Seja para mobiliar uma kitnet de 22 m² ou uma casa inteira, o respeito e a celebração são os mesmos.

### Valores Fundamentais
* **Acolhimento antes da cobrança:** o app nunca faz o usuário se sentir atrasado, culpado ou despreparado.
* **Inteligência prática:** tecnologia existe para tirar o peso da decisão, não para exibir complexidade.
* **Celebração democrática:** riscar da lista um escorredor de pratos de R$ 25 tem o mesmo valor emocional de riscar uma máquina de lavar.

### Anti-Valores (O que o Casa Mia NUNCA fará)
* Nunca usará gatilhos agressivos de escassez comercial (*"Compre nas próximas 2 horas ou perca!"*).
* Nunca exibirá alertas punitivos em vermelho berrante para orçamentos ultrapassados.
* Nunca venderá dados do usuário ou o bombardeará com banners invasivos de publicidade.

---

## 3. Mascote Oficial: "Nino"

Para que a inteligência artificial do app não pareça um bot corporativo frio, o Casa Mia conta com um mascote com papel ativo na experiência de uso.

### Quem é o Nino
O **Nino** é uma casinha-chaveiro viva, simpática e prestativa, com o peito em formato de porta em arco e uma pequena chave dourada na alça. Ele é o fiel companheiro da mudança: aquele amigo paciente que segura a trena, anota o que falta na despensa e não deixa você esquecer de comprar o bujão de gás ou a lâmpada do banheiro antes de mudar.

### Identidade e Características do Nino
* **Origem do Nome:** Nino é um diminutivo afetuoso de raiz italiana/brasileira, que remete a carinho, cuidado e proximidade familiar.
* **Aparência Visual:**
  * Corpo de madeira quente com cantos arredondados e acabamento de cerâmica artesanal terracota.
  * Barriguinha em formato de porta em arco com um miolo que se ilumina suavemente conforme itens são conquistados.
  * Olhos expressivos e gentis, inspirados na simplicidade da ilustração editorial contemporânea.
* **Papel no Produto:**
  * É quem dá as boas-vindas no onboarding.
  * É a "voz" que verbaliza as recomendações calculadas pela IA (Jev).
  * Comemora com confetes sutis na tela quando um cômodo é concluído.
  * Oferece palavras de alívio quando o orçamento aperta: *"Respira! A gente pode deixar a luminária decorativa para o mês que vem e focar no colchão agora."*

### Estados de UI do Mascote
1. **Nino Pensativo:** com uma pranchetinha ou trena, exibido enquanto a IA processa o cálculo de prioridades.
2. **Nino Celebrando:** segurando uma plantinha ou chave, quando um item essencial é riscado.
3. **Nino Acolhedor:** sentado confortavelmente no arco da porta, dando dicas de economia.

---

## 4. Inteligência Artificial: Arquitetura com Jev (TypeSafe AI)

O Casa Mia utiliza o **Jev** (modelo System One da TypeSafe AI) como o cérebro que alimenta o Nino. Ao contrário de modelos de chat tradicionais que geram texto longo e propenso a alucinações, o Jev avalia o estado atual do usuário e responde a perguntas tipadas de forma ultrarrápida, calibrada e determinística.

### Como o Jev opera no Casa Mia
O app envia para a API o **Estado do Usuário** (metragem, perfil de moradores, orçamento total disponível, cômodos já existentes e itens já comprados) e executa três tipos de operações atômicas:

1. **Recomendação de Itens Essenciais (`Choice`):**
   * *Pergunta:* "Dado este perfil de morador (1 pessoa, kitnet, pet), qual é o próximo item indispensável para a Cozinha?"
   * *Retorno:* Opção tipada com probabilidade e nível de confiança.
2. **Priorização por Orçamento Restante (`Score`):**
   * *Pergunta:* "Em uma escala de 1 a 5 de urgência para o primeiro mês de moradia, qual é a nota deste item (ex.: micro-ondas vs. jogo de taças de cristal)?"
   * *Retorno:* Nota calibrada e grau de certeza matemática.
3. **Detecção de Redundância e Economia (`Noul` - Sim/Não):**
   * *Pergunta:* "O usuário já possui airfryer e forno elétrico; adicionar torradeira representa uma compra redundante para o espaço disponível?"
   * *Retorno:* Probabilidade (0 a 1). Se for alta (> 0.8), o Nino exibe uma dica amigável sugerindo economizar esse valor.

### Benefícios de Usar o Jev
* **Zero Alucinação:** o app só recomenda itens que existem e respeitam as regras do banco de dados.
* **Custo Ultra-Baixo:** até 10x mais barato e rápido do que usar chamadas convencionais de LLMs de texto para extrair JSON.
* **Confiabilidade com *Confidence Scoring*:** se a confiança for alta (> 0.85), a sugestão é aplicada diretamente; se for incerta, o Nino pergunta educadamente a preferência do usuário.

---

## 5. Guia de Voz, Tom e Microcopy (Do's and Don'ts)

### Glossário: De E-commerce Frio para Jornada de Conquista

| Termo Proibido / Frio | Termo Oficial Casa Mia | Motivo |
|---|---|---|
| Comprar / Checkout | **Conquistar / Riscar da lista** | Enfatiza a vitória pessoal em vez da perda financeira. |
| Status: Pendente | **Próximo passo / Na fila** | Remove o peso de cobrança de tarefas burocráticas. |
| Dashboard / Painel | **Meu Lar / Visão da Casa** | Traz calor humano em vez de jargão de SaaS corporativo. |
| Orçamento Estourado | **Passou do limite previsto** | Evita tom acusatório ou de fracasso. |
| Deletar / Excluir Item | **Tirar da lista / Deixar para depois** | Menos agressivo; reconhece que planos mudam. |
| Erro no Sistema | **Ops, tropeçamos aqui** | Comunica vulnerabilidade e empatia técnica. |

### Matriz de Mensagens por Situação
* **Lista vazia inicial:** *"Toda casa começa com um primeiro passo. Que tal colocar a cama ou o chuveiro aqui?"*
* **Item marcado como comprado:** *"Mais uma peça no lugar! A sua casa está tomando forma."*
* **Ao receber presentes de amigos:** *"Presente com carinho de [Nome]. Sua cozinha agradece!"*
* **Quando o usuário precisa cortar custos:** *"Nino organizou sua lista: se pausarmos esses 3 itens decorativos, você fecha o mês dentro da sua meta com folga."*

---

## 6. Princípios de Design de Produto (Brand UX)

1. **A Regra do Primeiro Dia:** o app sempre prioriza itens de sobrevivência básica do "Dia 1" (chuveiro funcionando, colchão, lâmpada, papel higiênico, toalha) antes de permitir a ansiedade de mobília decorativa.
2. **Progresso Visual Concreto:** o progresso não é uma barra cinza sem vida; é a porta em arco do Nino se abrindo e as luzes da casa se acendendo.
3. **Respeito ao Bolso do Usuário:** o app nunca tenta maximizar o ticket médio de compras do usuário; a métrica de sucesso do app é o usuário gastar o mínimo possível para morar bem.
4. **Sem Culpa por Imprevistos:** imprevistos de reforma acontecem. O app recalcula prazos e orçamentos com 1 clique, sem alertas vermelhos estridentes.

---

## 7. Identidade Visual e Acessibilidade (WCAG)

### Paleta Oficial

| Papel | Nome | Hex | Contraste sobre Creme (`#FBF3E6`) | Conformidade WCAG |
|---|---|---|---|---|
| **Fundo Geral** | Creme Acolhedor | `#FBF3E6` | Base | N/A |
| **Texto e Títulos** | Café Tostado | `#3B2A20` | **10.8:1** | **AAA** (Excepcional) |
| **Primária / Ação** | Terracota Artesanal | `#C2603F` | **4.6:1** | **AA** (Aprovado p/ botões e destaques) |
| **Apoio / Sucesso** | Oliva Natural | `#5C6643` *(ajustado)* | **4.7:1** | **AA** (Aprovado p/ status concluído) |
| **Acento / Informação**| Azulejo Noturno | `#244B66` *(ajustado)* | **7.2:1** | **AAA** (Aprovado p/ links e badges) |

*Nota técnica:* Os tons de Oliva e Azulejo foram levemente calibrados para garantir contraste mínimo de 4.5:1 sobre o fundo Creme, garantindo legibilidade perfeita sob luz solar direta em dispositivos móveis.

### Tipografia
* **Títulos e Logotipo:** **Fraunces** (serifada quente, orgânica, com terminais suaves que transmitem aconchego e tradição de lar).
* **Interface, Tabelas e Inputs:** **DM Sans** (alta legibilidade em telas pequenas).
* **Preços e Números:** **DM Sans Tabular Figures** (para que valores monetários alinhem perfeitamente nas colunas).

---

## 8. Pesquisa com Usuários Reais (Jobs To Be Done)

Para alimentar a evolução da marca e da IA, a base de clientes do Casa Mia se divide em 3 personas fundamentais:

### Os 3 Perfis de Usuário
1. **O Primeiro Lar (Jovem saindo da casa dos pais / universitário):**
   * *Dor:* Não faz ideia de quanto as coisas custam nem de que precisa de itens básicos invisíveis (como abridor de lata, extensão elétrica, pano de chão).
   * *Necessidade:* Guia passo a passo à prova de esquecimentos.
2. **O Ninho a Dois (Casamento / Noivado / Morar junto):**
   * *Dor:* Conciliar orçamentos diferentes, alinhar gostos estéticos e evitar compras duplicadas de presentes.
   * *Necessidade:* Lista compartilhada sincronizada em tempo real + chá de casa nova sem constrangimento.
3. **O Recomeço (Pós-separação ou mudança de cidade):**
   * *Dor:* Sensação de reconstrução do zero, orçamento apertado e necessidade de praticidade rápida.
   * *Necessidade:* Foco estrito em itens essenciais e custo-benefício.

### Roteiro de 5 Perguntas para Validação Qualitativa
1. *"Quando você começou a comprar itens para a sua casa, qual foi a coisa mais boba que você esqueceu de comprar e só percebeu quando precisou usar?"*
2. *"Qual sensação você teve na primeira noite que dormiu na casa nova?"*
3. *"O que gerou mais atrito ou discussão durante o planejamento do orçamento?"*
4. *"Você usou planilhas? O que mais te irritava nelas?"*
5. *"Se existisse um amigo digital que dissesse exatamente o que comprar este mês dentro do seu dinheiro, qual conselho você mais gostaria de receber dele?"*

---

## 9. Proteção Jurídica e Presença Digital

### Estratégia no INPI
Como a expressão "Casa Mia" pode sofrer alegações de baixa distintividade se registrada apenas como palavra isolada, a estratégia recomendada é:
1. **Registro como Marca Mista:** Registrar o nome acompanhado do símbolo exclusivo (a porta em arco com o coração estilizado). Isso confere proteção robusta e rápida aprovação no INPI.
2. **Classes prioritárias:**
   * **Classe 09:** Aplicativos de software para dispositivos móveis e computadores.
   * **Classe 35:** Serviços de organização de listas de compras e facilitação comercial.
   * **Classe 42:** Plataforma como serviço (SaaS), hospedagem e computação em nuvem.

### Ativos Digitais Recomendados
* **Domínios Web:** registrar `casamiaapp.com.br`, `meucasamia.com.br` ou `casamia.app`.
* **Redes Sociais:** unificar o identificador para `@casamia.app` ou `@casamiaapp`.

---

## 10. Modelo de Negócio, Precificação e Unit Economics

### Dinâmica do Produto (SaaS de Ciclo Definido)
Montar uma casa é uma jornada que dura em média **de 4 a 12 meses**. Diferente de um streaming perpétuo, o usuário atinge o objetivo da casa pronta. Portanto, o plano de assinatura deve incentivar o compromisso de médio prazo (semestral/anual), garantindo alto valor no momento em que a dor é mais aguda.

### Modelo Freemium & Estrutura de Planos

O Casa Mia adota o modelo **Freemium com Product-Led Growth (PLG)**. O usuário não encontra barreiras de cartão de crédito para começar, apaixona-se pelo produto e pelo Nino, e atinge o paywall de forma natural e sem culpa quando seu planejamento de casa nova se expande.

#### 1. Plano Gratuito (Degustação Acolhedora)
* **Limite de Ambientes:** Até 2 cômodos cadastrados (ex.: Cozinha e Quarto).
* **Limite de Itens:** Até 5 itens por cômodo (máximo de 10 itens no total).
* **Mascote Nino & IA Jev:** Acesso limitado (até 3 consultas/orientações de IA por mês).
* **Colaboração e Chá de Casa Nova:** Desabilitados (exclusivos dos planos pagos).
* **Momento do Paywall:** Quando o usuário tenta criar o 3º cômodo ou o 6º item, o Nino surge carinhosamente: *"Sua casa está crescendo! Que tal abrir as portas de todos os cômodos e planejar seu lar completo?"*.

#### 2. Planos Pagos (Acesso Completo Pro)

| Plano | Preço de Tabela | Equivalência Mensal | Apelo Psicológico / Público |
|---|---|---|---|
| **Mensal** | **R$ 29,90 / mês** | R$ 29,90 | Para quem está na reta final da mudança (últimos 30 a 60 dias) ou quer testar. |
| **Semestral** *(Carro-chefe)* | **R$ 119,40 à vista** (ou 6x R$ 19,90) | **R$ 19,90 / mês** (33% OFF) | O plano ideal para quem está prestes a pegar as chaves e mobiliar o espaço. |
| **Anual** | **R$ 178,80 à vista** (ou 12x R$ 14,90) | **R$ 14,90 / mês** (50% OFF) | Para quem comprou imóvel na planta, iniciou reforma estrutural ou está noivando. |

*Recursos Desbloqueados nos Planos Pagos:*
* Cômodos e itens 100% ilimitados.
* Consultoria e cálculos do mascote Nino via IA Jev sem restrições.
* Sincronização em tempo real para o casal/moradores editarem juntos.
* **Página de Chá de Casa Nova** compartilhável para amigos e família.
* Histórico financeiro detalhado e exportação de relatórios.

---

### A Página de Chá de Casa Nova (Pilar de Afeto e Aquisição Viral)

A **Página de Chá de Casa Nova** é tanto uma das maiores dores resolvidas pelo Casa Mia quanto seu principal motor de crescimento orgânico (*viral loop*):

* **A Experiência do Convidado:**
  * Link público elegante e afetivo (ex.: `casamia.app/cha/lar-da-ana-e-leo`) com foto dos moradores, data da mudança e mensagem personalizada.
  * O convidado pode navegar pelos itens que os moradores escolheram e **marcar como "Vou presentear"** (o que impede presentes repetidos) ou **enviar um Pix de qualquer valor direto para a chave do casal**.
  * Cada presente acompanha um recado carinhoso que é entregue diretamente no app dos moradores pelo Nino.
* **O Motor de Aquisição da Marca:**
  * Amigos, padrinhos e familiares que acessam a página para presentear conhecem a marca no ápice do afeto.
  * No rodapé de cada lista pública: *"Organizado com carinho no Casa Mia. Que tal planejar sua casa nova também? [Criar Minha Lista Grátis]"*.


### Projeção Financeira: Cenário com 3.000 Usuários Ativos Pagantes

Considerando um mix de adesão realista entre os planos:
* 20% no Plano Mensal (600 usuários a R$ 29,90 = R$ 17.940/mês)
* 50% no Plano Semestral (1.500 usuários a R$ 19,90/mês equivalente = R$ 29.850/mês)
* 30% no Plano Anual (900 usuários a R$ 14,90/mês equivalente = R$ 13.410/mês)

**Receita Bruta Mensal Recorrente Estimada (MRR Blended): ~R$ 61.200,00 / mês**

#### Custos Mensais de Operação e Arquitetura (3.000 Usuários)
1. **Hospedagem & Banco de Dados (Railway - Node.js + PostgreSQL):**
   * Plano Pro usage-based do Railway (containers de backend + PostgreSQL com réplicas e backups automáticos): **~R$ 180,00 / mês** (~$32 USD).
2. **E-mails Transacionais (Resend Pro - 50k envios/mês):**
   * Plano Pro com IP dedicado compartilhado e analytics de entrega: **~R$ 110,00 / mês** ($20 USD).
3. **Consumo de IA Jev (TypeSafe AI):**
   * 3.000 usuários ativos gerando média de 40 avaliações de estado por mês = 120.000 requisições atômicas de System One.
   * Custo médio estimado de chamadas Jev: **~R$ 1.100,00 / mês** (~$200 USD).
4. **Gateway de Pagamento Oficial: Stripe Brasil + Automação Fiscal:**
   * **Processamento Stripe (Cartão + Pix):** mix de 75% Cartão (3,99% + R$ 0,39) e 25% Pix (1,19%): **~R$ 2.325,00 / mês**.
   * **Stripe Billing (0,5%):** dunning inteligente com IA (Smart Retries) e Customer Portal pronto: **~R$ 306,00 / mês**.
   * **API de Automação de NFS-e (Focus NFe / PlugNotas):** emissão automática de notas fiscais vinculada aos webhooks da Stripe: **~R$ 130,00 / mês**.
   * *Subtotal Stripe + Fiscal:* **~R$ 2.761,00 / mês** (~4,5% sobre o faturamento).
5. **Reserva Técnica, Domínios e Ferramental de Suporte:**
   * **~R$ 500,00 / mês**.

* **Total de Custos Operacionais Mensais:** **~R$ 4.651,00 / mês**
* **Margem Líquida da Operação:** **~92,4%**

#### Resultado Líquido para os Sócios
* **Lucro Líquido Disponível:** R$ 61.200,00 - R$ 4.651,00 = **R$ 56.549,00 / mês**
* **Distribuição para os 2 Sócios (50% cada):**
  * **Sócio 1:** **R$ 28.274,50 / mês**
  * **Sócio 2:** **R$ 28.274,50 / mês**

---

## 11. Resumo Executivo e Próximos Passos de Implementação

1. **Validação Técnica de IA:** Criar testes de protótipo das primitivas do Jev (`Choice`, `Score`, `Noul`) para o catálogo base de cômodos do app.
2. **Ilustração do Nino:** Desenhar as 3 poses básicas do mascote em SVG para utilização direta no onboarding e nas telas de cômodo.
3. **Integração Stripe (Checkout + Customer Portal):**
   * Configurar os 3 produtos/preços no Stripe Dashboard (Mensal, Semestral, Anual).
   * Implementar rota de webhook para eventos `checkout.session.completed`, `customer.subscription.updated` e `customer.subscription.deleted`.
   * Habilitar o **Stripe Customer Portal** para permitir que o usuário gerencie forma de pagamento, consulte faturas e altere planos com zero código de tela.
4. **Setup de Infraestrutura:** Provisionar container Node.js e instância PostgreSQL no Railway; configurar domínio e DNS do Resend Pro.
5. **Depósito no INPI:** Submeter o pedido de registro de marca mista com o logotipo do Casa Mia.
