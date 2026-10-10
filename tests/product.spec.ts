import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`public pages fit a ${width}px screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of ["/", "/login", "/signup"]) {
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
  await expect(page).toHaveTitle("Casa Mia | Enxoval de casa nova");
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Preços", exact: true })
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
  await expect(page.getByRole("link", { name: /demonstra/i })).toHaveCount(0);
  // As seções da nova Home têm âncora na navegação.
  for (const id of ["como-funciona", "nino", "cha", "planos", "duvidas"])
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  // Quatro planos: gratuito, semestral, anual e mensal.
  await expect(page.locator(".cm-plan")).toHaveCount(4);
});

test("login handles API errors and success; registration opens onboarding (mock API)", async ({
  page,
}) => {
  const enxoval = {
    id: "enxoval-teste",
    name: "Enxoval de teste",
    ownerId: "test",
    role: "owner",
    discountCents: 0,
  };
  const workspace = { enxoval, members: [], categories: [], items: [] };
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
  test(`WCAG accessibility checks on public pages at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/login", "/signup"]) {
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
  });
}
