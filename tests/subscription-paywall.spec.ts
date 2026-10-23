import { test, expect, type Page } from "@playwright/test";

const offers = [
  { id: "monthly", name: "Mensal", amount: 2990, currency: "brl", paymentMethods: ['card'] },
  { id: "pass", name: "Passe da Casa Nova", amount: 9900, currency: "brl", paymentMethods: ['card', 'pix'] },
];

async function openPaywall(page: Page, options: { trialUsed?: boolean; isOwner?: boolean; available?: boolean; offers?: typeof offers } = {}) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/bootstrap") return route.fulfill({ json: {
      user: { id: "owner", name: "Ana", email: "ana@example.invalid", plan: "free", onboardingCompleted: true, isGuest: false },
      enxovais: [], activeEnxoval: null, members: [], categories: [], items: [],
    } });
    if (path === "/api/billing/status") return route.fulfill({ json: {
      available: options.available ?? true, accessAllowed: false, isOwner: options.isOwner ?? true, trialUsed: options.trialUsed ?? false,
      plan: "free", status: null, trialEndsAt: null, trialNotice: null,
    } });
    if (path === "/api/billing/plans") return route.fulfill({ json: { offers: options.offers ?? offers } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/app");
  const decline = page.getByRole('button', { name: 'Recusar', exact: true });
  if (await decline.isVisible()) await decline.click();
  await expect(page.locator(".subscription-card")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const [width, height] of [[320, 568], [360, 640], [375, 667], [390, 844], [414, 896], [430, 932], [768, 1024], [1440, 900], [1920, 1080]]) {
  test(`paywall em ${width} × ${height}: Passe selecionado e ação visível`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openPaywall(page);
    await expect(page.getByRole("radio", { name: /Passe da Casa Nova/ })).toBeChecked();
    await expect(page.locator(".subscription-plan-option").first()).toContainText("Passe da Casa Nova");
    await expect(page.getByRole("button", { name: "Meu perfil e assinatura" })).toHaveCount(0);
    await expect(page.getByText(/Se o acesso terminar/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sair da conta" })).toBeVisible();
    await expect(page.locator(".subscription-plan-summary")).toContainText("Cobrança única agora");
    await expect(page.locator('.subscription-plan-note')).toContainText('Pix ou cartão');
    await expect(page.locator('.subscription-promise-art img')).toHaveAttribute('src', '/brand/nino-keys.png');
    await expect.poll(() => page.locator('.subscription-promise-art img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(page.locator(".subscription-plan-savings")).toHaveText("72% menos");
    await expect(page.locator(".subscription-plan-equivalent")).toContainText("R$ 8,25/mês");
    expect(await page.locator(".subscription-included").evaluate(element => element.parentElement?.previousElementSibling?.classList.contains("subscription-plan-options"))).toBe(true);
    const price = page.locator(".subscription-plan-monthly .subscription-plan-price");
    expect(await price.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element.firstChild!);
      const amount = range.getBoundingClientRect();
      const suffix = element.querySelector("small")!.getBoundingClientRect();
      return suffix.left >= amount.right - 1 && suffix.bottom <= amount.bottom + 3;
    })).toBe(true);
    const button = page.getByRole("button", { name: "Continuar com o Passe" });
    await expect.poll(() => button.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/paywall-${width}.png`, fullPage: true });
  });
}

test("checkout recebe o Passe por padrão e o Mensal quando escolhido", async ({ page }) => {
  await openPaywall(page);
  const chosen: string[] = [];
  await page.route("**/api/billing/checkout", async (route) => {
    chosen.push(route.request().postDataJSON().plan);
    await route.fulfill({ status: 503, json: { error: "Checkout indisponível para este teste." } });
  });
  await page.getByRole("button", { name: "Continuar com o Passe" }).click();
  await expect(page.getByRole("alert")).toHaveText("Checkout indisponível para este teste.");
  expect(chosen).toEqual(["pass"]);
  await page.getByRole("radio", { name: /Mensal/ }).check();
  await expect(page.locator(".subscription-plan-summary")).toContainText("R$ 29,90/mês automaticamente");
  await expect(page.locator(".subscription-plan-summary")).toContainText("Cancele no teste");
  await page.getByRole("button", { name: "Começar teste de 2 dias" }).click();
  await expect.poll(() => chosen).toEqual(["pass", "monthly"]);
});

test("mensal sem novo teste quando a pessoa já usou o período grátis", async ({ page }) => {
  await openPaywall(page, { trialUsed: true });
  await page.getByRole("radio", { name: /Mensal/ }).check();
  await expect(page.getByRole("button", { name: "Ativar plano Mensal" })).toBeVisible();
  await expect(page.locator(".subscription-plan-summary")).toContainText("agora, com renovação automática mensal");
  await expect(page.locator(".subscription-plan-selection")).not.toContainText("2 dias grátis");
});

test("no mobile, Mensal explica as 48 horas e mantém a ação visível", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPaywall(page);
  await page.getByRole("radio", { name: /Mensal/ }).check();
  const button = page.getByRole("button", { name: "Começar teste de 2 dias" });
  const rect = await button.boundingBox();
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(568);
  await page.getByText("Como funcionam os 2 dias grátis?", { exact: true }).click();
  await expect(page.locator(".subscription-trial-timeline")).toContainText("EM 24 HORAS");
  await expect(page.locator(".subscription-trial-timeline")).toContainText("APÓS 48 HORAS");
  await expect(page.locator(".subscription-trial-timeline")).toContainText("R$ 29,90/mês, com cobrança automática");
});

test("a economia acompanha os preços da API e compara a mesma moeda", async ({ page }) => {
  await openPaywall(page, { offers: [{ ...offers[0], amount: 3990 }, offers[1]] });
  await expect(page.locator(".subscription-plan-savings")).toHaveText("79% menos");
  await page.getByText("O que está incluído", { exact: true }).click();
  await expect(page.locator(".subscription-savings-explanation")).toContainText("R$ 478,80 no total");
});

test("o teste é explicado apenas no Mensal e o Passe informa que não há dias grátis", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPaywall(page);
  const trigger = page.getByRole("button", { name: "Como funcionam os 2 dias grátis?", exact: true });
  await expect(trigger).toHaveCount(0);
  await expect(page.locator(".subscription-plan-summary")).toContainText("sem teste grátis");
  await page.getByRole("radio", { name: /Mensal/ }).check();
  await expect(trigger).toBeInViewport();
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Como funcionam os 2 dias grátis?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("O teste começa ao confirmar o cartão");
  await expect(dialog).toContainText("O teste é exclusivo do Mensal");
  await expect(dialog).toContainText("sem teste grátis");
  const close = dialog.getByRole("button", { name: "Entendi", exact: true });
  await expect(close).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: "tmp/paywall-trial-explanation-320.png", fullPage: false });
  await close.click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("radio", { name: /Mensal/ })).toBeChecked();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("card e botão pulsam apenas com Passe selecionado e respeitam movimento reduzido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openPaywall(page);
  const card = page.locator(".subscription-plan-pass");
  const cta = page.locator(".subscription-plan-checkout > button");
  await expect(card).toHaveCSS("animation-name", "subscription-pass-pulse");
  await expect(cta).toHaveCSS("animation-name", "subscription-pass-cta-pulse");
  await page.getByRole("radio", { name: /Mensal/ }).check();
  await expect(card).toHaveCSS("animation-name", "none");
  await expect(cta).toHaveCSS("animation-name", "none");
  await page.getByRole("radio", { name: /Passe da Casa Nova/ }).check();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(card).toHaveCSS("animation-name", "none");
  await expect(cta).toHaveCSS("animation-name", "none");
});

test("oferta indisponível não é selecionada e preço vem da API", async ({ page }) => {
  await openPaywall(page, { offers: [{ ...offers[0], amount: 3990 }] });
  await expect(page.getByRole("radio", { name: /Mensal/ })).toBeChecked();
  await expect(page.locator(".subscription-plan-price")).toContainText("R$ 39,90");
  await expect(page.locator(".subscription-plan-summary")).toContainText("R$ 39,90/mês");
});

test("convidado bloqueado não recebe opção de compra", async ({ page }) => {
  await openPaywall(page, { isOwner: false });
  await expect(page.getByRole("heading", { name: "Este enxoval está com o acesso bloqueado" })).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
});
