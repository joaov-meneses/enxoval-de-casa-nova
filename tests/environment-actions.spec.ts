import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";

const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440];

/** "Meu enxoval" abre com todos os itens; as ações de ambiente pedem um ambiente aberto. */
async function openFirstEnvironment(page: Page, width: number) {
  const list = page.locator(
    width >= 1024 ? ".sidebar-rooms" : ".environment-chips",
  );
  await list.locator(".environment-select").first().click();
  await expect(page.locator(".list-section-heading h2")).not.toHaveText(
    "Meu enxoval",
  );
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function inViewport(page: Page, selector: ReturnType<Page["locator"]>) {
  const box = (await selector.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
}

for (const width of widths) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/demo");
      await expect(page.locator(".item-row").first()).toBeVisible();
    });

    test("tocar em qualquer ponto da linha abre a edição e não há ícone de lápis", async ({
      page,
    }) => {
      const row = page.locator(".item-row").first();
      await expect(
        row.getByRole("button", { name: /^Editar /, exact: false }),
      ).toHaveCount(0);
      await expect(row.locator(".item-actions button")).toHaveCount(2);

      const inner = row.locator(".item-row-inner");
      // Pontos distantes do título: borda inferior, borda superior e logo antes das ações.
      const pointAt = [
        (box: { x: number; y: number; width: number; height: number }) => [
          box.x + box.width * 0.5,
          box.y + box.height - 3,
        ],
        (box: { x: number; y: number; width: number; height: number }) => [
          box.x + box.width * 0.5,
          box.y + 3,
        ],
        (box: { x: number; y: number; width: number; height: number }) => [
          box.x + box.width - 90,
          box.y + box.height / 2,
        ],
      ];
      for (const pick of pointAt) {
        await row.scrollIntoViewIfNeeded();
        const box = (await inner.boundingBox())!;
        const actionsBox = (await row.locator(".item-actions").boundingBox())!;
        const [x, y] = pick(box);
        expect(x).toBeLessThan(actionsBox.x);
        await page.mouse.click(x, y);
        await expect(row.getByRole("form")).toBeVisible();
        await row.getByRole("button", { name: /^Cancelar$/ }).click();
        await expect(row.getByRole("form")).toHaveCount(0);
      }

      // Controles internos continuam funcionando sem abrir a edição.
      const check = row.getByRole("checkbox");
      const before = await check.isChecked();
      await check.click();
      await expect(check).toBeChecked({ checked: !before });
      await expect(row.getByRole("form")).toHaveCount(0);
      await row.getByRole("button", { name: /^Remover / }).click();
      await expect(
        page.getByRole("dialog", { name: "Excluir item" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(row.getByRole("form")).toHaveCount(0);
      await noHorizontalOverflow(page);
    });

    test("exportação tem um único botão com menu de ambiente ou todos", async ({
      page,
    }) => {
      await openFirstEnvironment(page, width);
      const triggers = page.getByRole("button", { name: /^Exportar/ });
      await expect(triggers).toHaveCount(1);
      const trigger = triggers.first();
      const triggerBox = (await trigger.boundingBox())!;
      expect(triggerBox.width).toBeGreaterThanOrEqual(width < 768 ? 44 : 60);
      expect(triggerBox.height).toBeGreaterThanOrEqual(width < 768 ? 44 : 36);

      await trigger.click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      expect(await menu.getByRole("menuitem").count()).toBeGreaterThan(2);
      await expect(
        menu.getByRole("menuitem", { name: /Baixar todos os ambientes/ }),
      ).toBeVisible();
      await inViewport(page, menu);
      await noHorizontalOverflow(page);
      await page.screenshot({
        path: `tmp/validation/export-menu-${width}.png`,
      });
      expect(
        (
          await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze()
        ).violations,
      ).toEqual([]);

      const total = await page
        .locator(".sidebar-rooms, .environment-chips")
        .first();
      void total;
      let download = page.waitForEvent("download");
      await menu.locator(".is-current").click();
      const environmentCsv = await fs.readFile(
        (await (await download).path())!,
        "utf8",
      );
      await expect(menu).toHaveCount(0);

      await trigger.click();
      download = page.waitForEvent("download");
      await page
        .getByRole("menuitem", { name: /Baixar todos os ambientes/ })
        .click();
      const allCsv = await fs.readFile(
        (await (await download).path())!,
        "utf8",
      );
      expect(allCsv.split("\r\n").length).toBeGreaterThan(
        environmentCsv.split("\r\n").length,
      );

      // Escape fecha e devolve o foco ao botão.
      await trigger.click();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect(trigger).toBeFocused();
      // Clique fora fecha.
      await trigger.click();
      await page.locator(".list-section-heading h2").click();
      await expect(page.getByRole("menu")).toHaveCount(0);
    });

    test("exportar na visão geral segue o mesmo menu e rola quando a lista é grande", async ({
      page,
    }) => {
      await page
        .getByRole("button", { name: "Visão geral", exact: true })
        .click();
      await expect(page.locator(".workspace-view-overview")).toBeVisible();
      const triggers = page.getByRole("button", { name: /^Exportar/ });
      await expect(triggers).toHaveCount(1);
      await triggers.first().click();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await inViewport(page, menu);
      await noHorizontalOverflow(page);
      await page.screenshot({
        path: `tmp/validation/overview-export-${width}.png`,
      });
      // Em altura curta, a lista de ambientes precisa rolar dentro do menu.
      await page.setViewportSize({ width, height: 460 });
      const list = menu.locator(".export-menu-list");
      expect(
        await list.evaluate((el) => el.scrollHeight > el.clientHeight),
      ).toBe(true);
      const box = (await menu.boundingBox())!;
      expect(box.height).toBeLessThanOrEqual(420);
      await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      const last = menu.getByRole("menuitem").last();
      await expect(last).toBeInViewport();
      await page.screenshot({
        path: `tmp/validation/overview-export-scroll-${width}.png`,
      });
      const download = page.waitForEvent("download");
      await last.click();
      const csv = await fs.readFile((await (await download).path())!, "utf8");
      expect(csv.split("\n").length).toBeGreaterThan(1);
      await expect(menu).toHaveCount(0);
    });

    test("nome de ambiente com 24 caracteres aparece completo e o limite é respeitado", async ({
      page,
    }) => {
      const longName = "Quarto de Hóspedes Extra";
      expect(longName).toHaveLength(24);
      if (width >= 1024) {
        await page
          .locator(".sidebar-rooms")
          .locator("xpath=preceding-sibling::*[1]")
          .getByRole("button", { name: "Adicionar ambiente" })
          .click();
      } else {
        await page
          .getByRole("button", { name: "Abrir menu do enxoval" })
          .click();
        await page.getByRole("button", { name: "Adicionar ambiente" }).click();
      }
      const dialog = page.getByRole("dialog", { name: /ambiente/i });
      const input = dialog.getByLabel("Nome do ambiente");
      await expect(input).toHaveAttribute("maxlength", "24");
      await input.pressSequentially(longName + " e mais um pouco");
      await expect(input).toHaveValue(longName);
      await dialog.getByRole("button", { name: "Criar ambiente" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: longName, exact: true }),
      ).toBeVisible();

      const clipped = async (selector: string) =>
        page.locator(selector).evaluateAll((nodes) =>
          nodes
            .filter((n) => n.textContent?.includes("Hóspedes"))
            .map((n) => {
              const el = n as HTMLElement;
              const hides = getComputedStyle(el).overflow !== "visible";
              const box = el.getBoundingClientRect();
              const parent = el.closest(
                "nav, section, .workspace-menu-panel, .list-section-heading",
              ) as HTMLElement;
              const pbox = parent.getBoundingClientRect();
              return {
                clippedX: hides && el.scrollWidth > el.clientWidth + 1,
                clippedY: hides && el.scrollHeight > el.clientHeight + 1,
                outside: box.right > pbox.right + 1 || box.left < pbox.left - 1,
                text: el.textContent,
              };
            }),
        );
      const heading = await clipped(".list-section-heading h2");
      expect(heading).toEqual([
        expect.objectContaining({
          clippedX: false,
          clippedY: false,
          outside: false,
        }),
      ]);
      if (width >= 1024) {
        const side = await clipped(".sidebar-rooms .environment-select > span");
        expect(side).toHaveLength(1);
        expect(side[0]).toMatchObject({
          clippedX: false,
          clippedY: false,
          outside: false,
        });
        expect(side[0].text).toBe(longName);
        await page.screenshot({
          path: `tmp/validation/long-name-sidebar-${width}.png`,
        });
      } else {
        await page
          .getByRole("button", { name: "Abrir menu do enxoval" })
          .click();
        const menu = await clipped(
          ".workspace-menu-panel .environment-select > span",
        );
        expect(menu).toHaveLength(1);
        expect(menu[0]).toMatchObject({
          clippedX: false,
          clippedY: false,
          outside: false,
        });
        await page.screenshot({
          path: `tmp/validation/long-name-menu-${width}.png`,
        });
        await page.keyboard.press("Escape");
      }
      await noHorizontalOverflow(page);
      await page.screenshot({ path: `tmp/validation/long-name-${width}.png` });
    });

    test("novo item já tem todos os campos e salva preço, link e observações", async ({
      page,
    }) => {
      await page
        .getByRole("button", { name: /Adicionar item/ })
        .first()
        .click();
      const dialog = page.getByRole("dialog", { name: "Novo item" });
      await expect(dialog).toBeVisible();
      for (const label of [
        "Nome do produto",
        "Preço",
        "Link do produto",
        "Observações",
      ]) {
        await expect(dialog.getByLabel(label, { exact: true })).toBeVisible();
      }
      await expect(
        dialog.getByRole("combobox", { name: "Ambiente" }),
      ).toBeVisible();
      await dialog.getByLabel("Nome do produto").fill("Air fryer completa");
      await dialog.getByLabel("Preço", { exact: true }).fill("45990");
      await expect(dialog.getByLabel("Preço", { exact: true })).toHaveValue(
        /459,90/,
      );
      await dialog
        .getByLabel("Link do produto")
        .fill("https://example.com/air-fryer");
      await dialog.getByLabel("Observações").fill("Cor preta, 110 V");
      const submit = dialog.getByRole("button", { name: "Adicionar à lista" });
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
      await page.screenshot({ path: `tmp/validation/new-item-${width}.png` });
      await noHorizontalOverflow(page);
      await submit.click();
      await expect(dialog).toHaveCount(0);
      const row = page
        .locator(".item-row")
        .filter({ hasText: "Air fryer completa" });
      await row.scrollIntoViewIfNeeded();
      await expect(row).toContainText("459,90");
      await expect(
        row.getByRole("link", { name: "Ver na loja" }),
      ).toHaveAttribute("href", "https://example.com/air-fryer");
      await row.getByRole("button", { name: /^Air fryer completa/ }).click();
      await expect(row.getByLabel("Observações")).toHaveValue(
        "Cor preta, 110 V",
      );
    });

    test("excluir ambiente pelo título e pelo menu lateral", async ({
      page,
    }) => {
      await openFirstEnvironment(page, width);
      await page.screenshot({ path: `tmp/validation/list-${width}.png` });
      const heading = page.locator(".list-section-heading");
      const name = (await heading.locator("h2").textContent())!.trim();
      const environmentItems = await page.locator(".item-row").count();
      expect(environmentItems).toBeGreaterThan(0);

      const trash = heading.getByRole("button", {
        name: `Excluir ambiente ${name}`,
        exact: true,
      });
      await expect(trash).toBeVisible();
      const trashBox = (await trash.boundingBox())!;
      expect(trashBox.width).toBeGreaterThanOrEqual(32);
      await inViewport(page, trash);
      await noHorizontalOverflow(page);

      await trash.click();
      const dialog = page.getByRole("dialog", { name: "Excluir ambiente" });
      await expect(dialog).toContainText(`"${name}"`);
      await expect(dialog).toContainText("Não é possível desfazer");
      await dialog.getByRole("button", { name: "Cancelar" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(heading.locator("h2")).toHaveText(name);

      await trash.click();
      await dialog.getByRole("button", { name: "Excluir ambiente" }).click();
      await expect(dialog).toHaveCount(0);
      // Excluir o ambiente aberto volta para "Meu enxoval" (todos os itens).
      await expect(heading.locator("h2")).toHaveText("Meu enxoval");
      await expect(
        page.locator(".environment-select").filter({ hasText: name }),
      ).toHaveCount(0);

      // Persistência no modo demonstração.
      await page.reload();
      await expect(
        page.locator(".environment-select").filter({ hasText: name }),
      ).toHaveCount(0);

      // Segunda exclusão pelo local de navegação de cada tamanho.
      const next = (await page
        .locator(width >= 1024 ? ".sidebar-rooms" : ".environment-chips")
        .locator(".environment-select span")
        .first()
        .textContent())!.trim();
      if (width >= 1024) {
        const sidebar = page.locator(".sidebar-rooms");
        const sideTrash = sidebar.getByRole("button", {
          name: `Excluir ambiente ${next}`,
          exact: true,
        });
        await expect(sideTrash).toBeVisible();
        await page.screenshot({ path: `tmp/validation/sidebar-${width}.png` });
        await sideTrash.click();
      } else {
        await page
          .getByRole("button", { name: "Abrir menu do enxoval" })
          .click();
        const menu = page.getByRole("dialog", { name: "Menu do enxoval" });
        const menuTrash = menu.getByRole("button", {
          name: `Excluir ambiente ${next}`,
          exact: true,
        });
        await expect(menuTrash).toBeVisible();
        await page.screenshot({ path: `tmp/validation/menu-${width}.png` });
        await menuTrash.click();
        await expect(menu).toHaveCount(0);
      }
      await page
        .getByRole("dialog", { name: "Excluir ambiente" })
        .getByRole("button", { name: "Excluir ambiente" })
        .click();
      await expect(
        page.locator(".environment-select").filter({ hasText: next }),
      ).toHaveCount(0);
      await noHorizontalOverflow(page);
    });
  });
}
