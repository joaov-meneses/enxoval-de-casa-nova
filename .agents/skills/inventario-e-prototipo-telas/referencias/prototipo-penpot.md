# Protótipo no Penpot

Papel: designer, com o inventário como fonte de verdade. Por padrão, reproduz o que existe.

## 1. Verificar o acesso ao Penpot antes de qualquer escrita

Caminho principal: o MCP do Penpot, já registrado no projeto com o nome `penpot` (ferramentas `mcp__penpot__*`).

1. Chamar `high_level_overview` e ler a documentação antes de qualquer código.
2. Confirmar a conexão com um `execute_code` somente leitura, por exemplo listando as páginas com `penpotUtils.getPages()`.
3. Criar tokens, componentes e telas com `execute_code`, seguindo as regras da documentação: usar layouts flex quando couber, nomear shapes semanticamente e não logar dados que já são retornados.
4. Conferir cada tela com `export_shape` antes de dar a etapa por concluída.

Se o MCP não responder, verificar se o plugin do MCP está conectado ao arquivo no navegador. Se o problema persistir, usar a exportação manual: gerar SVGs por tela e instruções de importação, e perguntar ao usuário como prosseguir.

O token da URL do MCP fica só na configuração do Claude Code. Nunca escrevê-lo em arquivo do repositório.

## 2. Organizar tokens antes das telas

Criar os tokens a partir do inventário, na seguinte ordem:

1. Cores, com os papéis da seção 7 de `docs/branding-casa-mia.md`.
2. Tipografia: Fraunces para títulos e logotipo, DM Sans para interface, DM Sans com figuras tabulares para preços.
3. Espaçamento, raios e sombras, a partir dos valores observados no app.

Quando o valor observado no app divergir da marca, criar o token com o valor do app e marcar a divergência. A decisão de qual valor manter fica para a fase de revisão.

## 3. Componentes antes das telas

- Criar os componentes recorrentes da seção 4 do inventário (botão, card de item, campo, navegação, Nino).
- Cada componente tem variantes para os estados que foram observados (padrão, foco, desabilitado, erro, quando existirem).
- Nomear seguindo uma hierarquia clara, ex.: `Botão / Primário / Padrão`.

## 4. Montar as telas

- Uma página do Penpot por fluxo (ex.: Onboarding, Meu Lar, Cômodo).
- Cada tela usa os componentes e os tokens, nunca valores soltos.
- Telas com estados (vazio, erro, paywall) ficam ao lado da versão padrão, na mesma página.
- Identificar cada tela com o mesmo ID do inventário (T01, T02...).

## 5. Comparar com o app

Comparar cada tela do protótipo com a captura correspondente. Registrar diferenças que não foram intencionais. Um protótipo que não bate com o app é um erro de reprodução, a menos que esteja marcado como proposta.
