# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Público principal: o **Ninho a Dois**, casais que vão morar juntos (casamento, noivado ou só dividir o mesmo teto). Eles precisam conciliar orçamentos diferentes, alinhar gostos e evitar compras e presentes repetidos, e por isso usam a mesma lista, ao mesmo tempo, de aparelhos diferentes.

Logo depois vêm os outros dois perfis do manual de marca:

- **Primeiro Lar:** quem está saindo da casa dos pais ou indo morar sozinho pela primeira vez. Não sabe quanto as coisas custam nem lembra dos itens "invisíveis" (abridor de lata, extensão, pano de chão).
- **Recomeço:** quem monta a casa de novo depois de uma separação ou de uma mudança de cidade, com orçamento apertado e pressa de ter o essencial.

A tarefa em comum: planejar e acompanhar o enxoval da casa nova por cômodo, do primeiro dia até a casa pronta, sem perder o controle do dinheiro.

## Product Purpose

O Casa Mia organiza e celebra a montagem da casa nova, item por item. Monta um plano por ambiente a partir de poucas perguntas (quem mora, tipo de moradia, data da mudança), coloca o essencial do Primeiro Dia na frente, acompanha o que já foi conquistado e quanto falta investir, e deixa quem mora junto editar a mesma lista.

Sucesso é a pessoa morar bem gastando o mínimo possível: o produto nunca tenta aumentar o valor das compras.

## Positioning

Diferente de marketplaces, blogs de decoração e planilhas, o Casa Mia prescreve prioridades em vez de empurrar produtos: a Regra do Primeiro Dia ordena a lista pelo que a casa precisa para funcionar, e o Nino (o mascote, alimentado pela IA Jev da TypeSafe AI) sugere o próximo item de cada cômodo, sugere o cômodo ao adicionar e avisa quando um item pode ser repetido ou dispensável. Ele sugere; quem decide é a pessoa.

## Operating Context

- Usado no celular (na loja, no sofá, na mudança) e no computador; no celular dá para criar um atalho na tela inicial (há `site.webmanifest`).
- Uma jornada com fim: montar a casa leva em média de 4 a 12 meses.
- Vários moradores editam o mesmo enxoval: o dono convida por e-mail e o convidado entra pelo link do convite (válido por 7 dias).
- Produtos chegam por link colado do Mercado Livre, da Amazon ou do Magalu (o app busca nome, foto e preço) e o preço é acompanhado ao longo do tempo.
- A lista pode ser importada e exportada em Excel e CSV.
- Idioma da interface: português do Brasil; valores em reais.

## Capabilities and Constraints

- Stack existente: React 19 + Vite, Tailwind 4 e shadcn/ui no front; Express e PostgreSQL no back. O produto exige conta e banco: não há modo de demonstração.
- Rotas: `/` (landing), `/login` e `/cadastro`, `/comecar` (onboarding que monta o plano), `/app`, `/convite`, `/esqueci-senha`, `/redefinir-senha`, `/privacidade`, `/como-o-nino-escolhe`, `/admin`.
- Situações do item: Pesquisando (a única pendente), Comprado, Recebido e Já tenho (as três contam como conquista).
- Cobrança (fonte da verdade: `src/plans.ts` e `server/billing.ts`, via Stripe):
  - Teste de 2 dias (48 horas) com cartão cadastrado; depois, cobrança mensal automática, cancelável no app antes do fim do teste.
  - **Mensal:** R$ 29,90 por mês.
  - **Passe da Casa Nova:** R$ 99, pagamento único, 12 meses de acesso sem renovação automática.
  - **Sem plano pago:** hoje a conta não entra no app (`SubscriptionAccess` exige plano) e vê a escolha de planos. Os limites do gratuito (1 enxoval, 2 ambientes, 10 itens por ambiente) seguem em `src/plans.ts`, sem uso na home.
  - O modelo do manual de marca (freemium sem cartão com Mensal, Semestral e Anual) está desatualizado.
