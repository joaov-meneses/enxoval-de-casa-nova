import { test, expect, type Page } from "@playwright/test";

// Start: postman simulation run postman/simulations/app-routes.sim.yaml --port 4906 --no-history
const simulation =
  process.env.APP_ROUTES_SIMULATION_URL || "http://127.0.0.1:4906/app";

async function mockApi(page: Page, options: Record<string, unknown> = {}) {
  const session = crypto.randomUUID();
  const configure = async (config: Record<string, unknown>) => {
    const response = await fetch(`${simulation}/test/configure`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mock-session": session,
      },
      body: JSON.stringify(config),
    });
    expect(response.ok).toBe(true);
  };
  await configure(options);
  await page.addInitScript(() =>
    localStorage.setItem(
      "casamia:consent",
      JSON.stringify({
        analytics: false,
        marketing: false,
        version: "2026-10",
        decidedAt: new Date().toISOString(),
      }),
    ),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({
      url: `${simulation}${url.pathname}${url.search}`,
      headers: { "x-mock-session": session },
    });
    await route.fulfill({ response });
  });
  return { configure };
}

const sidebar = (page: Page) => page.locator(".workspace-sidebar");
const current = (page: Page, name: RegExp) =>
  expect(sidebar(page).getByRole("button", { name })).toHaveAttribute(
    "aria-current",
    "page",
  );

test('planning loads the list and overview modules only when needed', async ({ page }) => {
  await mockApi(page);
  const scripts: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'script') scripts.push(request.url()); });
  await page.goto('/app/home/plano');
  await expect(page.locator('.pp')).toBeVisible();
  expect(scripts.some(url => /ListRoute[-.]/.test(url))).toBe(false);
  expect(scripts.some(url => /OverviewRoute[-.]/.test(url))).toBe(false);
  await sidebar(page).getByRole('button', { name: /Meu enxoval/ }).click();
  await expect(page.locator('[data-item-id="bed"]')).toBeVisible();
  expect(scripts.some(url => /ListRoute[-.]/.test(url))).toBe(true);
});

test("navegar pelo app muda a URL e voltar/avançar refazem o caminho", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/app");
  await current(page, /Meu enxoval/);

  await sidebar(page)
    .getByRole("button", { name: /Meu Lar/ })
    .click();
  await expect(page).toHaveURL(/\/app\/home\/meu-lar$/);
  await expect(page).toHaveTitle(/^Meu Lar \|/);

  await sidebar(page)
    .getByRole("button", { name: /Planejamento/ })
    .click();
  await expect(page).toHaveURL(/\/app\/home\/plano$/);
  await expect(page.locator(".pp")).toBeVisible();

  await sidebar(page).locator(".sidebar-rooms").getByText("Banheiro").click();
  await expect(page).toHaveURL(/\/app\/home\/itens\/bath$/);
  await expect(page).toHaveTitle(/^Banheiro \|/);

  await page.goBack();
  await expect(page).toHaveURL(/\/app\/home\/plano$/);
  await expect(page.locator(".pp")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/app\/home\/meu-lar$/);
  await current(page, /Meu Lar/);

  await page.goForward();
  await expect(page).toHaveURL(/\/app\/home\/plano$/);
  await current(page, /Planejamento/);
});

test("recarregar e abrir link direto preservam a tela", async ({ page }) => {
  await mockApi(page);
  await page.goto("/app/plano");
  await expect(page.locator(".pp")).toBeVisible();
  await page.reload();
  await expect(page.locator(".pp")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/home\/plano$/);

  await page.goto("/app/itens/bedroom");
  await expect(page).toHaveTitle(/^Quarto \|/);
  await expect(page.getByText("Cama").first()).toBeVisible();
  await expect(page.getByText("Toalhas de banho")).toHaveCount(0);
});

test("ambiente ou caminho inexistente cai na tela inicial sem erro", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/app/itens/nao-existe");
  await expect(page).toHaveURL(/\/app\/home$/);
  await current(page, /Meu enxoval/);

  await page.goto("/app/qualquer-coisa");
  await expect(page).toHaveURL(/\/app\/home$/);
});

test("URL wins over storage and two tabs keep their own workspace on reload", async ({
  page,
  context,
}) => {
  await mockApi(page);
  await page.addInitScript(() =>
    localStorage.setItem("casamia.activeEnxoval", "other"),
  );
  await page.goto("/app/home/itens/bedroom");
  await expect(page.locator('[data-item-id="bed"]')).toBeVisible();
  const otherPage = await context.newPage();
  await mockApi(otherPage);
  await otherPage.goto("/app/other/itens/office");
  await expect(otherPage.locator('[data-item-id="desk"]')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/app\/home\/itens\/bedroom$/);
  await expect(page.locator('[data-item-id="bed"]')).toBeVisible();
  await otherPage.reload();
  await expect(otherPage).toHaveURL(/\/app\/other\/itens\/office$/);
  await expect(otherPage.locator('[data-item-id="desk"]')).toBeVisible();
  await otherPage.close();
});

