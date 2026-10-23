import { expect, test, type Page } from "@playwright/test";

async function openList(page: Page, room = false) {
  const home = {
    id: "home",
    name: "Nossa casa",
    ownerId: "owner",
    role: "owner",
    discountCents: 0,
    moveDate: null,
    state: "BA",
    city: null,
    spendingTier: "equilibrado",
  };
  const categories = [
    { id: "bedroom", name: "Quarto", sortOrder: 0 },
    { id: "bath", name: "Banheiro", sortOrder: 1 },
  ];
  let items = ["Cama", "Colchão", "Tapete", "Toalhas"].map((name, index) => ({
    id: `item-${index}`,
    name,
    categoryId: index === 3 ? "bath" : "bedroom",
    category: index === 3 ? "Banheiro" : "Quarto",
    checked: index === 2,
    status: index === 2 ? "owned" : "researching",
    link: "",
    description: "",
    priceCents: null,
    quantity: 1,
    discountCents: 0,
    sortOrder: index,
    buyWeek: -4,
    priceCategory: null,
    priority: null,
    timing: null,
    createdAt: "2026-10-18T12:00:00Z",
    updatedAt: "2026-10-18T12:00:00Z",
  }));
  const state = { fail: false, errors: [] as string[] };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/bootstrap")
      return route.fulfill({
        json: {
          user: {
            id: "owner",
            name: "Ana",
            email: "ana@example.invalid",
            plan: "monthly",
            isGuest: false,
            onboardingCompleted: true,
          },
          enxovais: [home],
          activeEnxoval: home,
          members: [],
          categories,
          items,
        },
      });
    if (path === "/api/billing/status")
      return route.fulfill({
        json: {
          available: true,
          plan: "monthly",
          status: "active",
          accessAllowed: true,
          isOwner: true,
          trialUsed: true,
          trialNotice: null,
        },
      });
    if (path.startsWith("/api/items/")) {
      if (state.fail)
        return route.fulfill({
          status: 500,
          json: { error: "Não foi possível salvar." },
        });
      const id = path.split("/").pop();
      const updates = route.request().postDataJSON();
      items = items.map((item) => {
        if (item.id !== id) return item;
        const status =
          updates.status ??
          (updates.checked === false ? "researching" : item.status);
        return {
          ...item,
          ...updates,
          status,
          checked: ["bought", "received", "owned"].includes(status),
        };
      });
      return route.fulfill({ json: items.find((item) => item.id === id) });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/app");
  const nav = page.locator(
    page.viewportSize()!.width < 1024
      ? ".mobile-bottom-nav"
      : ".workspace-sidebar",
  );
  await nav.getByRole("button", { name: /^Meu enxoval/ }).click();
  if (room) {
    await page
      .locator(
        page.viewportSize()!.width < 1024
          ? ".environment-chips"
          : ".workspace-sidebar",
      )
      .getByRole("button", { name: /^Quarto/ })
      .click();
    await expect(
      page.getByRole("list", { name: "Itens de Quarto", exact: true }),
    ).toBeVisible();
  }
  await expect(page.locator(".item-row")).toHaveCount(room ? 3 : 4);
  const clockStart = new Date("2026-10-22T12:00:00Z");
  await page.clock.install({ time: clockStart });
  await page.clock.pauseAt(new Date(clockStart.getTime() + 1000));
  return state;
}

const rows = (page: Page) =>
  page
    .locator(".item-row")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.itemId),
    );
async function complete(page: Page, id: string, choice = "Comprado") {
  // Dispatch while the JS clock is paused; pointer stability waits use animation frames.
  await page
    .locator(`[data-item-id="${id}"]`)
    .getByRole("checkbox")
    .dispatchEvent("click");
  const dialog = page.getByRole("dialog", {
    name: "Como você conseguiu?",
    exact: true,
  });
  await expect(dialog).toBeAttached();
  await dialog
    .getByRole("radio", { name: new RegExp(`^${choice}`) })
    .dispatchEvent("click");
  const confirm = dialog.getByRole("button", { name: "Confirmar situação" });
  await expect(confirm).toBeEnabled();
  await confirm.dispatchEvent("click");
}

for (const width of [375, 1440]) {
  for (const room of [false, true]) {
    test(`${width}px ${room ? "ambiente" : "todos"}: aguarda 2,5s, anima a saída e acrescenta ao final`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const state = await openList(page, room);
      const before = room
        ? ["item-0", "item-1", "item-2"]
        : ["item-0", "item-1", "item-3", "item-2"];
      expect(await rows(page)).toEqual(before);
      await complete(page, "item-0");
      const row = page.locator('[data-item-id="item-0"]');
      await expect(row).toHaveClass(/checked/);
      await page.clock.runFor(2499);
      expect(await rows(page)).toEqual(before);
      await expect(row).not.toHaveClass(/is-completion-exiting/);
      await page.clock.runFor(1);
      await expect(row).toHaveClass(/is-completion-exiting/);
      await expect(row).toHaveCSS("animation-name", "item-completion-exit");
      await page.clock.runFor(280);
      await expect
        .poll(() => rows(page))
        .toEqual([...before.slice(1), "item-0"]);
      await expect(row).not.toHaveClass(/is-completion-exiting/);
      // A segunda conclusão vai depois da primeira, mesmo com vários itens já concluídos.
      await complete(page, "item-1", "Recebido");
      await expect(page.locator('[data-item-id="item-1"]')).toHaveClass(
        /checked/,
      );
      await page.clock.runFor(2780);
      await expect
        .poll(() => rows(page))
        .toEqual([...before.slice(2), "item-0", "item-1"]);
      expect(state.errors).toEqual([]);
    });
  }
}

test("desmarcar durante a espera ou a saída cancela a mudança; falhas não movem o item", async ({
  page,
}) => {
  const state = await openList(page, true);
  const original = ["item-0", "item-1", "item-2"];
  for (const delay of [1000, 2600]) {
    await complete(page, "item-0");
    await expect(page.locator('[data-item-id="item-0"]')).toHaveClass(
      /checked/,
    );
    await page.clock.runFor(delay);
    await page
      .getByRole("button", { name: "Desfazer", exact: true })
      .dispatchEvent("click");
    await expect(page.locator('[data-item-id="item-0"]')).not.toHaveClass(
      /checked/,
    );
    await page.clock.runFor(3000);
    expect(await rows(page)).toEqual(original);
  }
  state.fail = true;
  await complete(page, "item-0");
  await expect(
    page
      .getByRole("dialog")
      .getByText("Não foi possível salvar.", { exact: true }),
  ).toBeVisible();
  await page.clock.runFor(3000);
  expect(await rows(page)).toEqual(original);
  await expect(page.locator('[data-item-id="item-0"]')).not.toHaveClass(
    /checked|is-completion-exiting/,
  );
  expect(state.errors).toEqual([]);
});

test("movimento reduzido mantém a espera de 2,5s e dispensa a animação", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openList(page, true);
  await complete(page, "item-0", "Já tenho");
  await expect(page.locator('[data-item-id="item-0"]')).toHaveClass(/checked/);
  await page.clock.runFor(2499);
  expect(await rows(page)).toEqual(["item-0", "item-1", "item-2"]);
  await page.clock.runFor(1);
  await expect.poll(() => rows(page)).toEqual(["item-1", "item-2", "item-0"]);
  await expect(page.locator(".is-completion-exiting")).toHaveCount(0);
});
