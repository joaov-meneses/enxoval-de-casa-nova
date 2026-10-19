import { test, expect, type Page } from "@playwright/test";
import { defaultRooms, emptyAnswers, generatePlan, toISODate, toPayload } from "../src/onboarding/plan";
import { journeyFor, updateJourney } from "../src/onboarding/journey";
import { parseOnboardingProfile } from "../server/onboarding-profile";
import { parseOnboardingPlan } from "../server/routes";
import type { Answers, Moment } from "../src/onboarding/types";

test("rever o perfil atualiza moradores e espaços dependentes", () => {
  const previous: Answers = { ...emptyAnswers, moment: "casal", people: 2, housing: "casa", rooms: ["quarto"], budget: "lt10" };
  const solo = updateJourney(previous, { moment: "solo" });
  expect(solo.people).toBe(1);
  expect(solo.rooms).toBeNull();
  expect(solo.budget).toBe("lt10");
  expect(updateJourney(previous, { moment: "amigos" }).people).toBe(3);
  expect(updateJourney(previous, { moment: "casal" }).rooms).toEqual(["quarto"]);
  expect(updateJourney(previous, { people: 4 }).rooms).toBeNull();
});

test("o prazo orienta as próximas etapas e é recalculado ao alterar a data", () => {
  const now = new Date(2026, 9, 18);
  const answers = { ...emptyAnswers, moment: "casal" as const, moveDate: "2026-10-20" };
  expect(journeyFor(answers, now).timing).toContain("mudança perto");
  expect(journeyFor({ ...answers, moveDate: "2027-08-20" }, now).timing).toContain("distribuir as compras");
  expect(journeyFor({ ...answers, moveDate: null }, now).timing).toContain("Sem data definida");
});

async function seed(page: Page, step: string, answers: Partial<Answers>) {
  await page.addInitScript(({ step, answers }) => {
    localStorage.setItem("casamia.onboarding.v1", JSON.stringify({ v: 2, step, answers, completed: false }));
  }, { step, answers: { ...emptyAnswers, name: "Ana", ...answers } });
  await page.route("**/api/**", (route) => route.fulfill({ json: { user: { id: "ana", name: "Ana", email: "ana@example.invalid", onboardingCompleted: false }, enxovais: [] } }));
  await page.goto("/comecar");
  await page.getByRole("button", { name: "Continuar de onde parei" }).click();
  await expect(page.locator(".ob-section")).toHaveAttribute("data-step", step);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator(".ob-section")).toHaveCSS("opacity", "1");
}

async function fits(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth <= innerWidth,
    vertical: document.documentElement.scrollHeight <= innerHeight + 1,
    cta: document.querySelector(".ob-cta")!.getBoundingClientRect().bottom <= innerHeight + 1,
  }))).toEqual({ horizontal: true, vertical: true, cta: true });
}

