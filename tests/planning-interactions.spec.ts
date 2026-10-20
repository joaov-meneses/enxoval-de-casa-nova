import { test, expect, type Page, type Locator } from "@playwright/test";

async function planning(page: Page) {
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
    { id: "bath", name: "Banheiro", sortOrder: 1 },
  ];
  let items = [
    {
      id: "bed",
      name: "Cama",
      categoryId: "bedroom",
      category: "Quarto",
      buyWeek: -1,
    },
    {
      id: "towel",
      name: "Toalhas de banho",
      categoryId: "bath",
      category: "Banheiro",
      buyWeek: -1,
    },
  ].map((item) => ({
    ...item,
    checked: false,
    status: "needed",
    link: "",
    description: "",
    priceCents: null,
    quantity: 1,
    discountCents: 0,
    sortOrder: 0,
    priceCategory: null,
    priority: null,
    timing: null,
    updatedAt: "2026-10-19T12:00:00Z",
  }));
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
    if (path.startsWith("/api/items/")) {
      const id = path.split("/").at(-1);
      items = items.map((item) =>
        item.id === id ? { ...item, ...route.request().postDataJSON() } : item,
      );
      return route.fulfill({ json: items.find((item) => item.id === id) });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/app");
  await page
    .locator(
      page.viewportSize()!.width < 1024
        ? ".mobile-bottom-nav"
        : ".workspace-sidebar",
    )
    .getByRole("button", { name: /Planejamento/ })
    .click();
  await expect(page.locator(".pp")).toBeVisible();
}

async function checkHeightAnimation(
  content: Locator,
  direction: "open" | "close",
  reduced: boolean,
) {
  await expect(content).toHaveAttribute(
    "data-state",
    direction === "open" ? "open" : "closed",
  );
  if (reduced) return;
  await expect(content).toHaveCSS(
    "animation-name",
    direction === "open" ? "pp-content-open" : "pp-content-close",
  );
  const progress = await content.evaluate((node, direction) => {
    const animation = node
      .getAnimations()
      .find(
        (animation) =>
          animation instanceof CSSAnimation &&
          animation.animationName === `pp-content-${direction}`,
      )!;
    animation.pause();
    animation.currentTime = 35;
    const early = node.getBoundingClientRect().height;
    animation.currentTime = direction === "open" ? 225 : 190;
    const late = node.getBoundingClientRect().height;
    animation.play();
    return { early, late };
  }, direction);
  if (direction === "open")
    expect(progress.late).toBeGreaterThan(progress.early);
  else expect(progress.early).toBeGreaterThan(progress.late);
}

for (const width of [320, 375, 768, 1440]) {
  for (const reduced of [false, true]) {
    test(`planning disclosures and grouped weeks at ${width}px; reduced motion=${reduced}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      await planning(page);
      const period = page.locator(".pp-period").filter({
        has: page.locator(".pp-period-name", { hasText: "Antes da mudança" }),
      });
      const trigger = period.locator(".pp-period-toggle");
      const body = period.locator(":scope > .pp-period-body");
      await expect(body).toBeHidden();
      await trigger.click();
      await checkHeightAnimation(body, "open", reduced);
      await expect(body).toBeVisible();
      expect(await trigger.getAttribute("aria-controls")).toBe(
        await body.getAttribute("id"),
      );
      const roomName = await period
        .locator(".pp-room-group")
        .last()
        .locator(".pp-room-name")
        .innerText();
      const room = period
        .locator(".pp-room-group")
        .filter({ has: page.locator(".pp-room-name", { hasText: roomName }) });
      const roomTrigger = room.locator(
        ":scope > [data-slot=collapsible-trigger]",
      );
      const roomContent = room.locator(
        ":scope > [data-slot=collapsible-content]",
      );
      await expect(roomTrigger).toHaveAttribute("aria-expanded", "false");
      await roomTrigger.click();
      await checkHeightAnimation(roomContent, "open", reduced);
      await expect(room.getByRole("combobox")).toBeVisible();
      await roomTrigger.click();
      await checkHeightAnimation(roomContent, "close", reduced);
      await expect(roomContent).toBeHidden();
      await roomTrigger.focus();
      await page.keyboard.press("Space");
      await expect(roomTrigger).toHaveAttribute("aria-expanded", "true");
      const week = room.getByRole("combobox");
      await week.click();
      const list = page.getByRole("listbox");
      await expect(list).toHaveClass(/casamia-select-grouped/);
      const labels = list.locator("[data-slot=select-label]");
      await expect(labels).toHaveCount(6);
      await expect(labels.first()).toHaveCSS(
        "background-color",
        "rgb(243, 228, 209)",
      );
      await expect(labels.first()).toHaveCSS("border-left-width", "3px");
      await expect(labels.first()).toHaveCSS("font-weight", "700");
      await expect(
        list.getByRole("option", { name: "1 semana antes", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("ArrowUp");
      await expect(
        list.getByRole("option", { name: "2 semanas antes", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(list).toBeHidden();
      await expect(week).toContainText("2 semanas antes");
      await expect(week).toBeFocused();
      if (width === 375 && !reduced) {
        await week.click();
        await expect(list).toHaveCSS("opacity", "1");
        await page.screenshot({
          path: "tmp/validation/planning-week-groups-375.png",
        });
        await page.keyboard.press("Escape");
      }
      await trigger.click();
      await checkHeightAnimation(body, "close", reduced);
      await expect(body).toBeHidden();
      const how = page.locator(".pp-how");
      const howTrigger = how.locator("[data-slot=collapsible-trigger]");
      const howBody = how.locator("[data-slot=collapsible-content]");
      await howTrigger.click();
      await checkHeightAnimation(howBody, "open", reduced);
      await expect(howBody).toBeVisible();
      await howTrigger.click();
      await checkHeightAnimation(howBody, "close", reduced);
      await expect(howBody).toBeHidden();
      await expect(howTrigger).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
  }
}
