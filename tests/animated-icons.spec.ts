import { test, expect } from "@playwright/test";
import { emptyAnswers } from "../src/onboarding/plan";

for (const reduced of [false, true]) {
  test(`Animate UI icons respond to the whole button; reduced motion=${reduced}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", route => route.fulfill({ status: 401, json: { error: "Sem sessão" } }));
    await page.goto("/");
    const cta = page.getByRole("link", { name: "Começar teste de 2 dias", exact: true }).first();
    const icon = cta.locator('[data-animate-icon="arrow-right"]');
    await expect(icon).toBeVisible();
    await expect(icon).toHaveAttribute("aria-hidden", "true");
    const animatedGroup = icon.locator("g").first();
    await expect(animatedGroup).toHaveCSS("transform", "none");
    // The CTA intentionally pulses, so move the pointer without waiting for geometric stability.
    const bounds = await cta.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + 8, bounds!.y + 8);
    if (reduced) {
      // Allow the full authored animation duration before checking the reduced-motion result.
      await page.waitForTimeout(450);
      await expect(animatedGroup).toHaveCSS("transform", "none");
    } else {
      await expect.poll(() => animatedGroup.evaluate(node => getComputedStyle(node).transform)).not.toBe("none");
      await page.screenshot({ path: "tmp/validation/animate-ui-hover.png" });
      await page.mouse.move(0, 0);
      await expect(animatedGroup).toHaveCSS("transform", "none");
    }
    expect(await page.locator("svg.lucide:not([data-animate-icon])").count()).toBe(0);
    expect(errors).toEqual([]);
  });
}

test("household and progress icons use Animate UI without changing the onboarding choices", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(answers => {
    localStorage.setItem("casamia.onboarding.v1", JSON.stringify({ v: 2, step: "owned", completed: false, answers }));
  }, { ...emptyAnswers, name: "Ana", moment: "solo", housing: "casa", state: "SP", people: 1, rooms: ["quarto", "banheiro"] });
  await page.route("**/api/**", route => route.fulfill({ json: { user: { id: "ana", name: "Ana", email: "ana@example.invalid", onboardingCompleted: false }, enxovais: [] } }));
  await page.goto("/comecar");
  await page.getByRole("button", { name: "Continuar de onde parei" }).click();
  await expect(page.locator('.ob-section')).toHaveAttribute("data-step", "owned");
  await expect(page.locator('svg[data-animate-icon^="owned-progress-"]')).toHaveCount(3);
  await page.getByRole("radio", { name: /Algumas coisas/ }).check();
  await expect(page.getByRole("radio", { name: /Algumas coisas/ })).toBeChecked();
  await expect(page.locator(".ob-cta")).toBeEnabled();
  expect(await page.locator("svg.lucide:not([data-animate-icon])").count()).toBe(0);
});