for (const moment of ["casal", "solo", "amigos", "troca"] as Moment[]) {
  test(`mobile: as perguntas acompanham o perfil ${moment}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed(page, "date", { moment });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(journeyFor({ ...emptyAnswers, moment }).date);
    await fits(page);
    await page.screenshot({ path: `tmp/onboarding-date-320-${moment}.png`, fullPage: true });
    await page.getByRole("button", { name: "Em 1 mês", exact: true }).click();
    await page.locator(".ob-cta").click();
    await expect(page.locator(".ob-section")).toHaveAttribute("data-step", "timeline");
    await fits(page);
    await page.locator(".ob-cta").click();
    await expect(page.locator(".ob-section")).toHaveAttribute("data-step", "state");
    await page.locator(".ob-cta").click();
    await expect(page.locator(".ob-section")).toHaveAttribute("data-step", "housing");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(journeyFor({ ...emptyAnswers, moment }).housing);
    await fits(page);
    await page.getByLabel(/Apartamento/).check();
    await page.locator(".ob-cta").click();
    await expect(page.locator(".ob-section")).toHaveAttribute("data-step", "people");
    await expect(page.getByRole("radio", { checked: true })).toHaveValue(moment === "solo" ? "1" : moment === "amigos" ? "3" : "2");
    await fits(page);
  });
}

for (const step of ["moment", "rooms", "owned", "style", "budget", "worries", "usage", "thanks"]) {
  test(`320 × 568: ${step} cabe sem rolagem`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed(page, step, { moment: "casal", people: 2, housing: "apartamento", owned: "algumas", moveDate: toISODate(new Date()) });
    await fits(page);
  });
}

test("ambientes sugeridos seguem a moradia e o número de moradores", () => {
  expect(defaultRooms("studio", 1)).not.toContain("quarto");
  expect(defaultRooms("studio", 4)).not.toContain("quartoExtra");
  expect(defaultRooms("apartamento", 2)).not.toContain("externa");
  expect(defaultRooms("casa", 2)).toContain("externa");
  expect(defaultRooms("apartamento", 3)).toContain("quartoExtra");
});

test("nenhum item preserva ambientes e preferências no perfil validado", () => {
  const answers: Answers = { ...emptyAnswers, moment: "casal", moveDateAnswered: true, housing: "apartamento", people: 2, rooms: ["quarto", "banheiro"], state: "SP", owned: "boa", style: "none", budget: "unknown", worries: ["budget", "forget"], usage: ["spend", "share"] };
  const plan = generatePlan(answers);
  expect(plan.stats.total).toBe(0);
  expect(toPayload(plan).categories).toEqual([{ name: "Quarto", items: [] }, { name: "Banheiro", items: [] }]);
  const profile = parseOnboardingProfile(answers);
  expect(profile.style).toBe("none");
  expect(profile.worries).toEqual(answers.worries);
  expect(profile.usage).toEqual(answers.usage);
  expect(() => parseOnboardingPlan(toPayload(plan))).toThrow("Plano sem itens");
  expect(parseOnboardingPlan(toPayload(plan), profile.style === "none")).toEqual(toPayload(plan));
  expect(() => parseOnboardingPlan(toPayload(generatePlan({ ...answers, style: "min" })), true)).toThrow("apenas os ambientes");
});

test("sem itens, segue ao salvamento sem prometer compras ou economias", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, "style", { moment: "casal", housing: "studio", people: 2, rooms: ["sala", "banheiro"], owned: "boa", moveDateAnswered: true, state: "SP" });
  await expect(page.getByRole("radio")).toHaveCount(3);
  await page.getByLabel(/^Nenhum item/).check();
  await fits(page);
  await page.locator(".ob-cta").click();
  await page.getByLabel("Ainda não sei", { exact: true }).check();
  await page.locator(".ob-cta").click();
  await page.getByLabel("Estourar o orçamento", { exact: true }).check();
  await page.locator(".ob-cta").click();
  await expect(page.locator(".ob-sub")).toContainText("cuidar do orçamento");
  await page.getByLabel("Controlar quanto eu gasto", { exact: true }).check();
  await page.locator(".ob-cta").click();
  await page.getByRole("button", { name: "Montar meu plano" }).click();
  await expect(page.getByRole("heading", { name: "Seu enxoval, do seu jeito" })).toBeVisible({ timeout: 10_000 });
  await page.locator(".ob-cta").click();
  await expect(page.locator(".ob-section")).toHaveAttribute("data-step", "save");
  let submitted: { profile: Answers; plan: ReturnType<typeof toPayload> } | undefined;
  await page.route("**/api/onboarding/complete", async (route) => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { completed: true } });
  });
  await page.route("**/app", (route) => route.fulfill({ contentType: "text/html", body: "<main>Plano salvo</main>" }));
  await page.getByRole("button", { name: "Criar meu plano", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(submitted!.profile.style).toBe("none");
  expect(submitted!.profile.worries).toEqual(["budget"]);
  expect(submitted!.profile.usage).toEqual(["spend"]);
  expect(submitted!.plan.categories.every((category) => category.items.length === 0)).toBe(true);
  expect(() => parseOnboardingProfile(submitted!.profile)).not.toThrow();
});

test("data exata é opcional e preservada ao voltar", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, "date", { moment: "solo" });
  await page.locator(".ob-date-picker summary").click();
  const today = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  await page.getByRole("button", { name: today, exact: true }).click();
  await page.locator(".ob-date-picker summary").click();
  await fits(page);
  await page.locator(".ob-cta").click();
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page.locator(".ob-date-summary strong")).toHaveText(today);
  await page.getByRole("button", { name: "Ainda não sei", exact: true }).click();
  await page.locator(".ob-cta").click();
  await expect(page.locator(".ob-section")).toHaveAttribute("data-step", "state");
});

for (const [width, height] of [[390, 691], [768, 1024], [1440, 900]]) {
  test(`data e momento se adaptam a ${width} × ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed(page, "moment", {});
    await fits(page);
    await page.getByLabel(/Vou morar com meu par/).check();
    await page.locator(".ob-cta").click();
    await expect(page.locator(".ob-section")).toHaveAttribute("data-step", "date");
    await expect(page.locator(".ob-section")).toHaveCSS("opacity", "1");
    await fits(page);
    await page.screenshot({ path: `tmp/onboarding-date-${width}.png`, fullPage: true });
  });
}

test("desktop: boas-vindas cabe no painel sem imagem lateral", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page, "moment", {});
  for (const step of ["greet", "name", "welcome"]) {
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    await expect(page.locator(".ob-section")).toHaveAttribute("data-step", step);
  }
  await fits(page);
  await page.screenshot({ path: "tmp/onboarding-desktop-welcome.png", fullPage: true });
});

for (const step of ["moment", "date", "rooms", "style", "worries", "usage"]) {
  test(`desktop 1920 × 1080: ${step} usa o painel central`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await seed(page, step, { moment: "casal", housing: "apartamento", people: 2, owned: "algumas" });
    await expect(page.locator("aside.ob-aside")).toHaveCount(0);
    await fits(page);
    const bounds = await page.locator(".ob-col").boundingBox();
    expect(Math.abs(bounds!.x + bounds!.width / 2 - 960)).toBeLessThan(2);
    await page.screenshot({ path: `tmp/onboarding-desktop-${step}.png`, fullPage: true });
  });
}