- **Chá de Casa Nova:** configuração em `/app/:enxoval/cha` por quem criou o enxoval, com seleção explícita dos itens publicados; convidados acessam `/cha/:slug` sem conta, reservam presentes, deixam recados privados aos moradores e geram Pix estático direto para a chave cadastrada. Reservas e recados chegam ao app por SSE/PostgreSQL, com atualização periódica como alternativa; o recebimento é confirmado pelos moradores. A página exige acesso pago ativo do dono. Ver `docs/cha-de-casa-nova.md`.
- **Ainda não existe:** o limite de consultas ao Nino no gratuito e o bloqueio de convites no gratuito. A ativação live dos pagamentos e da emissão fiscal depende das pendências operacionais em `docs/pagamentos-e-notas-fiscais.md`.
- **Sem sincronização em tempo real:** as mudanças de quem divide a lista aparecem ao abrir ou atualizar o app (puxar para baixo). A home, o `PaywallDialog` e o `FeatureCarousel` dizem "o que um risca, o outro vê ao abrir o app" (ou "com quem mora com você"); nenhuma tela promete "em tempo real". O app também não registra quem riscou cada item.
- **Telas do "Como funciona" desatualizadas (adiado em 21/10/2026):** `public/images/como-funciona/passo-2-plano.webp` mostra "Pendentes" e `passo-3-conquiste.webp` mostra "Comprei" e "Economizou R$ 0,00". Recapturar a 780×1688 com dados de exemplo nas 4 situações do item.
- Terminologia oficial: "conquistar" e "riscar da lista" (nunca "comprar" ou "checkout"), "Meu Lar" (nunca "dashboard"), "próximo passo" ou "na fila" (nunca "pendente" ou "atrasado"), "tirar da lista" (nunca "deletar"), "Ops, tropeçamos aqui" para erros.

## Brand Commitments

- Nome: Casa Mia ("minha casa", em italiano). Manual completo em `docs/branding-casa-mia.md`; Design System publicado como artifact (tokens, componentes e o Nino).
- Personalidade: o Cuidador (protege do estresse e da ansiedade financeira) com o Amigo (fala de igual para igual, sem elitismo de decoração).
- Voz: português do Brasil, próximo e gentil, tratando por "você" (ou "vocês" ao casal), sem presumir gênero ou formação familiar. Sem emoji na interface.
- Nunca: escassez comercial ("compre nas próximas 2 horas"), alertas punitivos ou vermelho berrante para orçamento, venda de dados ou banners invasivos.
- Mascote: o Nino, casinha-chaveiro de terracota com barriguinha em porta em arco e chave dourada. Usar só a arte oficial (`public/brand/`), sem redesenhar, recolorir ou adicionar acessórios.

## Evidence on Hand

- Telas reais do app em `public/images/como-funciona/` (onboarding, visão geral, lista de um cômodo, convite para organizar juntos).
- Arte oficial do Nino e do logotipo em `public/brand/`.
- **Não existem:** depoimentos, números de usuários ou de uso, menções na imprensa, prêmios ou parceiros. Não inventar nenhum deles; exemplos ilustrativos (como "Apê da Ana e do Léo") precisam continuar claramente fictícios.

## Product Principles

1. **O casal decide junto:** tudo o que importa (lista, progresso, orçamento) é compartilhado e aparece igual para quem mora junto.
2. **Primeiro Dia primeiro:** o essencial para a casa funcionar vem antes da decoração.
3. **Respeito ao bolso:** o sucesso é gastar o mínimo para morar bem; avisar de repetição vale mais do que sugerir compra.
4. **Acolhimento antes da cobrança:** nada faz a pessoa se sentir atrasada ou culpada; imprevistos se ajustam sem alarme.
5. **Celebração democrática:** riscar um escorredor de R$ 25 vale tanto quanto riscar uma máquina de lavar.

## Accessibility & Inclusion

- WCAG 2.1 AA como padrão: texto a 4,5:1 (3:1 a partir de 24px), bordas de controle e foco a 3:1, alvos de toque de 44px.
- Status nunca depende só de cor: item conquistado também é riscado e o progresso tem o número escrito.
- Respeitar `prefers-reduced-motion`; movimento automático não passa de 5 s sem um jeito de pausar.
- Linguagem inclusiva: não presumir gênero, casal heterossexual ou formação familiar.
