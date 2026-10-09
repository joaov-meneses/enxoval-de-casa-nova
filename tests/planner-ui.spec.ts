import { expect, test, type Page, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";

async function dragBetween(page: Page, handle: Locator, destination: Locator) {
  await handle.scrollIntoViewIfNeeded();
  const from = await handle.boundingBox(),
    to = await destination.boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + from!.width / 2, to!.y + to!.height * 0.8, {
    steps: 18,
  });
  await page.mouse.up();
}
async function touchDrag(
  page: Page,
  handle: Locator,
  destination: Locator,
  axis: "x" | "y",
) {
  await handle.scrollIntoViewIfNeeded();
  const source = await handle.boundingBox(),
    target = await destination.boundingBox();
  const session = await page.context().newCDPSession(page);
  const point = {
    x: Math.round(source!.x + source!.width / 2),
    y: Math.round(source!.y + source!.height / 2),
  };
  const end =
    target![axis] + (axis === "x" ? target!.width : target!.height) * 0.7;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  for (let i = 1; i <= 15; i++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          ...point,
          [axis]: Math.round(point[axis] + ((end - point[axis]) * i) / 15),
        },
      ],
    });
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await session.detach();
}
for (const width of [320, 390, 768, 1024, 1440]) {
  test(`direct planner editing, dropdowns and CSV at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    await page.goto("/demo");
    await expect(page.locator("select")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Organizar ambientes", exact: true }),
    ).toHaveCount(0);
    if (width < 1024) {
      await page.getByRole("button", { name: "Abrir menu do enxoval" }).click();
      const menu = page.getByRole("dialog", { name: "Menu do enxoval" });
      await expect(
        menu.getByRole("button", { name: "Atualizar enxoval" }),
      ).toHaveCount(0);
      await expect(
        menu.getByRole("combobox", { name: "Seus enxovais" }),
      ).toBeVisible();
      const handle = menu.getByRole("button", {
        name: "Reordenar Quarto",
        exact: true,
      });
      await handle.focus();
      await handle.press("ArrowUp");
      await expect(menu.locator(".environment-select").first()).toContainText(
        "Quarto",
      );
      await expect(handle).toBeEnabled();
      await menu
        .getByRole("button", { name: "Fechar menu do enxoval" })
        .click();
    } else {
      // Desktop não tem menu suspenso.
      await expect(
        page.getByRole("button", { name: "Abrir menu do enxoval" }),
      ).toHaveCount(0);
    }
    if (width >= 1024) {
      const handle = page
        .locator(".sidebar-rooms")
        .getByRole("button", { name: "Reordenar Quarto", exact: true });
      await handle.focus();
      await handle.press("ArrowUp");
      await expect(
        page.locator(".sidebar-rooms .environment-select").first(),
      ).toContainText("Quarto");
      await expect(handle).toBeEnabled();
    }
    await page.reload();
    const environmentList = page.locator(
      width >= 1024 ? ".sidebar-rooms" : ".environment-chips",
    );
    await expect(
      environmentList.locator(".environment-select").first(),
    ).toContainText("Quarto");
    // Reload chooses the first environment; switch to Cozinha before editing.
    await environmentList
      .locator(".environment-select")
      .filter({ hasText: "Cozinha" })
      .click();
    await page
      .locator(".list-section-heading")
      .getByRole("button", { name: "Editar ambiente Cozinha", exact: true })
      .click();
    const rename = page.getByRole("dialog", {
      name: "Editar ambiente",
      exact: true,
    });
    await rename.getByLabel("Nome do ambiente").fill("Cozinha planejada");
    await rename.getByRole("button", { name: "Salvar ambiente" }).click();
    await expect(
      page.getByRole("heading", { name: "Cozinha planejada", exact: true }),
    ).toBeVisible();
    const row = page
      .locator(".item-row")
      .filter({ hasText: "Jogo de pratos de cerâmica" });
    await row
      .getByRole("button", { name: "Jogo de pratos de cerâmica", exact: true })
      .click();
    await expect(row.getByRole("form")).toBeVisible();
    await row
      .getByRole("button", {
        name: "Fechar detalhes de Jogo de pratos de cerâmica",
      })
      .click();
    await row
      .getByRole("button", {
        name: "Abrir detalhes de Jogo de pratos de cerâmica",
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const form = row.getByRole("form");
    await form.getByLabel("Nome do item").fill("=Kit de pratos personalizado");
    await form.getByLabel("Preço", { exact: true }).fill("19990");
    await form.getByLabel("Observações").fill("Cerâmica clara, seis peças.");
    const combo = form.getByRole("combobox", { name: "Ambiente", exact: true });
    await combo.click();
    await expect(form.getByRole("listbox")).toBeVisible();
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.screenshot({
      path: `tmp/validation/planner-inline-${width}.png`,
      fullPage: true,
    });
    await combo.press("Escape");
    await expect(form.getByRole("listbox")).toHaveCount(0);
    await combo.click();
    await form.getByRole("option", { name: "Quarto", exact: true }).click();
    await expect(form.getByRole("listbox")).toHaveCount(0);
    await expect(combo).toContainText("Quarto");
    await combo.click();
    await form
      .getByRole("option", { name: "Cozinha planejada", exact: true })
      .click();
    await expect(form.getByRole("listbox")).toHaveCount(0);
    await expect(combo).toContainText("Cozinha planejada");
    await form.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(row.getByRole("form")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Abrir detalhes de =Kit de pratos personalizado",
      }),
    ).toBeFocused();
    await expect(
      page.getByText("Adicionado em 20/09/2026").first(),
    ).toBeVisible();
    await page.reload();
    await environmentList
      .locator(".environment-select")
      .filter({ hasText: "Cozinha planejada" })
      .click();
    const edited = page
      .locator(".item-row")
      .filter({ hasText: "=Kit de pratos personalizado" });
    await expect(edited).toContainText("R$ 199,90");
    await expect(
      edited.getByRole("button", { name: /^Editar =Kit/ }),
    ).toHaveCount(0);
    const downloadEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar", exact: true }).click();
    await page
      .getByRole("menuitem", { name: /Baixar Cozinha planejada/ })
      .click();
    const download = await downloadEvent;
    const csv = await fs.readFile((await download.path())!, "utf8");
    expect(csv).toContain('"\'=Kit de pratos personalizado"');
    expect(csv).toContain("Cozinha planejada");
    expect(csv).not.toContain("Sofá de linho");
    await page
      .getByRole("button", { name: "Visão geral", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Adicionar uma nova conquista" }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
test("mouse dragging items and rooms persists; filtering preserves manual order", async ({
  page,
}) => {
  await page.goto("/demo");
  // "Meu enxoval" mostra todos os itens; arrastar itens só vale dentro de um ambiente.
  await page
    .locator(".sidebar-rooms .environment-select")
    .filter({ hasText: "Cozinha" })
    .click();
  const rows = page.locator(".sortable-items .item-row");
  const originalNames = await rows.locator(".item-name").allTextContents();
  const firstHandle = page.locator(".sortable-items").getByRole("button", {
    name: `Reordenar ${originalNames[0]}`,
    exact: true,
  });
  await dragBetween(page, firstHandle, rows.nth(1));
  await expect(rows.nth(1).locator(".item-name")).toHaveText(originalNames[0]);
  await expect(firstHandle).toBeEnabled();
  await page.reload();
  await page
    .locator(".sidebar-rooms .environment-select")
    .filter({ hasText: "Cozinha" })
    .click();
  await expect(rows.nth(1).locator(".item-name")).toHaveText(originalNames[0]);
  const rooms = page.locator(".sidebar-rooms .environment-row");
  await dragBetween(
    page,
    rooms
      .first()
      .getByRole("button", { name: "Reordenar Cozinha", exact: true }),
    rooms.nth(1),
  );
  await expect(rooms.first().locator(".environment-select")).toContainText(
    "Quarto",
  );
  await expect(
    page
      .locator(".sidebar-rooms")
      .getByRole("button", { name: "Reordenar Cozinha", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(rooms.first().locator(".environment-select")).toContainText(
    "Quarto",
  );
  await rooms
    .locator(".environment-select")
    .filter({ hasText: "Cozinha" })
    .click();
  await page.getByRole("button", { name: "Abrir filtros" }).click();
  await page.getByRole("button", { name: "Nome A-Z", exact: true }).click();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.locator(".workspace-main .reorder-handle")).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir filtros" }).click();
  await page.getByRole("button", { name: "Minha ordem", exact: true }).click();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(rows.nth(1).locator(".item-name")).toHaveText(originalNames[0]);
});
test("dropdown keyboard selection and touch drag do not open dialogs or swipe rooms", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto("/demo");
  await page
    .getByRole("button", { name: "Adicionar item", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Novo item" });
  const combo = dialog.getByRole("combobox", { name: "Ambiente", exact: true });
  await combo.focus();
  await combo.press("ArrowDown");
  await combo.press("End");
  await combo.press("Enter");
  await expect(dialog.getByLabel("Nome do ambiente")).toBeVisible();
  await combo.click();
  await combo.press("Escape");
  await expect(dialog).toBeVisible();
  await combo.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir menu do enxoval" }).click();
  const menu = page.getByRole("dialog");
  await menu.evaluate(async (el) => {
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });
  const rooms = menu.locator(".environment-row");
  await touchDrag(
    page,
    rooms
      .first()
      .getByRole("button", { name: "Reordenar Cozinha", exact: true }),
    rooms.nth(1),
    "y",
  );
  await expect(rooms.first().locator(".environment-select")).toContainText(
    "Quarto",
  );
  await expect(
    menu.getByRole("button", { name: "Reordenar Cozinha", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await expect(
    page.locator(".environment-chips .environment-select").first(),
  ).toContainText("Quarto");
  const chips = page.locator(".environment-chips .environment-row");
  await touchDrag(
    page,
    chips
      .first()
      .getByRole("button", { name: "Reordenar Quarto", exact: true }),
    chips.nth(1),
    "x",
  );
  await expect(chips.first().locator(".environment-select")).toContainText(
    "Cozinha",
  );
  await expect(
    page
      .locator(".environment-chips")
      .getByRole("button", { name: "Reordenar Quarto", exact: true }),
  ).toBeEnabled();
  await chips.first().locator(".environment-select").click();
  const items = page.locator(".sortable-items .item-row");
  const firstName = await items.first().locator(".item-name").innerText();
  await touchDrag(
    page,
    items
      .first()
      .getByRole("button", { name: `Reordenar ${firstName}`, exact: true }),
    items.nth(1),
    "y",
  );
  await expect(items.nth(1).locator(".item-name")).toHaveText(firstName);
  await expect(
    page
      .locator(".sortable-items")
      .getByRole("button", { name: `Reordenar ${firstName}`, exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Cozinha", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(chips.first().locator(".environment-select")).toContainText(
    "Cozinha",
  );
  await chips.first().locator(".environment-select").click();
  await expect(items.nth(1).locator(".item-name")).toHaveText(firstName);
});

test("failed saves keep inline drafts and roll back manual ordering", async ({
  page,
}) => {
  await page.goto("/demo");
  const workspace = await page.evaluate(
    () => JSON.parse(localStorage.getItem("larume.demo.v1")!).workspaces[0],
  );
  await page.route("**/api/bootstrap", (route) =>
    route.fulfill({
      json: {
        user: { id: "test", name: "Pessoa teste", email: "teste@example.com" },
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
  await page.route("**/api/items/order", async (route) => {
    await pending;
    await route.fulfill({
      status: 409,
      json: { error: "A lista mudou. Atualize os itens antes de reordenar." },
    });
  });
  await page.route("**/api/items/*", (route) =>
    route.request().url().endsWith("/items/order")
      ? route.fallback()
      : route.fulfill({
          status: 500,
          json: { error: "Não foi possível salvar. Tente novamente." },
        }),
  );
  await page.goto("/app");
  await page.locator(".sidebar-rooms .environment-select").first().click();
  const rows = page.locator(".sortable-items .item-row");
  const name = await rows.first().locator(".item-name").innerText();
  const handle = page
    .locator(".sortable-items")
    .getByRole("button", { name: `Reordenar ${name}`, exact: true });
  await handle.focus();
  await handle.press("ArrowDown");
  await expect(handle).toBeDisabled();
  release();
  await expect(handle).toBeEnabled();
  await expect(rows.first().locator(".item-name")).toHaveText(name);
  await expect(page.locator(".workspace-main")).toContainText("A lista mudou.");
  await rows.first().getByRole("button", { name, exact: true }).click();
  const form = rows.first().getByRole("form");
  await form.getByLabel("Nome do item").fill("Nome preservado após erro");
  await form.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "Não foi possível salvar. Tente novamente.",
  );
  await expect(form.getByLabel("Nome do item")).toHaveValue(
    "Nome preservado após erro",
  );
  await expect(
    rows.first().getByRole("button", { name: `Fechar detalhes de ${name}` }),
  ).toHaveAttribute("aria-expanded", "true");
  await form.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(rows.first().getByRole("form")).toHaveCount(0);
  await expect(rows.first().locator(".item-name")).toHaveText(name);
});
