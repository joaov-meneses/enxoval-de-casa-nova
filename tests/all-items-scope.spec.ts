import { expect, test, type Page } from "@playwright/test";

const widths = [320, 390, 768, 1024, 1440];

/** Seleciona um ambiente pelo menu certo para a largura (barra lateral ou chips). */
async function openEnvironment(page: Page, width: number, name: string) {
  const list = page.locator(
    width >= 1024 ? ".sidebar-rooms" : ".environment-chips",
  );
  await list
    .locator(".environment-select")
    .filter({ hasText: name })
    .first()
    .click();
}

async function openAllItems(page: Page, width: number) {
  if (width >= 1024) {
    await page
      .locator(".workspace-navigation")
      .getByRole("button", { name: /Meu enxoval/ })
      .click();
  } else {
    await page
      .locator(".mobile-bottom-nav")
      .getByRole("button", { name: /Meu enxoval/ })
      .click();
  }
}

const search = (page: Page) => page.getByRole("searchbox");

for (const width of widths) {
  test.describe(`${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/demo");
      await expect(page.locator(".item-row").first()).toBeVisible();
    });

    test("Meu enxoval abre com todos os itens e o ambiente em cada card", async ({
      page,
    }) => {
      await expect(page.locator(".list-section-heading h2")).toHaveText(
        "Meu enxoval",
      );
      const total = await page.locator(".item-row").count();
      expect(total).toBeGreaterThan(8); // mais que um único ambiente
      const tags = await page
        .locator(".item-row .item-category-tag")
        .allTextContents();
      expect(tags).toHaveLength(total);
      expect(new Set(tags).size).toBeGreaterThan(1);
      // Sem ambiente aberto não há edição/exclusão de ambiente nem arrastar itens.
      await expect(
        page
          .locator(".list-section-heading")
          .getByRole("button", { name: /ambiente/ }),
      ).toHaveCount(0);
      await expect(page.locator(".sortable-items")).toHaveCount(0);
      if (width >= 1024) {
        await expect(
          page.locator(".workspace-navigation button.active"),
        ).toContainText("Meu enxoval");
        await expect(
          page.locator(".sidebar-rooms .environment-row.active"),
        ).toHaveCount(0);
      } else {
        await expect(page.locator(".environment-all.active")).toContainText(
          "Todos",
        );
      }
    });

    test("a busca respeita o escopo: tudo em Meu enxoval, só o ambiente quando aberto", async ({
      page,
    }) => {
      await expect(search(page)).toHaveAttribute(
        "placeholder",
        "Buscar em todos os ambientes",
      );
      await search(page).fill("pratos");
      await expect(
        page.locator(".item-row").filter({ hasText: "Jogo de pratos" }),
      ).toBeVisible();
      await search(page).fill("cama");
      await expect(
        page.locator(".item-row").filter({ hasText: "Jogo de cama" }),
      ).toBeVisible();

      await openEnvironment(page, width, "Quarto");
      await expect(search(page)).toHaveAttribute(
        "placeholder",
        "Buscar em Quarto",
      );
      await expect(search(page)).toHaveValue("");
      // "pratos" é da Cozinha: não aparece ao buscar dentro do Quarto.
      await search(page).fill("pratos");
      await expect(page.locator(".item-row")).toHaveCount(0);
      await search(page).fill("cama");
      await expect(
        page.locator(".item-row").filter({ hasText: "Jogo de cama" }),
      ).toBeVisible();
      // Dentro de um ambiente o nome dele não se repete em cada card.
      await expect(page.locator(".item-row .item-category-tag")).toHaveCount(0);

      await openAllItems(page, width);
      await expect(search(page)).toHaveAttribute(
        "placeholder",
        "Buscar em todos os ambientes",
      );
      await search(page).fill("pratos");
      await expect(
        page.locator(".item-row").filter({ hasText: "Jogo de pratos" }),
      ).toBeVisible();
    });

    test("cada ambiente mostra só o seu progresso e gasto; o geral fica em Meu enxoval", async ({
      page,
    }) => {
      const all = await page.evaluate(() => {
        const ws = JSON.parse(localStorage.getItem("larume.demo.v1")!)
          .workspaces[0];
        const byCat = (id?: string) =>
          ws.items.filter(
            (i: { categoryId: string }) => !id || i.categoryId === id,
          );
        const cats = ws.categories as { id: string; name: string }[];
        const quarto = cats.find((c) => c.name === "Quarto")!;
        const stat = (list: { checked: boolean }[]) => ({
          total: list.length,
          done: list.filter((i) => i.checked).length,
        });
        return { all: stat(byCat()), quarto: stat(byCat(quarto.id)) };
      });
      expect(all.quarto.total).toBeLessThan(all.all.total);

      if (width >= 1024) {
        await expect(page.locator(".stats-scope")).toContainText(
          "todos os ambientes",
        );
        await expect(page.locator(".workspace-stats")).toContainText(
          `${all.all.done} de ${all.all.total} itens`,
        );
      }
      await openEnvironment(page, width, "Quarto");
      if (width >= 1024) {
        await expect(page.locator(".stats-scope")).toContainText("Quarto");
        await expect(page.locator(".workspace-stats")).toContainText(
          `${all.quarto.done} de ${all.quarto.total} ${all.quarto.total === 1 ? "item" : "itens"}`,
        );
        // Descontos do enxoval não entram na conta de um ambiente.
        await expect(page.locator(".workspace-stats")).not.toContainText(
          "Descontos e cashback",
        );
      } else {
        const pct = Math.round((all.quarto.done / all.quarto.total) * 100);
        await expect(page.locator(".mobile-header-summary")).toContainText(
          `${pct}%`,
        );
      }

      await openAllItems(page, width);
      if (width >= 1024) {
        await expect(page.locator(".stats-scope")).toContainText(
          "todos os ambientes",
        );
        await expect(page.locator(".workspace-stats")).toContainText(
          "Descontos e cashback",
        );
      }
    });

    test("a Visão geral mantém o total do enxoval", async ({ page }) => {
      await openEnvironment(page, width, "Quarto");
      await page
        .getByRole("button", { name: "Visão geral", exact: true })
        .click();
      await expect(page.locator(".stats-scope")).toContainText(
        "geral do enxoval",
      );
      await expect(page.locator(".workspace-stats")).toContainText(
        "Descontos e cashback",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    });

    test("ambiente escolhido fica salvo ao navegar e Meu enxoval volta para todos", async ({
      page,
    }) => {
      await openEnvironment(page, width, "Banheiro");
      await expect(page.locator(".list-section-heading h2")).toHaveText(
        "Banheiro",
      );
      await openAllItems(page, width);
      await expect(page.locator(".list-section-heading h2")).toHaveText(
        "Meu enxoval",
      );
      await page.screenshot({ path: `tmp/validation/all-items-${width}.png` });
    });
  });
}
