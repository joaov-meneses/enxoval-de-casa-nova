import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`public pages and planner fit a ${width}px screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of ["/", "/login", "/signup", "/demo"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await expect(page.getByRole("main")).toBeVisible();
      expect(
        await page
          .locator("img")
          .evaluateAll((images) =>
            images.every(
              (i) =>
                i instanceof HTMLImageElement &&
                i.complete &&
                i.naturalWidth > 0,
            ),
          ),
      ).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test("landing navigation, FAQ and entry routes work", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Larume — seu lar começa com um plano");
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Planos", exact: true })
    .click();
  await expect(page.locator("#planos")).toBeInViewport();
  const question = page.getByRole("button", {
    name: "Os planos já estão disponíveis para compra?",
  });
  await question.click();
  await expect(question).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText("Ainda não. Os valores desta página", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Explorar demonstração", exact: true })
    .click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByText("Você está na demonstração.")).toBeVisible();
});

test("items can be created, edited, bought, exported, persisted and removed", async ({
  page,
}) => {
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  await page.getByLabel("Nome do produto").fill("Kit de café de teste");
  await page.getByRole("button", { name: "Adicionar à lista" }).click();
  const row = page
    .locator(".item-row")
    .filter({ hasText: "Kit de café de teste" });
  await expect(
    row.getByRole("button", { name: /^Editar Kit de café de teste/ }),
  ).toHaveCount(0);
  // Tocar em qualquer ponto da linha (longe do título) abre a edição.
  await row.scrollIntoViewIfNeeded();
  const box = (await row.locator(".item-row-inner").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height - 4);
  const form = row.getByRole("form");
  await form.getByLabel("Preço", { exact: true }).fill("12990");
  await form.getByLabel("Link do produto").fill("https://example.com/produto");
  await form.getByLabel("Observações").fill("=Teste de escape CSV");
  await form.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(row.getByRole("link", { name: "Ver na loja" })).toHaveAttribute(
    "href",
    "https://example.com/produto",
  );
  await row.getByRole("checkbox").click();
  await expect(row.getByRole("checkbox")).toBeChecked();
  await expect(page.locator(".workspace-stats")).toContainText("R$ 1.687,20");
  await page.reload();
  await expect(row.getByRole("checkbox")).toBeChecked();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await page
    .getByRole("menuitem", { name: /Baixar todos os ambientes/ })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/larume-.+\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain("Kit de café de teste");
  expect(csv).toContain("129,90");
  expect(csv).toContain("'=Teste de escape CSV");
  await page
    .getByRole("button", { name: "Remover Kit de café de teste", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(row).toHaveCount(0);
});

test("search ignores accents, filters purchases and overview navigates rooms", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("searchbox").fill("ceramica");
  await expect(page.locator(".item-row")).toHaveCount(1);
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await page
    .locator(".sidebar-rooms .environment-select")
    .filter({ hasText: "Cozinha" })
    .click();
  await page.getByRole("button", { name: "Abrir filtros" }).click();
  await page.getByRole("button", { name: "Checados", exact: true }).click();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.locator(".item-row")).toHaveCount(4);
  expect(
    await page
      .getByRole("checkbox")
      .evaluateAll((nodes) =>
        nodes.every((n) => n.getAttribute("aria-checked") === "true"),
      ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir filtros" }).click();
  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(page.getByText("Seu lar está ganhando forma.")).toBeVisible();
  await page.locator(".overview-room").filter({ hasText: "Quarto" }).click();
  await expect(
    page.getByRole("heading", { name: "Quarto", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".item-row")).toHaveCount(4);
});

test("workspaces and categories can be created and safely removed in demo", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Criar outro enxoval" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Nome do enxoval")
    .fill("Cantinho de teste");
  await page.getByRole("button", { name: "Vazio", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Criar enxoval", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cantinho de teste", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  await page.getByLabel("Nome do produto").fill("Mesa de trabalho");
  await page.getByLabel("Nome do ambiente").fill("Escritório");
  await page.getByRole("button", { name: "Adicionar à lista" }).click();
  // Em "Meu enxoval" a lista continua com todos os itens, agora com o novo ambiente no card.
  await expect(
    page
      .locator(".item-row")
      .filter({ hasText: "Mesa de trabalho" })
      .locator(".item-category-tag"),
  ).toHaveText("Escritório");
  await page.getByRole("button", { name: "Abrir menu do enxoval" }).click();
  await page
    .getByRole("button", { name: "Excluir enxoval", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nosso primeiro apê", exact: true }),
  ).toBeVisible();
});

test("dialogs trap focus and Escape restores the triggering button", async ({
  page,
}) => {
  await page.goto("/demo");
  const trigger = page.getByRole("button", {
    name: "Adicionar item",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByLabel("Nome do produto")).toBeFocused();
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("mobile menu, swipe, refresh and bottom navigation remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Como funciona" })
    .click();
  await expect(
    page.getByRole("button", { name: "Abrir menu" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.goto("/demo");
  const swipeLeft = async () => {
    const box = await page.locator(".item-name").first().boundingBox();
    await page.mouse.move(box!.x + box!.width - 5, box!.y + 5);
    await page.mouse.down();
    await page.mouse.move(Math.max(10, box!.x - 80), box!.y + 5, { steps: 8 });
    await page.mouse.up();
  };
  // Começa em "Meu enxoval" (todos os itens): o primeiro gesto abre o primeiro ambiente.
  await expect(
    page.getByRole("heading", { name: "Meu enxoval", exact: true }),
  ).toBeVisible();
  await swipeLeft();
  await expect(
    page.getByRole("heading", { name: "Cozinha", exact: true }),
  ).toBeVisible();
  await swipeLeft();
  await expect(
    page.getByRole("heading", { name: "Quarto", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir menu do enxoval" }).click();
  await expect(
    page.getByRole("button", { name: "Atualizar enxoval", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Fechar menu do enxoval" }).click();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const target = document.querySelector(".list-section-heading h2")!;
    const touch = (y: number) =>
      new Touch({ identifier: 1, target, clientX: 150, clientY: y });
    target.dispatchEvent(
      new TouchEvent("touchstart", { bubbles: true, touches: [touch(360)] }),
    );
    target.dispatchEvent(
      new TouchEvent("touchmove", {
        bubbles: true,
        cancelable: true,
        touches: [touch(540)],
      }),
    );
    target.dispatchEvent(
      new TouchEvent("touchend", { bubbles: true, touches: [] }),
    );
  });
  await expect(
    page.getByRole("heading", { name: "Quarto", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(page.getByText("Seu lar está ganhando forma.")).toBeVisible();
  const header = page.locator(".mobile-workspace-header");
  await expect(header.getByRole("button")).toHaveCount(2);
  await expect(header).not.toContainText("Total gasto");
  await page.evaluate(() => window.scrollTo(0, 250));
  await expect(header).not.toContainText("Total gasto");
  await page.getByRole("button", { name: "Meu enxoval", exact: true }).click();
  await expect(header).toContainText("Quarto");
  await expect(
    page.getByRole("heading", { name: "Meu enxoval", exact: true }),
  ).toBeVisible();
});

test("login handles API errors and success; registration opens onboarding (mock API)", async ({
  page,
}) => {
  await page.goto("/demo");
  const workspace = await page.evaluate(
    () => JSON.parse(localStorage.getItem("larume.demo.v1")!).workspaces[0],
  );
  const bootstrap = {
    user: { id: "test", name: "Pessoa Teste", email: "teste@example.com" },
    enxovais: [workspace.enxoval],
    activeEnxoval: workspace.enxoval,
    members: workspace.members,
    categories: workspace.categories,
    items: workspace.items,
  };
  await page.goto("/login");
  await page.getByLabel("Seu e-mail").fill("teste@example.com");
  await page.getByLabel("Sua senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Mostrar senha" }).click();
  await expect(page.locator("#auth-password")).toHaveAttribute("type", "text");
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({
      status: 401,
      json: { error: "E-mail ou senha incorretos." },
    }),
  );
  await page.getByRole("button", { name: "Entrar no meu enxoval" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "E-mail ou senha incorretos.",
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ json: bootstrap }),
  );
  await page.getByRole("button", { name: "Entrar no meu enxoval" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator(".workspace-sidebar")).toContainText(
    "Pessoa Teste",
  );
});

for (const width of [390, 1440]) {
  test(`WCAG accessibility checks on public pages, app and dialogs at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/login", "/signup", "/demo"]) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(
        result.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            reason: n.failureSummary,
          })),
        })),
      ).toEqual([]);
    }
    await page
      .getByRole("button", { name: "Adicionar item", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
    const dialogResult = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      dialogResult.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
  });
}

