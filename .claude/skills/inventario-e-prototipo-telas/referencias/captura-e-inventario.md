# Captura e inventário

Papel: engenheiro. Objetivo: registrar o que existe, com precisão e sem interpretação.

## 1. Mapear as rotas

- Partir do fluxo de onboarding (`docs/onboarding-funil.md`, `docs/onboarding-funil-v2.md`) e das rotas do código, se o projeto as expuser.
- Listar cada tela com um ID (T01, T02...) e a rota.
- Marcar o perfil necessário: público, autenticado ou pago.

## 2. Capturar os estados de cada tela

Para cada tela, capturar, quando aplicável:

- Padrão
- Vazio (ex.: lista sem itens)
- Carregando
- Erro
- Paywall (limite do plano gratuito: 2 cômodos, 5 itens por cômodo, 3 consultas de IA por mês)

Se um estado não puder ser provocado, registrar em "Lacunas e não verificado", com o motivo.

## 3. Ler os valores do navegador, não estimar

Para tokens, usar os estilos computados da página (cor de fundo, cor de texto, família de fonte, tamanho, peso, espaçamento, raio, sombra). Exemplo de abordagem: ler `getComputedStyle` nos elementos-chave e registrar os valores encontrados. Anotar a origem de cada valor.

Cores e fontes lidas assim são comparadas com a seção 7 de `docs/branding-casa-mia.md`. Divergências vão para a coluna "Divergência".

## 4. Mascarar antes de salvar

- Substituir nomes, e-mails, valores reais de pedidos e endereços por dados fictícios ou tarjas.
- Salvar as capturas brutas em `design/inventario/capturas-brutas/`, que não vai para o Git.
- Salvar em `design/inventario/capturas/` só as versões mascaradas e reduzidas.

## 5. Preencher o inventário

- Preencher `design/inventario/inventario.md` seguindo o modelo.
- Componentes recorrentes entram na seção 4, mesmo quando aparecem com pequenas variações. Registrar as variações, não só uma.
- Copy: anotar cada texto que não segue o glossário da marca (seção 5 de `docs/branding-casa-mia.md`), com a sugestão de termo oficial.

## 6. Conferir antes de encerrar

- Toda tela do mapa tem status "verificada" ou "não verificada".
- Nenhuma credencial, token ou dado pessoal aparece no `inventario.md` ou em `capturas/`.
- As seções de propostas continuam vazias ou com status "proposta".
