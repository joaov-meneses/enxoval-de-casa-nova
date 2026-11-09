# Codex: agentes, skills e hooks

Data: 2026-11-06

## O que mudou

- `.codex/config.toml` define o modelo principal e ativa subagentes; `.codex/agents/` contém os papéis explorador, planejador, implementador, revisor e testador.
- `.agents/skills/` espelha as skills existentes de `.claude/skills/` e acrescenta `entregar-mudanca-codex`, que orienta o spawn e a sequência de trabalho.
- `.codex/hooks.json` instala contexto de sessão, proteção de comandos/arquivos e lint TypeScript ao encerrar.
- `AGENTS.md` orienta o Codex a usar o fluxo para mudanças com mais de um arquivo ou módulo.

## Correspondência de modelos

`gpt-6.1-sol` com esforço `high` atende planejamento e revisão; `gpt-6-luna` com esforço `high` atende exploração, enquanto testes usam Luna em `medium`. Isso é uma distribuição por custo e dificuldade, não uma equivalência direta de capacidades entre modelos Anthropic e OpenAI. Troque os slugs se não estiverem disponíveis na conta/versão instalada.

## Limites de execução

O fluxo de etapas é uma skill que o Codex segue por instrução; não é um executor determinístico equivalente ao `Workflow` JavaScript do Claude. Os subagentes Codex compartilham o ambiente, então implementação e validação isoladas precisam de worktrees Git explícitas. Os hooks de projeto exigem revisão e confiança pelo cliente Codex (`/hooks`) antes da primeira execução ou após alteração. Inicie o Codex na raiz do repositório para que os caminhos relativos dos hooks funcionem.

As skills foram copiadas para descoberta nativa pelo Codex. Algumas receitas ainda citam ferramentas ou skills externas do ambiente Claude (por exemplo, navegação no Chrome ou `impeccable`); use apenas as capacidades disponíveis no cliente Codex e registre itens inacessíveis como não verificados.

## Como validar

- `codex --version` — versão instalada no momento: `codex-cli 0.167.0`.
- `codex --cd . --strict-config exec --help` — carregou configuração do projeto sem erro de campos TOML desconhecidos.
- `codex --cd . debug prompt-input 'Use $entregar-mudanca-codex'` — confirmou que a skill nova foi descoberta no contexto do Codex.
- `node --check .codex/hooks/guard-bash.mjs`, `node --check .codex/hooks/guard-files.mjs`, `node --check .codex/hooks/session-start.mjs` e `node --check .codex/hooks/stop-lint.mjs` — verificar sintaxe dos hooks.
- `node -e "JSON.parse(require('fs').readFileSync('.codex/hooks.json'))"` — verificar sintaxe JSON.
- `npm run lint` — verifica se os arquivos existentes do projeto continuam consistentes; o hook executa este comando no encerramento quando detecta `.ts` ou `.tsx` alterado.

Estado: configuração local do repositório; ainda requer confiança nos hooks no cliente de cada usuário.