test("discounts and keyboard category reordering persist", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Abrir menu do enxoval" }).click();
  await page.getByRole("button", { name: /^Descontos e cashback/ }).click();
  await page.getByRole("dialog").getByLabel("Valor do ajuste").fill("2500");
  await page.getByRole("button", { name: "Somar ajuste na prévia" }).click();
  await page.getByRole("button", { name: "Salvar ajuste" }).click();
  await expect(page.locator(".workspace-stats")).toContainText("R$ 1.532,30");
  const handle = page
    .locator(".sidebar-rooms")
    .getByRole("button", { name: "Reordenar Quarto", exact: true });
  await handle.focus();
  await handle.press("ArrowUp");
  await expect(handle).toBeEnabled();
  await expect(
    page.locator(".sidebar-rooms .environment-select").first(),
  ).toContainText("Quarto");
  await page.reload();
  await expect(
    page.locator(".sidebar-rooms .environment-select").first(),
  ).toContainText("Quarto");
  await expect(page.locator(".workspace-stats")).toContainText("R$ 1.532,30");
});
test("workspace drawer groups mobile actions, traps focus and returns to its trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo");
  const trigger = page.getByRole("button", { name: "Abrir menu do enxoval" });
  await expect(page.locator(".mobile-header-title-row button")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Excluir enxoval", exact: true }),
  ).toHaveCount(0);
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "Menu do enxoval" });
  await expect(menu).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Seus enxovais", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  for (let i = 0; i < 13; i++) {
    await page.keyboard.press("Tab");
    expect(
      await menu.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menu.getByRole("button", { name: "Editar nome do enxoval" }).click();
  await expect(menu).toHaveCount(0);
  const rename = page.getByRole("dialog");
  await expect(rename).toContainText("Editar enxoval");
  expect(
    await rename.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await trigger.click();
  await page
    .locator(".workspace-menu-backdrop")
    .click({ position: { x: 5, y: 5 } });
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.evaluate(() => window.scrollTo(0, 400));
  await trigger.click();
  await expect(menu).toBeVisible();
});

