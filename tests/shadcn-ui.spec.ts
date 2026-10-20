import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function workspace(page: Page) {
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
  const user = {
    id: "owner",
    name: "Ana",
    email: "ana@example.invalid",
    plan: "monthly",
    isGuest: false,
    onboardingCompleted: true,
  };
  const categories = [
    { id: "bedroom", name: "Quarto", sortOrder: 0 },
    { id: "kitchen", name: "Cozinha", sortOrder: 1 },
  ];
  let items = [
    {
      id: "bed",
      name: "Cama",
      categoryId: "bedroom",
      category: "Quarto",
      checked: false,
      status: "needed",
      link: "",
      description: "",
      priceCents: null,
      quantity: 1,
      discountCents: 0,
      sortOrder: 0,
      buyWeek: null,
      priceCategory: null,
      priority: null,
      timing: null,
      updatedAt: "2026-10-19T12:00:00Z",
    },
  ];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/bootstrap")
      return route.fulfill({
        json: {
          user,
          enxovais: [home],
          activeEnxoval: home,
          categories,
          items,
          members: [],
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
    if (path === "/api/profile")
      return route.fulfill({
        json: { ...user, createdAt: "2026-10-19T12:00:00Z" },
      });
    if (path === "/api/items" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      const item = { ...items[0], ...body, id: "new-item" };
      items = [...items, item];
      return route.fulfill({
        status: 201,
        json: {
          item,
          category: categories.find((c) => c.id === body.categoryId),
        },
      });
    }
    if (path.includes("/catalog/search"))
      return route.fulfill({ json: { results: [] } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/app");
  await page.locator(".workspace-app").waitFor();
  await page
    .locator(
      page.viewportSize()!.width >= 1024
        ? ".workspace-sidebar"
        : ".mobile-bottom-nav",
    )
    .getByRole("button", { name: /^Meu enxoval/ })
    .click();
}

for (const width of [320, 1440]) {
  test(`shadcn item dialog, select portal and keyboard at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await workspace(page);
    if (width < 1024) {
      await page
        .getByRole("button", {
          name: "Adicionar item ou ambiente",
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: /^Item Um produto/ }).click();
    } else
      await page
        .getByRole("button", { name: "Adicionar item", exact: true })
        .click();
    const dialog = page.getByRole("dialog", { name: "Novo item", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    await dialog.getByLabel("Nome do produto").fill("Toalha");
    await dialog.getByRole("combobox", { name: "Ambiente" }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("option", { name: "Cozinha", exact: true }).click();
    await expect(
      dialog.getByRole("combobox", { name: "Ambiente" }),
    ).toContainText("Cozinha");
    await dialog.getByRole("combobox", { name: "Situação" }).click();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("combobox", { name: "Situação" }),
    ).toBeFocused();
    await page.screenshot({
      path: `tmp/validation/shadcn-item-${width}.png`,
      fullPage: false,
    });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await dialog.getByRole("button", { name: "Adicionar à lista" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-item-id="new-item"]')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("shadcn account menu opens profile tabs and restores keyboard focus", async ({
  page,
}) => {
  await workspace(page);
  const menu = page.getByRole("button", { name: "Menu da conta" });
  await menu.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: "Meu perfil" }).click();
  const dialog = page.getByRole("dialog", { name: "Meu perfil", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("tab").nth(1)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.screenshot({ path: "tmp/validation/shadcn-profile.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(menu).toBeFocused();
});

test("shadcn export menu keeps format selection open and downloads the list", async ({ page }) => {
  await workspace(page);
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /Excel/ }).click();
  await expect(page.getByRole("menuitemradio", { name: /Excel/ })).toBeChecked();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /Baixar todos os ambientes/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  await expect(page.getByRole("menu")).toBeHidden();
});

test("shadcn mobile sheet restores focus and opens the help dialog", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await workspace(page);
  const trigger = page.getByRole("button", { name: "Abrir menu do enxoval" });
  await trigger.click();
  const sheet = page.getByRole("dialog", { name: "Menu do enxoval" });
  await expect(sheet).toHaveAttribute("data-slot", "sheet-content");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await sheet.getByRole("button", { name: /Central de ajuda/ }).click();
  const help = page.getByRole("dialog", { name: "Central de ajuda" });
  await expect(help).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
});
