# Revisão de UX/UI

Papel: designer crítico. Toda saída é proposta, registrada na seção 8 do inventário.

## Limite da revisão

Sem usuários reais, não há dados de abandono ou reclamações. A revisão usa heurísticas e boas práticas. Cada proposta precisa dizer isso, e o usuário deve validar com pessoas reais antes de implementar.

## 1. Revisão por tela

Para cada tela do protótipo, aplicar:

- **Heurísticas de Nielsen**: visibilidade do estado do sistema, correspondência com o mundo real, controle do usuário, consistência, prevenção de erros, reconhecimento em vez de memorização, flexibilidade, design minimalista, ajuda para recuperar de erros.
- **Acessibilidade** (`design:accessibility-review`): contraste, alvos de toque, rótulos, foco.
- **Crítica estruturada** (`design:design-critique`): hierarquia visual, foco principal, ordem de leitura.
- **Copy** (`design:ux-copy`): clareza, e aderência ao glossário e ao tom da marca.
- **Princípios da marca** (seção 6 de `docs/branding-casa-mia.md`): "Regra do Primeiro Dia", progresso visual concreto, respeito ao bolso, sem culpa por imprevistos.
- **Anti-valores** (seção 2 de `docs/branding-casa-mia.md`): nada de escassez artificial, alertas vermelhos berrantes ou banners invasivos.

## 2. Formato de cada proposta

Cada item da seção 8 do inventário tem:

- **Tela e elemento** afetados
- **Problema observado**, descrito de forma concreta
- **Princípio ou heurística** que embasa o problema
- **Proposta**, com o que mudaria
- **Status**: sempre "proposta" nesta fase

## 3. Prioridade

Ordenar as propostas por impacto no caminho principal (cadastro, primeira lista, primeiro item riscado) e por custo de mudança. Problemas de acessibilidade e de copy que contradiz a marca entram com prioridade.

## 4. Validação

Antes de implementar, recomendar um teste com 5 pessoas do perfil de cada persona (seção 8 de `docs/branding-casa-mia.md`), usando o roteiro de perguntas da mesma seção. O resultado do teste é registrado no inventário e pode confirmar, ajustar ou descartar cada proposta.
