import { test, expect, type Page } from "@playwright/test";

/**
 * Comportamentos da crítica do /app: aviso com Desfazer ao riscar e ao desmarcar, próximo passo do Nino,
 * aviso de mudanças desde a última visita e erro de rede na voz da marca. Tudo com a API simulada.
 */
async function workspace(page: Page, options: { lastVisit?: number; offline?: boolean } = {}) {
  const home = {
    id: "home",
    name: "Apê da Ana e do Léo",
    ownerId: "owner",
    ownerName: "Ana",
    role: "owner",
    discountCents: 0,
    moveDate: null,
    state: "BA",
    city: null,
    spendingTier: "equilibrado",
  };
  const categories = [{ id: "kitchen", name: "Cozinha", sortOrder: 0 }];
  const base = {
    categoryId: "kitchen",
    category: "Cozinha",
    link: "",
    description: "",
    quantity: 1,
    discountCents: 0,
    buyWeek: null,
    priceCategory: null,
    priority: null,
    timing: null,
    createdAt: "2026-10-18T12:00:00Z",
    updatedAt: "2026-10-20T12:00:00Z",
  };
  let items = [
    { ...base, id: "pan", name: "Panela", status: "researching", checked: false, priceCents: 15000, sortOrder: 0 },
    { ...base, id: "cups", name: "Copos", status: "owned", checked: true, priceCents: null, sortOrder: 1 },
  ];
  const patches: Record<string, unknown>[] = [];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (options.offline && path.startsWith("/api/items/")) return route.abort("internetdisconnected");
    if (path === "/api/bootstrap")
      return route.fulfill({
        json: {
          user: { id: "owner", name: "Ana", email: "ana@example.invalid", plan: "monthly", isGuest: false, onboardingCompleted: true },
          enxovais: [home],
          activeEnxoval: home,
          members: [
            { id: "owner", name: "Ana", email: "ana@example.invalid", role: "owner" },
            { id: "leo", name: "Léo", email: "leo@example.invalid", role: "editor" },
          ],
          categories,
          items,
        },
      });
    if (path === "/api/billing/status")
      return route.fulfill({
        json: { available: true, plan: "monthly", status: "active", accessAllowed: true, isOwner: true, trialUsed: true, trialNotice: null },
      });
    const match = path.match(/^\/api\/items\/([^/]+)$/);
    if (match && route.request().method() === "PATCH") {
      const updates = route.request().postDataJSON();
      patches.push({ id: match[1], ...updates });
      items = items.map((item) => {
        if (item.id !== match[1]) return item;
        const status = updates.status ?? (updates.checked === false ? "researching" : updates.checked ? "bought" : item.status);
        return { ...item, ...updates, status, checked: ["bought", "received", "owned"].includes(status) };
      });
      return route.fulfill({ json: items.find((item) => item.id === match[1]) });
    }
    return route.fulfill({ json: {} });
  });
  if (options.lastVisit !== undefined)
    await page.addInitScript((time) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("casamia:ultima-visita:home", String(time));
    }, options.lastVisit);
  await page.goto("/app");
  await page.locator(".workspace-app").waitFor();
  const mobile = page.viewportSize()!.width < 1024;
  await page
    .locator(mobile ? ".mobile-bottom-nav" : ".workspace-sidebar")
    .getByRole("button", { name: /^Meu enxoval/ })
    .click();
  return { patches };
}

