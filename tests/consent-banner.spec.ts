import { test, expect, type Locator, type Page } from "@playwright/test";

/*
 * Aviso de cookies (ConsentBanner) fora do login. O aviso só existe em builds com VITE_POSTHOG_KEY ou VITE_GTM_ID:
 * os testes pulam sem ele, menos o último (build comum). Para rodar:
 * VITE_POSTHOG_KEY=phc_medicao_local npm run build && npx vite preview --port 3103 --strictPort
 */

const CONSENT_KEY = "casamia:consent";
const PHONES = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
] as const;

async function visit(page: Page, path: string, size: { width: number; height: number }, reducedMotion = false) {
  await page.setViewportSize(size);
  if (reducedMotion) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
  await page.route("**/api/bootstrap**", (route) => route.fulfill({ status: 401, json: { error: "Faça login." } }));
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("h1").first()).toBeVisible();
}

async function hasBanner(page: Page) {
  return (await page.locator(".consent-banner").count()) > 0;
}

/** Rola até o alvo ficar acima do aviso e diz se algo o cobre no ponto central. */
async function reachable(target: Locator) {
  return target.evaluate((el) => {
    const banner = document.querySelector(".consent-banner")!;
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const before = el.getBoundingClientRect();
    const top = banner.getBoundingClientRect().top;
    if (before.bottom > top - 4) window.scrollBy({ top: before.bottom - top + 8, behavior: "instant" });
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      onTarget: Boolean(hit && (el === hit || el.contains(hit))),
      covered: Boolean(hit?.closest(".consent-banner")),
      aboveBanner: rect.bottom <= banner.getBoundingClientRect().top,
    };
  });
}

async function expectReachable(target: Locator) {
  const r = await reachable(target);
  expect(r.covered).toBe(false);
  expect(r.onTarget).toBe(true);
  expect(r.aboveBanner).toBe(true);
}

async function stored(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), CONSENT_KEY);
}

for (const size of PHONES) {
  test(`landing em ${size.width}x${size.height}: CTAs e link de privacidade ficam alcançáveis`, async ({ page }) => {
    await visit(page, "/", size);
    test.skip(!(await hasBanner(page)), "build sem chave de análise");
    const cta = page.locator("a.cm-btn-primary.cm-btn-lg");
    await expectReachable(cta.first());
    await expectReachable(cta.last());
    await expectReachable(page.getByText("Preferências de privacidade").first());
  });

  test(`/app sem sessão em ${size.width}x${size.height}: ação principal alcançável`, async ({ page }) => {
    await visit(page, "/app", size);
    test.skip(!(await hasBanner(page)), "build sem chave de análise");
    await expectReachable(page.locator("form button[type=submit]").first());
  });
}

test("/login em 1366x768: botão de envio alcançável com o aviso aberto", async ({ page }) => {
  await visit(page, "/login", { width: 1366, height: 768 });
  test.skip(!(await hasBanner(page)), "build sem chave de análise");
  await expectReachable(page.locator("form button[type=submit]"));
});

test("Recusar e Aceitar tudo têm o mesmo peso", async ({ page }) => {
  await visit(page, "/login", PHONES[1]);
  test.skip(!(await hasBanner(page)), "build sem chave de análise");
  const info = await page.evaluate(() => {
    const pick = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        w: r.width, h: r.height, cls: el.className, bg: cs.backgroundColor, color: cs.color,
        border: cs.border, size: cs.fontSize, weight: cs.fontWeight,
      };
    };
    const buttons = [...document.querySelectorAll(".consent-button")];
    return { labels: buttons.map((b) => b.textContent?.trim()), all: buttons.map(pick) };
  });
  expect(info.labels).toEqual(["Recusar", "Personalizar", "Aceitar tudo"]);
  const [refuse, , accept] = info.all;
  expect(Math.abs(refuse.w - accept.w)).toBeLessThanOrEqual(1);
  expect(Math.abs(refuse.h - accept.h)).toBeLessThanOrEqual(1);
  for (const key of ["cls", "bg", "color", "border", "size", "weight"] as const) expect(refuse[key]).toBe(accept[key]);
  for (const b of info.all) expect(b.h).toBeGreaterThanOrEqual(44);
});

