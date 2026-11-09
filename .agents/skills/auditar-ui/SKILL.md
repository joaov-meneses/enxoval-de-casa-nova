---
name: auditar-ui
description: Receita de auditoria de interface do Casa Mia combinando as skills de design disponíveis (impeccable, design:*) e Playwright. Use ao criar, mudar ou revisar uma tela.
---

# Auditar uma tela

1. **Base:** leia `DESIGN.md`, `PRODUCT.md` e `docs/branding-casa-mia.md`. Cores são `--cm-*` em `src/index.css`; tema Linho Terracota; fontes Fraunces + Nunito.
2. **Crítica e polimento:** skill `impeccable` (critique, polish, audit).
3. **Acessibilidade:** skill `design:accessibility-review` (WCAG 2.1 AA: contraste, teclado, alvos de toque, leitor de tela).
4. **Hierarquia e consistência:** skill `design:design-critique`.
5. **Textos:** skill `design:ux-copy` para botões, erros e estados vazios.
6. **Captura e inventário:** skill `inventario-e-prototipo-telas`. Verifique em 320, 375 e 425 px.
7. **Teste:** Playwright (`npx playwright test tests/<tela>.spec.ts`). Respeite `prefers-reduced-motion`.

Para varrer várias telas, dispare um `revisor` por tela em paralelo (somente leitura) e junte os achados.
