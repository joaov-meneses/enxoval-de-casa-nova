import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { emptyAnswers } from "../src/onboarding/plan";

const session = {
  user: { id: "ana", name: "Ana", email: "ana@example.invalid", onboardingCompleted: false },
  enxovais: [],
};
const answers = {
  ...emptyAnswers, name: "Ana", moment: "casal", housing: "apartamento",
  people: 2, state: "SP", owned: "algumas", style: "min", budget: "unknown",
  moveDate: "2027-01-22", moveDateAnswered: true,
};

async function prepare(page: Page, step = "moment") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", (route) => route.fulfill({ json: session }));
  await page.addInitScript(({ step, answers }) => {
    if (sessionStorage.getItem("onboarding-quality-seeded")) return;
    localStorage.setItem("casamia.onboarding.v1", JSON.stringify({ v: 2, step, answers, completed: false }));
    sessionStorage.setItem("onboarding-quality-seeded", "true");
  }, { step, answers });
  await page.goto("/comecar");
  await page.getByRole("button", { name: "Continuar de onde parei" }).click();
  await expect(page.locator(".ob-section")).toHaveAttribute("data-step", step);
  await expect(page.locator(".ob-section")).toHaveCSS("opacity", "1");
  await page.evaluate(() => document.fonts.ready);
}

test("recarregar duas vezes nas boas-vindas preserva a etapa e as respostas", async ({ page }) => {
  await prepare(page, "housing");
  await page.getByLabel(/Studio ou kitnet/).check();
  await page.reload();
  await expect(page.getByRole("button", { name: "Continuar de onde parei" })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Continuar de onde parei" }).click();
  await expect(page.locator(".ob-section")).toHaveAttribute("data-step", "housing");
  await expect(page.getByLabel(/Studio ou kitnet/)).toBeChecked();
});

test("uma falha ao abrir permite tentar de novo sem sair do onboarding", async ({ page }) => {
  let available = false;
  await page.route("**/api/**", (route) => {
    return !available
      ? route.fulfill({ status: 503, json: { error: "Indisponível" } })
      : route.fulfill({ json: session });
  });
  await page.goto("/comecar");
  await expect(page.getByRole("heading", { name: "Ops, tropeçamos aqui" })).toBeVisible();
  await expect(page).toHaveURL(/\/comecar$/);
  available = true;
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.locator(".ob-welcome")).toBeVisible();
});

test("salvamento informa espera, bloqueia duplicação e recupera de erro com foco", async ({ page }) => {
  await prepare(page, "save");
  let requests = 0;
  let release: (() => void) | undefined;
  await page.route("**/api/onboarding/complete", async (route) => {
    requests += 1;
    await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ status: 503, json: { error: "Ops, tropeçamos aqui. Tente de novo." } });
  });
  await page.getByRole("button", { name: "Criar meu plano", exact: true }).click();
  await expect(page.getByRole("button", { name: "Salvando seu plano…" })).toBeDisabled();
  await page.locator(".ob-form").evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(requests).toBe(1);
  release!();
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByRole("alert")).toContainText("Suas respostas continuam aqui");
  await expect(page.getByRole("button", { name: "Criar meu plano", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("casamia.onboarding.v1")!).answers.name)).toBe("Ana");
  await page.getByRole("button", { name: "Criar meu plano", exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  release!();
  await expect(page.getByRole("alert")).toBeFocused();
});

test("teclado evidencia a escolha e o progresso explica o número da pergunta", async ({ page }) => {
  await prepare(page);
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Pergunta 2 de 12");
  const radio = page.getByRole("radio").first();
  await radio.focus();
  await page.keyboard.down("ArrowRight");
  await expect(page.getByRole("radio").nth(1)).toBeChecked();
  await page.keyboard.up("ArrowRight");
  const focus = await page.locator(".ob-option").nth(1).evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });
  expect(focus).toEqual({ width: "3px", style: "solid" });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "Pergunta 3 de 12");
});

test("a animação de boas-vindas termina e mantém o caminho de entrada disponível", async ({ page }) => {
  await page.route("**/api/**", (route) => route.fulfill({ json: session }));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/comecar");
  await expect(page.locator('.ob-preview-row[data-checked="true"]')).toHaveCount(3);
  await expect(page.locator(".ob-welcome .ob-mark")).toHaveCSS("transform", "none", { timeout: 6_000 });
  await page.getByRole("button", { name: "Vamos começar" }).click();
  await expect(page.getByRole("textbox", { name: "Como podemos te chamar?" })).toBeFocused();
});

for (const width of [390, 768, 1440]) {
  test(`acessibilidade e conteúdo sem corte no fluxo em ${width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height: 900 });
    await prepare(page, "name");
    const visited: string[] = [];
    for (let i = 0; i < 24; i += 1) {
      const section = page.locator(".ob-section");
      const step = (await section.getAttribute("data-step"))!;
      await expect(section).toHaveCSS("opacity", "1");
      if (step === "building") {
        await expect(section).toHaveAttribute("data-step", "ready", { timeout: 10_000 });
        continue;
      }
      visited.push(step);
      const result = await new AxeBuilder({ page }).include(".ob").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(result.violations, `${step}: ${JSON.stringify(result.violations.map((issue) => ({ id: issue.id, nodes: issue.nodes.map((node) => node.target) })))}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), step).toBe(true);
      if (["moment", "date", "style", "ready", "save"].includes(step)) {
        await page.screenshot({ path: `tmp/onboarding-quality-${step}-${width}.png`, fullPage: true });
      }
      if (step === "save") break;
      await page.locator(".ob-footer .ob-cta").click();
      await expect(section).not.toHaveAttribute("data-step", step);
    }
    expect(visited).toContain("ready");
    expect(visited.at(-1)).toBe("save");
  });
}
