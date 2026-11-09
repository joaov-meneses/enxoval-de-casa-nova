# Casa Mia — instruções para agentes

Instruções comuns a qualquer agente (Claude, Codex/GPT e outros). O que é exclusivo do Claude Code (modelos, subagentes, workflows, hooks) fica em `CLAUDE.md`.

App de enxoval de casa nova. React/Vite em `src/`, API e workers em `server/`, tipos em `shared/`, testes em `tests/` (`*.mjs` com node:test e `*.spec.ts` com Playwright), docs em `docs/` (português). Marca e produto: `DESIGN.md`, `PRODUCT.md`, `docs/branding-casa-mia.md`.

## Comandos

- `npm ci` na primeira vez em cada checkout ou worktree.
- `npm run lint` (é `tsc --noEmit`), `npm run build`.
- `npm run dev` (ou `dev:full` com banco), `npm run db:up` / `db:down`.
- CI em `.github/workflows/ci.yml`.

## Testes por área

| Área alterada | Comando |
| --- | --- |
| Nino (componente, poses) | `npm run test:nino`; Playwright: `npx playwright test tests/nino.spec.ts tests/nino-motion.spec.ts` |
| Planejamento e compras | `npm run test:purchase-plan`, `npm run test:room-suggestions`, `npm run test:planning-db` |
| Rotas do app | `npm run test:app-routes` |
| Analytics | `npm run test:analytics` |
| Lifecycle e e-mails | `npm run test:lifecycle` |
| Admin | `npm run test:admin-api` |
| IA do servidor | `npm run test:ai-db` |
| Senhas e login | `npm run test:password-policy`, `npm run test:password-reset-db` |
| Documentos e logs | `npm run test:logging`, `npm run documents:check` |

Consulte `.github/workflows/ci.yml` para selecionar os testes pertinentes; a tabela não é exaustiva. Procure também em `tests/` e `package.json`. Scripts `*-db` precisam de Postgres (`npm run db:up` antes, `db:down` depois se você subiu). Rode-os em série.

Relate cada comando com passou/falhou e a saída relevante dos que falharam. Distinga validações locais das pendentes no CI; não presuma que o CI passou. Não diga "verificado" sem ter rodado.

## Git

Fluxo `develop` → `homologacao` → `main`. Não faça push direto em `main`, push forçado, `reset --hard` nem `--no-verify`. Commits em português: `feat:`, `fix:`, `test:`, `docs:`. O stash é compartilhado entre worktrees: prefira um commit WIP.

## Documentação

Cada entrega é documentada em português em `docs/` (data, o que mudou, como validar, estado). Mudou interface: atualize `design/inventario/inventario.md`. O que foi entregue sai de `docs/implementacoes-futuras.md`.

## Não editar

`.env*` (edite `.env.example`), `package-lock.json` (use `npm install`), `dist/`, `node_modules/`, `design/inventario/capturas-brutas/`.

## Cuidados do domínio

Dados pessoais, documentos, pagamentos e notas fiscais pedem revisão de segurança. Respeite `prefers-reduced-motion`. Em mudanças de interface, verifique as telas afetadas em 320, 375 e 425 px e execute os testes Playwright existentes aplicáveis; relate limitações e verificações não executadas. Cores são `--cm-*` em `src/index.css`; tema Linho Terracota; fontes Fraunces + Nunito.

## Codex

O projeto mantém uma configuração própria para Codex em `.codex/` e skills em `.agents/skills/` (espelho das receitas portáveis de `.claude/skills/`). Para mudanças que toquem mais de um arquivo ou módulo, use `$entregar-mudanca-codex`: delegue exploração, planejamento, implementação e verificação conforme a skill. Mudanças simples e de baixo risco, inclusive em mais de um arquivo, podem ser feitas diretamente, com validação proporcional. Mudanças em autenticação, dados pessoais, pagamentos, banco ou fluxos de interface seguem o fluxo completo, com revisão e testes pertinentes. Subagentes compartilham o checkout; para escrita paralela, exija worktrees Git distintas e escopos sem sobreposição. Os perfis em `.codex/agents/` definem modelos e esforços. Hooks são proteções auxiliares, dependem do cliente e não cobrem todas as ferramentas ou comandos; cumpra estas regras mesmo quando não forem executados.
