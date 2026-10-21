import { test, expect, type Page } from "@playwright/test";

/** Cor computada de uma expressão CSS da paleta, para comparar sem fixar o hex do tema. */
async function cssColor(page: Page, expression: string) {
  return page.evaluate((value) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, expression);
}

async function workspace(page: Page, longEnvironment = false) {
  const home = {
    id: "home",
    name: "Nossa casa nova",
    ownerId: "owner",
    role: "owner",
    discountCents: 0,
    moveDate: null,
    state: "BA",
    city: null,
    spendingTier: "equilibrado",
  };
  const categories = [
    { id: "bath", name: "Banheiro", sortOrder: 0 },
    { id: "bedroom", name: "Quarto", sortOrder: 1 },
  ];
  if (longEnvironment)
    categories.push({
      id: "long-room",
      name: "Quarto das visitas e escritório compartilhado",
      sortOrder: 2,
    });
  const user = {
    id: "owner",
    name: "Ana",
    email: "ana@example.invalid",
    plan: "monthly",
    isGuest: false,
    onboardingCompleted: true,
  };
  let item = {
    id: "towels",
    name: "Toalhas de banho de algodão para toda a família",
    categoryId: "bath",
    category: "Banheiro",
    checked: false,
    status: "researching",
    link: "",
    description: "Jogo de toalhas",
    priceCents: 20000,
    quantity: 4,
    discountCents: 0,
    sortOrder: 0,
    buyWeek: null,
    priceCategory: null,
    priority: null,
    timing: null,
    createdAt: "2026-10-18T12:00:00Z",
    updatedAt: "2026-10-18T12:00:00Z",
  };
  const state = { fail: false, updates: 0, errors: [] as string[] };
  page.on("pageerror", (error) => state.errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/bootstrap")
      return route.fulfill({
        json: {
          user,
          enxovais: [home],
          activeEnxoval: home,
          members: [],
          categories,
          items: [
            item,
            {
              ...item,
              id: "owned",
              name: "Tapete",
              status: "owned",
              checked: true,
            },
          ],
        },
      });
    if (path === "/api/categories/order")
      return route.fulfill({ json: categories });
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
    if (path === "/api/items/towels") {
      state.updates++;
      if (state.fail)
        return route.fulfill({
          status: 500,
          json: { error: "Não foi possível salvar." },
        });
      const updates = route.request().postDataJSON();
      const status =
        updates.status ??
        (updates.checked === false
          ? "researching"
          : updates.checked === true
            ? "bought"
            : item.status);
      item = {
        ...item,
        ...updates,
        status,
        checked: ["bought", "received", "owned"].includes(status),
      };
      return route.fulfill({ json: item });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/app");
  await page.locator(".workspace-app").waitFor();
  const mobile = page.viewportSize()!.width < 1024;
  await page
    .locator(mobile ? ".mobile-bottom-nav" : ".workspace-sidebar")
    .getByRole("button", { name: /^Meu enxoval/ })
    .click();
  return state;
}

for (const width of [
  320, 360, 375, 390, 414, 430, 540, 767, 768, 1023, 1024, 1440, 1920,
]) {
  test.describe(`${width}px workspace interactions`, () => {
    test.use({
      viewport: { width, height: width <= 375 ? 667 : 900 },
      hasTouch: width < 1024,
      reducedMotion: "no-preference",
    });
    test("pencil drawing, footer, environment feedback and attached drag handle", async ({
      page,
    }) => {
      const state = await workspace(page);
      const row = page.locator('[data-item-id="towels"]');
      await expect(page.locator(".is-completing")).toHaveCount(0);
      const footer = row.locator(".item-footer .item-expand");
      const geometry = await row.evaluate((node) => {
        const row = node.getBoundingClientRect();
        const button = node
          .querySelector(".item-expand")!
          .getBoundingClientRect();
        const icon = node
          .querySelector(".item-expand svg")!
          .getBoundingClientRect();
        return {
          centered: Math.abs(
            icon.left + icon.width / 2 - (row.left + row.width / 2),
          ),
          edge: row.bottom - icon.bottom,
          target: button.height,
        };
      });
      expect(geometry.centered).toBeLessThan(1);
      expect(geometry.edge).toBeLessThanOrEqual(6);
      expect(geometry.target).toBe(24);
      await footer.click();
      await expect(row.getByRole("form")).toBeVisible();
      await expect(footer).toHaveAttribute("aria-expanded", "true");
      if (width === 375)
        await page.screenshot({
          path: "tmp/validation/item-edit-glass-375.png",
        });
      await footer.click();
      await expect(row.getByRole("form")).toHaveCount(0);
      if (width < 1024)
        await expect(row.locator(".item-name")).toHaveCSS("font-size", "16px");
      const infoPoint = await row.evaluate((node) => {
        const inner = node
          .querySelector(".item-row-inner")!
          .getBoundingClientRect();
        const meta = node.querySelector(".item-meta")!.getBoundingClientRect();
        return { x: meta.left - inner.left + 4, y: meta.top - inner.top + 4 };
      });
      await row.locator(".item-row-inner").click({ position: infoPoint });
      await expect(row.getByRole("form")).toBeVisible();
      await footer.click();
      const check = row.getByRole("checkbox");
      await check.click();
      const dialog = page.getByRole("dialog", {
        name: "Como você conseguiu?",
        exact: true,
      });
      await expect(row).not.toHaveClass(/is-completing/);
      await dialog.getByRole("radio", { name: /^Comprado/ }).click();
      await dialog.getByRole("button", { name: "Confirmar situação" }).click();
      await expect(row).toHaveClass(/is-completing/);
      await expect(row).toHaveCSS("animation-name", "item-confirmation");
      const chalk = row.locator(".item-chalk-stroke");
      await expect(chalk).toBeVisible();
      const coverage = await chalk.evaluate((node) => {
        const overlay = node.getBoundingClientRect();
        const row = node.parentElement!.getBoundingClientRect();
        return {
          width: overlay.width / row.width,
          height: overlay.height / row.height,
          events: getComputedStyle(node).pointerEvents,
        };
      });
      expect(coverage.width).toBeGreaterThan(0.94);
      expect(coverage.height).toBeGreaterThan(0.9);
      expect(coverage.events).toBe("none");
      if (width === 375) {
        await chalk.evaluate((node) => {
          node.getAnimations({ subtree: true }).forEach((animation) => {
            animation.pause();
            animation.currentTime = 350;
          });
        });
        await page.screenshot({
          path: "tmp/validation/item-chalk-active-375.png",
        });
      }
      const pencil = row.locator(".item-name-scribble");
      await expect(pencil).toBeVisible();
      await expect(pencil).toHaveCSS("stroke", await cssColor(page, "var(--cm-action)"));
      await expect(pencil).toHaveCSS("opacity", "0.45");
      await expect(pencil).toHaveCSS("stroke-width", "1.35px");
      await expect(pencil).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      const lineCount = await pencil.evaluate((node) => {
        const text = node.parentElement!.querySelector(".item-name-text")!;
        const range = document.createRange();
        range.selectNodeContents(text);
        return [...range.getClientRects()].filter(
          (rect) => rect.width > 1 && rect.height > 1,
        ).length;
      });
      await expect(pencil.locator("path")).toHaveCount(lineCount);
      const progress = await pencil
        .locator("path")
        .first()
        .evaluate((node) => {
          const animation = node.getAnimations()[0];
          animation.pause();
          animation.currentTime = 50;
          const start = Number(
            getComputedStyle(node).strokeDashoffset.replace("px", ""),
          );
          animation.currentTime = 650;
          const end = Number(
            getComputedStyle(node).strokeDashoffset.replace("px", ""),
          );
          animation.play();
          return {
            start,
            end,
            segments: node.getAttribute("d")!.split("L").length,
          };
        });
      expect(progress.start).toBeGreaterThan(progress.end);
      expect(progress.segments).toBeGreaterThan(5);
      await expect(row).not.toHaveClass(/is-completing/);
      await expect(row.locator(".item-chalk-stroke")).toHaveCount(0);
      await expect(pencil.locator("path").first()).toHaveCSS(
        "stroke-dashoffset",
        "0px",
      );
      await expect(row.locator(".item-name")).toHaveCSS(
        "text-decoration-line",
        "none",
      );
      if (width === 375) {
        await row.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await row.screenshot({
          path: "tmp/validation/pencil-completed-375.png",
        });
      }
      await check.click();
      await expect(check).toHaveAttribute("aria-checked", "false");
      await expect(row.locator(".item-name")).toHaveCSS(
        "text-decoration-line",
        "none",
      );

      await expect(row.locator(".item-name-scribble")).toHaveCount(0);
      const environments = page.locator(
        width < 1024
          ? ".environment-chips"
          : ".sidebar-rooms .environment-list",
      );
      const room = environments.locator(".environment-row").first();
      const select = room.locator(".environment-select");
      await expect(room).toHaveCSS("border-top-style", "solid");
      await expect(room).toHaveCSS(
        "background-color",
        await cssColor(
          page,
          width < 1024
            ? "color-mix(in oklab, var(--cm-sand) 33%, var(--cm-bg))"
            : "color-mix(in oklab, var(--cm-bg) 28%, #fff)",
        ),
      );
      if (width >= 1024) {
        await select.hover();
        await expect(room).toHaveCSS(
          "background-color",
          await cssColor(page, "color-mix(in oklab, var(--cm-bg) 98%, var(--cm-text))"),
        );
        await expect(select.locator("span")).not.toHaveCSS("transform", "none");
      }
      await page.evaluate(() => {
        document.addEventListener("animationstart", (event) => {
          if (
            (event as AnimationEvent).animationName === "environment-activate"
          )
            document.documentElement.setAttribute(
              "data-activation-observed",
              "true",
            );
        });
      });
      await select.click();
      await expect(page.locator("html")).toHaveAttribute(
        "data-activation-observed",
        "true",
      );
      await expect(select).toHaveAttribute("aria-current", "true");
      await expect(room).not.toHaveClass(/is-activating/);
      const handle = room.locator(".reorder-handle");
      await handle.scrollIntoViewIfNeeded();
      const bounds = (await handle.boundingBox())!;
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        bounds.x + bounds.width / 2 + (width < 1024 ? 14 : 0),
        bounds.y + bounds.height / 2 + (width < 1024 ? 0 : 14),
        { steps: 4 },
      );
      await expect(page.locator(".sortable-entry.is-dragging")).toHaveCount(1);
      const contained = await room.evaluate((node) => {
        const row = node.getBoundingClientRect();
        const icon = node
          .querySelector(".reorder-handle svg")!
          .getBoundingClientRect();
        return (
          icon.left >= row.left &&
          icon.right <= row.right &&
          icon.top >= row.top &&
          icon.bottom <= row.bottom
        );
      });
      expect(contained).toBe(true);
      await page.mouse.up();
      await expect(room.locator("..")).toHaveCSS("transform", "none");
      await expect(page.locator(".sortable-entry.is-dragging")).toHaveCount(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `tmp/validation/workspace-interactions-${width}.png`,
      });
      expect(state.errors).toEqual([]);
    });
  });
}