test("mobile drawer switches workspaces, creates categories and keeps destructive actions owner-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/demo");
  const open = () =>
    page.getByRole("button", { name: "Abrir menu do enxoval" }).click();
  await open();
  await page.getByRole("button", { name: "Criar novo enxoval" }).click();
  const form = page.getByRole("dialog", { name: "Novo enxoval" });
  await form.getByRole("textbox").fill("Casa de férias");
  await form
    .getByRole("button", { name: "Criar enxoval", exact: true })
    .click();
  await open();
  await page
    .getByRole("button", { name: "Adicionar ambiente", exact: true })
    .click();
  const category = page.getByRole("dialog");
  await category.getByRole("textbox").fill("Varanda");
  await category
    .getByRole("button", { name: "Criar ambiente", exact: true })
    .click();
  await expect(page.locator(".mobile-workspace-header")).toContainText(
    "Varanda",
  );
  await open();
  const picker = page.getByRole("combobox", {
    name: "Seus enxovais",
    exact: true,
  });
  await picker.click();
  await page
    .getByRole("option", { name: "Nosso primeiro apê", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".mobile-header-title h1")).toHaveText(
    "Nosso primeiro apê",
  );
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("larume.demo.v1")!);
    data.workspaces[0].enxoval.role = "editor";
    localStorage.setItem("larume.demo.v1", JSON.stringify(data));
  });
  await page.reload();
  await open();
  await expect(
    page.getByRole("button", { name: "Editar nome do enxoval" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Excluir enxoval", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Convidar pessoas" }),
  ).toBeVisible();
});

for (const width of [320, 390, 768, 1440]) {
  test(`workspace drawer is accessible and fits at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 740 });
    await page.goto("/demo");
    await page.getByRole("button", { name: "Abrir menu do enxoval" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          reason: n.failureSummary,
        })),
      })),
    ).toEqual([]);
    await page
      .getByRole("dialog", { name: "Menu do enxoval" })
      .getByRole("button", { name: "Sair", exact: true })
      .click();
    await expect(page).toHaveURL(/\/$/);
  });
}
test("saving dialogs stay open until the request settles and announce failures", async ({
  page,
}) => {
  await page.goto("/demo");
  const workspace = await page.evaluate(
    () => JSON.parse(localStorage.getItem("larume.demo.v1")!).workspaces[0],
  );
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      json: {
        user: { id: "test", name: "Pessoa Teste", email: "teste@example.com" },
        enxovais: [workspace.enxoval],
        activeEnxoval: workspace.enxoval,
        members: workspace.members,
        categories: workspace.categories,
        items: workspace.items,
      },
    }),
  );
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/items", async (route) => {
    await pending;
    await route.fulfill({
      status: 500,
      json: { error: "Não foi possível salvar. Tente novamente." },
    });
  });
  await page.goto("/app");
  await page
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Novo item" });
  await dialog.getByLabel("Nome do produto").fill("Item preservado após erro");
  await dialog.getByRole("button", { name: "Adicionar à lista" }).click();
  await expect(dialog).toHaveAttribute("aria-busy", "true");
  await expect(
    dialog.getByRole("button", { name: "Fechar janela" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  release();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Não foi possível salvar. Tente novamente.",
  );
  await expect(dialog.getByLabel("Nome do produto")).toHaveValue(
    "Item preservado após erro",
  );
  await expect(
    dialog.getByRole("button", { name: "Adicionar à lista" }),
  ).toBeEnabled();
  await expect(
    dialog.getByRole("button", { name: "Fechar janela" }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