test("Recusar grava a escolha, libera o espaço e não volta ao recarregar", async ({ page }) => {
  await visit(page, "/login", PHONES[1]);
  test.skip(!(await hasBanner(page)), "build sem chave de análise");
  await expect(page.locator("html")).toHaveAttribute("data-consent-open", "");
  await page.getByRole("button", { name: "Recusar" }).click();
  const saved = await stored(page);
  expect(saved).toMatchObject({ analytics: false, marketing: false, version: "2026-10" });
  expect(new Date(saved.decidedAt).toISOString()).toBe(saved.decidedAt);
  await expect(page.locator(".consent-banner")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-consent-open", /.*/);
  expect(await page.evaluate(() => getComputedStyle(document.body).paddingBottom)).toBe("0px");
  await page.reload();
  await expect(page.locator("h1").first()).toBeVisible();
  await expect(page.locator(".consent-banner")).toHaveCount(0);
});

test("Aceitar tudo grava analytics e marketing", async ({ page }) => {
  await visit(page, "/login", PHONES[1]);
  test.skip(!(await hasBanner(page)), "build sem chave de análise");
  await page.getByRole("button", { name: "Aceitar tudo" }).click();
  expect(await stored(page)).toMatchObject({ analytics: true, marketing: true, version: "2026-10" });
});

test("Personalizar começa sem nada marcado e salva falso/falso", async ({ page }) => {
  await visit(page, "/login", PHONES[1]);
  test.skip(!(await hasBanner(page)), "build sem chave de análise");
  await page.getByRole("button", { name: "Personalizar" }).click();
  await expect(page.getByRole("checkbox", { name: /Essenciais/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Essenciais/ })).toBeDisabled();
  await expect(page.getByRole("checkbox", { name: /Análise de uso/ })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Anúncios/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Salvar escolhas" }).click();
  expect(await stored(page)).toMatchObject({ analytics: false, marketing: false, version: "2026-10" });
});

test("acessibilidade: região com nome, foco não roubado, Esc sem efeito, sem overlay", async ({ page }) => {
  await visit(page, "/login", PHONES[1]);
  test.skip(!(await hasBanner(page)), "build sem chave de análise");
  await expect(page.getByRole("region", { name: "Sua privacidade" })).toBeVisible();
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest(".consent-banner")))).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.locator(".consent-banner")).toBeVisible();
  expect(await stored(page)).toBeNull();
  await page.getByLabel("Seu e-mail").fill("pessoa@example.com");
  await expect(page.getByLabel("Seu e-mail")).toHaveValue("pessoa@example.com");
});

test("movimento reduzido: sem animação no aviso e sem transição nos botões", async ({ page }) => {
  await visit(page, "/login", PHONES[1], true);
  test.skip(!(await hasBanner(page)), "build sem chave de análise");
  const css = await page.evaluate(() => ({
    animation: getComputedStyle(document.querySelector(".consent-banner")!).animationName,
    transition: getComputedStyle(document.querySelector(".consent-button")!).transitionDuration,
  }));
  expect(css.animation).toBe("none");
  // A regra global de movimento reduzido usa 0.00001s, na prática sem transição.
  expect(parseFloat(css.transition)).toBeLessThanOrEqual(0.001);
});

test("build comum: sem aviso, sem reserva de espaço", async ({ page }) => {
  await visit(page, "/login", PHONES[1]);
  test.skip(await hasBanner(page), "build com chave de análise: o aviso aparece");
  await expect(page.locator("html")).not.toHaveAttribute("data-consent-open", /.*/);
  expect(await page.evaluate(() => getComputedStyle(document.body).paddingBottom)).toBe("0px");
});