for (const width of [375, 1440]) {
  test(`reduced motion and unsuccessful completion at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 667 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const state = await workspace(page);
    const row = page.locator('[data-item-id="towels"]');
    await row.getByRole("checkbox").click();
    const dialog = page.getByRole("dialog", {
      name: "Como você conseguiu?",
      exact: true,
    });
    await dialog.getByRole("radio", { name: /^Recebido/ }).click();
    state.fail = true;
    await dialog.getByRole("button", { name: "Confirmar situação" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(row).not.toHaveClass(/checked|is-completing/);
    state.fail = false;
    await dialog.getByRole("button", { name: "Confirmar situação" }).click();
    await expect(row).toHaveClass(/checked/);
    await expect(row.locator(".item-name")).toHaveCSS("animation-name", "none");
    await expect(row.locator(".item-name-scribble")).toBeVisible();
    await expect(row.locator(".item-chalk-stroke")).not.toBeVisible();
    await expect(row.locator(".item-name-scribble path").first()).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(row.locator(".item-name-scribble path").first()).toHaveCSS(
      "stroke-dashoffset",
      "0px",
    );
    await expect(row.locator(".item-name")).toHaveCSS(
      "text-decoration-line",
      "none",
    );
    expect(state.errors).toEqual([]);
  });
}

test("mobile chips keep intrinsic widths, centered labels and reachable handles while resizing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 375, height: 667 });
  await workspace(page, true);
  for (const width of [
    320, 340, 360, 375, 390, 414, 430, 480, 540, 600, 640, 720, 767, 768, 820,
    912, 1023,
  ]) {
    await page.setViewportSize({ width, height: 667 });
    const scroller = page.locator(".environment-tabs-scroll");
    await expect(scroller).toBeVisible();
    await expect
      .poll(() =>
        scroller.evaluate((node) => {
          const pills = [
            ...node.querySelectorAll<HTMLElement>(".environment-row"),
          ];
          return pills.every((pill) => {
            const box = pill.getBoundingClientRect();
            const button = pill.querySelector<HTMLElement>(
              ".environment-select",
            )!;
            const handle = pill.querySelector<HTMLElement>(".reorder-handle");
            return (
              Math.abs(box.height - 46) < 1 &&
              button.clientHeight >= 44 &&
              button.scrollWidth <= button.clientWidth + 1 &&
              (!handle ||
                (handle.clientWidth >= 32 &&
                  handle.offsetLeft + handle.offsetWidth <=
                    pill.clientWidth + 1))
            );
          });
        }),
      )
      .toBe(true);
    const widths = await scroller
      .locator(".environment-row")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getBoundingClientRect().width),
      );
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
    expect(
      await scroller.locator(".environment-select").evaluateAll((nodes) =>
        nodes.every((node) => {
          const button = getComputedStyle(node);
          const label = getComputedStyle(node.querySelector("span")!);
          return (
            button.paddingLeft === button.paddingRight &&
            label.textAlign === "center"
          );
        }),
      ),
    ).toBe(true);
    const all = scroller.locator(".environment-all");
    const centered = await all.evaluate((node) => {
      const pill = node.getBoundingClientRect();
      const text = node.querySelector("span")!;
      const range = document.createRange();
      range.selectNodeContents(text);
      const label = range.getBoundingClientRect();
      return (
        Math.abs(label.left + label.width / 2 - pill.left - pill.width / 2) < 1
      );
    });
    expect(centered).toBe(true);
    await scroller
      .locator(".environment-row")
      .last()
      .getByRole("button")
      .first()
      .focus();
    await expect(
      scroller.locator(".environment-row").last().getByRole("button").first(),
    ).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

for (const reduced of [false, true]) {
  test(`mobile clipboard panels, summary cards and readable pencil; reduced motion=${reduced}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.emulateMedia({
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    await workspace(page);
    const toggle = page.locator(".stats-compact-toggle");
    await toggle.click();
    const insights = page.locator("#stats-mobile-details");
    await expect(insights).toHaveAttribute("aria-hidden", "false");
    await expect(insights.locator(".stats-insight").first()).toHaveCSS(
      "animation-name",
      reduced ? "none" : "stats-card-reveal",
    );
    await expect(insights.locator(".stats-insight").last()).toBeVisible();
    await expect
      .poll(() =>
        insights.evaluate((node) => {
          const clip = node
            .querySelector(".stats-insights-clip")!
            .getBoundingClientRect();
          return [...node.querySelectorAll(".stats-insight")].every((card) => {
            const bounds = card.getBoundingClientRect();
            return (
              bounds.top >= clip.top + 1 &&
              bounds.bottom <= clip.bottom - 1 &&
              bounds.left >= clip.left + 1 &&
              bounds.right <= clip.right - 1
            );
          });
        }),
      )
      .toBe(true);
    if (!reduced)
      await page.screenshot({
        path: "tmp/validation/stats-card-borders-375.png",
      });
    await toggle.click();
    await expect(insights).toHaveAttribute("inert", "");
    await expect(insights).toBeHidden();

    async function checkPanel(name: string) {
      const dialog = page.getByRole("dialog", { name, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS(
        "animation-name",
        reduced ? "none" : "clipboard-rise",
      );
      // Wait for the surface to reach its final position before checking viewport bounds.
      await expect
        .poll(() =>
          dialog.evaluate(
            (node) => new DOMMatrix(getComputedStyle(node).transform).m42,
          ),
        )
        .toBe(0);
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(668);
      return dialog;
    }
    await page
      .getByRole("button", { name: "Adicionar item ou ambiente" })
      .click();
    let dialog = await checkPanel("Adicionar");
    await dialog.getByRole("button", { name: /^Ambiente/ }).click();
    await checkPanel("Novo ambiente");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Editar nome do enxoval" }).click();
    await checkPanel("Editar enxoval");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    await checkPanel("Importar itens");
    await page.keyboard.press("Escape");
    const exportTrigger = page.getByRole("button", {
      name: "Exportar",
      exact: true,
    });
    await exportTrigger.click();
    dialog = await checkPanel("Exportar lista");
    if (!reduced)
      await dialog.screenshot({
        path: "tmp/validation/export-clipboard-375.png",
      });
    await dialog.getByRole("radio", { name: /Excel/ }).click();
    await expect(dialog.getByRole("radio", { name: /Excel/ })).toBeChecked();
    const download = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: /Baixar todos os ambientes/ })
      .click();
    expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
    await expect(dialog).toBeHidden();
    await expect(exportTrigger).toBeFocused();
    await page
      .locator(".mobile-bottom-nav")
      .getByRole("button", { name: /Visão geral/ })
      .click();
    await page
      .getByRole("button", { name: "Novo ambiente", exact: true })
      .click();
    await checkPanel("Novo ambiente");
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: `tmp/validation/clipboard-overview-${reduced}.png`,
    });
  });
}