test.describe("barra lateral do desktop", () => {
  test.use({ viewport: { width: 1899, height: 896 } });

  test("ambientes ficam sob Meu enxoval, com progresso e ações no menu; o nome do enxoval é o seletor", async ({ page }) => {
    await workspace(page);
    const sidebar = page.locator(".workspace-sidebar");
    const kitchen = sidebar.locator(".sidebar-rooms .environment-row").first();
    await expect(kitchen.locator(".environment-count")).toHaveText("1/2");
    await expect(sidebar.getByRole("button", { name: /^Meu enxoval/ })).toContainText("1/2");
    // Sem lápis nem lixeira soltos: renomear e excluir moram no menu do ambiente.
    await expect(sidebar.getByRole("button", { name: /Excluir ambiente/ })).toHaveCount(0);
    await kitchen.hover();
    await kitchen.getByRole("button", { name: "Opções do ambiente Cozinha" }).click();
    await expect(page.getByRole("menuitem", { name: /Renomear ambiente/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Excluir ambiente/ })).toBeVisible();
    await page.keyboard.press("Escape");

    // O perfil fica no Menu da conta; o rodapé da barra é a ajuda.
    await expect(sidebar.getByRole("button", { name: "Abrir meu perfil" })).toHaveCount(0);
    await expect(sidebar.getByRole("button", { name: /Ajuda e sugestões/ })).toBeInViewport();

    const switcher = page.locator(".desktop-app-header").getByRole("button", { name: /Apê da Ana e do Léo/ });
    await switcher.click();
    await expect(page.getByRole("menuitem", { name: /Criar novo enxoval/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".desktop-app-header .member-avatars")).toHaveAttribute("aria-label", "Compartilhado com Léo");

    // Título e conteúdo começam na mesma coluna.
    const titleX = (await page.locator(".enxoval-switcher-name").boundingBox())!.x;
    const contentX = (await page.locator(".workspace-main > *").first().boundingBox())!.x;
    expect(Math.abs(titleX - contentX)).toBeLessThan(2);
  });
});

for (const width of [390, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 1024 });

    test("riscar e desmarcar mostram aviso com Desfazer que restaura a situação", async ({ page }) => {
      const { patches } = await workspace(page);
      const pan = page.locator('[data-item-id="pan"]');
      await pan.getByRole("checkbox").click();
      const dialog = page.getByRole("dialog", { name: "Como você conseguiu?", exact: true });
      await dialog.getByRole("radio", { name: /^Comprado/ }).click();
      await dialog.getByRole("button", { name: "Confirmar situação" }).click();
      const toast = page.locator(".undo-toast");
      await expect(toast).toContainText("Riscado da lista: Panela.");
      await toast.getByRole("button", { name: /Desfazer/ }).click();
      await expect(toast).toHaveCount(0);
      expect(patches.at(-1)).toMatchObject({ id: "pan", status: "researching" });
      await expect(pan.getByRole("checkbox")).toHaveAttribute("aria-checked", "false");

      const cups = page.locator('[data-item-id="cups"]');
      await cups.getByRole("checkbox").click();
      await expect(toast).toContainText("Copos voltou para a fila.");
      await toast.getByRole("button", { name: /Desfazer/ }).click();
      expect(patches.at(-1)).toMatchObject({ id: "cups", status: "owned" });
      await expect(cups.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
    });

    test("próximo passo do Nino abre o item da fila", async ({ page }) => {
      await workspace(page);
      const card = page.locator(".next-step-card");
      await expect(card).toContainText("Próximo passo: Panela");
      await card.click();
      await expect(page.locator('[data-item-id="pan"] .item-title-button')).toHaveAttribute("aria-expanded", "true");
      // A lixeira mora dentro do item aberto, com o nome da ação.
      await expect(page.locator('[data-item-id="pan"]').getByRole("button", { name: "Tirar da lista" })).toBeVisible();
    });

    test("aviso de mudanças desde a última visita leva a Últimas alterações", async ({ page }) => {
      await workspace(page, { lastVisit: Date.parse("2026-10-19T12:00:00Z") });
      const toast = page.locator(".undo-toast");
      await expect(toast).toContainText("2 itens mudaram desde a sua última visita.");
      await toast.getByRole("button", { name: "Ver", exact: true }).click();
      await expect(page.locator(".list-section-heading h2")).toHaveText("Últimas alterações");
    });

    test("sem conexão, o erro fala a língua da marca", async ({ page }) => {
      await workspace(page, { offline: true });
      await page.locator('[data-item-id="pan"]').getByRole("checkbox").click();
      const dialog = page.getByRole("dialog", { name: "Como você conseguiu?", exact: true });
      await dialog.getByRole("radio", { name: /^Comprado/ }).click();
      await dialog.getByRole("button", { name: "Confirmar situação" }).click();
      await expect(page.getByText(/Ops, tropeçamos aqui: parece que a conexão caiu/).first()).toBeVisible();
      await expect(page.getByText("Failed to fetch")).toHaveCount(0);
    });
  });
}