async function switchWorkspace(page: Page, name: RegExp) {
  await page.locator(".enxoval-switcher-trigger").click();
  await page.getByRole("menuitem", { name }).click();
}

test("switching workspaces updates the URL; history restores both workspace and screen", async ({
  page,
}) => {
  await mockApi(page);
  await page.goto("/app/home/itens/bedroom");
  await expect(page.locator('[data-item-id="bed"]')).toBeVisible();
  await switchWorkspace(page, /Casa compartilhada/);
  await expect(page).toHaveURL(/\/app\/other$/);
  await expect(page.locator('[data-item-id="desk"]')).toBeVisible();
  await sidebar(page)
    .getByRole("button", { name: /Planejamento/ })
    .click();
  await expect(page).toHaveURL(/\/app\/other\/plano$/);
  await page.goBack();
  await expect(page.locator('[data-item-id="desk"]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/home\/itens\/bedroom$/);
  await expect(page.locator('[data-item-id="bed"]')).toBeVisible();
  await expect(page.locator('[data-item-id="desk"]')).toHaveCount(0);
  await page.goForward();
  await expect(page.locator('[data-item-id="desk"]')).toBeVisible();
});

test("revoked access and invalid rooms resolve to the accessible workspace", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/app/other/itens/office");
  await expect(page.locator('[data-item-id="desk"]')).toBeVisible();
  await api.configure({ homes: ["home"] });
  await page.reload();
  await expect(page).toHaveURL(/\/app\/home$/);
  await expect(page.locator('[data-item-id="desk"]')).toHaveCount(0);
  await expect(page.locator('[data-item-id="bed"]')).toBeVisible();
  await page.goto("/app/home/itens/office");
  await expect(page).toHaveURL(/\/app\/home$/);
});

test("a slow history response cannot overwrite newer navigation", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/app/home/itens/bedroom");
  await expect(page.locator('[data-item-id="bed"]')).toBeVisible();
  await switchWorkspace(page, /Casa compartilhada/);
  await expect(page.locator('[data-item-id="desk"]')).toBeVisible();
  await api.configure({ delayFor: "home" });
  await page.goBack();
  await page.goForward();
  await expect(page).toHaveURL(/\/app\/other$/);
  await page.waitForTimeout(1100);
  await expect(page.locator('[data-item-id="desk"]')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/other$/);
});

test("history network failure keeps the existing workspace and a consistent URL", async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto("/app/home");
  await expect(page.locator('[data-item-id="bed"]')).toBeVisible();
  await switchWorkspace(page, /Casa compartilhada/);
  await expect(page.locator('[data-item-id="desk"]')).toBeVisible();
  await api.configure({ failFor: "home" });
  await page.goBack();
  await expect(page.locator(".workspace-error")).toBeVisible();
  await expect(page).toHaveURL(/\/app\/other$/);
  await expect(page.locator('[data-item-id="desk"]')).toBeVisible();
});

test('session expiry during history navigation can sign back into the requested room', async ({ page }) => {
  const api = await mockApi(page);
  await page.goto('/app/home/itens/bedroom');
  await expect(page.locator('[data-item-id="bed"]')).toBeVisible();
  await switchWorkspace(page, /Casa compartilhada/);
  await expect(page.locator('[data-item-id="desk"]')).toBeVisible();
  await api.configure({ signedOut: true });
  await page.goBack();
  await page.getByLabel('Seu e-mail', { exact: true }).fill('ana@example.invalid');
  await page.getByLabel('Sua senha', { exact: true }).fill('fake-local-test-password');
  await page.getByRole('button', { name: 'Entrar no meu enxoval' }).click();
  await expect(page.locator('[data-item-id="bed"]')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/home\/itens\/bedroom$/);
  await sidebar(page).getByRole('button', { name: /Planejamento/ }).click();
  await expect(page).toHaveURL(/\/app\/home\/plano$/);
});

test("login from a direct link preserves the requested workspace and room", async ({
  page,
}) => {
  await mockApi(page, { signedOut: true });
  await page.goto("/app/other/itens/office");
  await page
    .getByLabel("Seu e-mail", { exact: true })
    .fill("ana@example.invalid");
  await page
    .getByLabel("Sua senha", { exact: true })
    .fill("fake-local-test-password");
  await page.getByRole("button", { name: "Entrar no meu enxoval" }).click();
  await expect(page.locator('[data-item-id="desk"]')).toBeVisible();
  await expect(page).toHaveURL(/\/app\/other\/itens\/office$/);
});
