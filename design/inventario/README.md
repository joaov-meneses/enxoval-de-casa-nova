# Inventário de telas do Casa Mia

Esta pasta guarda o inventário do app real: as telas que existem hoje, os componentes recorrentes, os tokens visuais e as propostas de melhoria. Quem gera e mantém esse conteúdo é a skill `inventario-e-prototipo-telas` (em `.claude/skills/`).

## Estrutura

- `inventario.md`: documento principal, seguindo o modelo do arquivo. É a fonte de verdade do que existe.
- `capturas/`: capturas finais, já mascaradas e em tamanho reduzido. Esta pasta é versionada.
- `capturas-brutas/`: capturas com dados reais, usadas durante o trabalho. Está no `.gitignore` e **nunca deve ser commitada**.

## Regras

- Não registrar senhas, tokens, e-mails reais ou dados de pedidos e de pessoas, nem no texto nem nas imagens.
- Usar conta de teste para as telas autenticadas.
- Cada proposta de melhoria fica em seção própria do `inventario.md`, com status "proposta", até ser aprovada.
- Referências visuais e tokens seguem `docs/branding-casa-mia.md`. Quando o app divergir da marca, a divergência é registrada, não corrigida em silêncio.
