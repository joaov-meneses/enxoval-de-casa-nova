import { expect, test } from "@playwright/test";

const MODEL_CSV = "public/modelos/larume-modelo-importacao.csv";
const MODEL_XLSX = "public/modelos/larume-modelo-importacao.xlsx";

async function openOverview(page: import("@playwright/test").Page) {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(page.getByText("Seu lar está ganhando forma.")).toBeVisible();
}

for (const [label, file] of [
  ["CSV", MODEL_CSV],
  ["XLSX", MODEL_XLSX],
] as const) {
  test(`importa o modelo de exemplo em ${label}`, async ({ page }) => {
    await openOverview(page);
    await page.getByRole("button", { name: "Importar", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Importar itens" });
    await expect(
      dialog.getByRole("link", { name: /Modelo Excel/ }),
    ).toHaveAttribute("href", "/modelos/larume-modelo-importacao.xlsx");
    await expect(
      dialog.getByRole("link", { name: /Modelo CSV/ }),
    ).toHaveAttribute("href", "/modelos/larume-modelo-importacao.csv");

    await dialog.locator('input[type="file"]').setInputFiles(file);
    // Itens que já existem no demo (mesmo nome e ambiente) são pulados por padrão.
    await expect(dialog.getByLabel("Resumo da leitura")).toContainText(
      /itens? será(ão)? importados?/,
    );
    await expect(dialog.getByRole("region", { name: /Prévia/ })).toBeVisible();

    await dialog.getByRole("button", { name: /^Importar \d+ iten/ }).click();
    await expect(dialog.getByRole("status")).toContainText(
      /item(ns)? importados?/,
    );
    await dialog.getByRole("button", { name: "Concluir" }).click();
    await expect(dialog).toHaveCount(0);

    // Um item exclusivo do modelo passa a existir no enxoval.
    await page
      .getByRole("button", { name: "Meu enxoval", exact: false })
      .first()
      .click();
    await expect(page.getByText("Cortina blackout")).toBeVisible();
  });
}

test("o botão Importar existe na visão geral, em Meu enxoval e em cada ambiente", async ({
  page,
}) => {
  await openOverview(page);
  const importar = page.getByRole("button", { name: "Importar", exact: true });
  await expect(importar).toBeVisible();

  await page
    .getByRole("button", { name: /^Meu enxoval/ })
    .first()
    .click();
  await expect(importar).toBeVisible();

  await page
    .locator(".sidebar-rooms .environment-select")
    .filter({ hasText: "Cozinha" })
    .click();
  await expect(importar).toBeVisible();
});

test("só importa arquivos no formato correto, com Item e Ambiente", async ({
  page,
}) => {
  await openOverview(page);
  await page.getByRole("button", { name: "Importar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Importar itens" });
  const input = dialog.locator('input[type="file"]');
  const csv = (name: string, content: string) => ({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(content),
  });

  // Faltam as colunas obrigatórias: o arquivo é recusado.
  await input.setInputFiles(csv("sem-colunas.csv", "coluna a;coluna b\n1;2\n"));
  await expect(dialog.getByRole("alert")).toContainText(
    'colunas obrigatórias "Item" e "Ambiente"',
  );
  await input.setInputFiles(
    csv("sem-ambiente.csv", "Item;Preço\nCortina;10\n"),
  );
  await expect(dialog.getByRole("alert")).toContainText('"Ambiente"');

  // Colunas certas, mas uma linha sem Ambiente: aparece o erro e a importação fica bloqueada.
  await input.setInputFiles(
    csv("linha-incompleta.csv", "Item;Ambiente\nCortina;Sala\nTapete;\n"),
  );
  await expect(dialog.getByRole("alert")).toContainText("nada será importado");
  await expect(
    dialog.getByRole("listitem").filter({ hasText: "Linha 3:" }),
  ).toContainText("Ambiente");
  await expect(
    dialog.getByRole("button", { name: "Corrija o arquivo para importar" }),
  ).toBeDisabled();

  // Formato não suportado.
  await dialog.getByRole("button", { name: "Trocar arquivo" }).click();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "antigo.xls",
    mimeType: "application/vnd.ms-excel",
    buffer: Buffer.from("x"),
  });
  await expect(dialog.getByRole("alert")).toContainText(".xls");

  // Arquivo correto libera a importação.
  await dialog
    .locator('input[type="file"]')
    .setInputFiles(
      csv("ok.csv", "Item;Ambiente\nCortina de teste;Sala de Estar\n"),
    );
  await expect(
    dialog.getByRole("button", { name: "Importar 1 item" }),
  ).toBeEnabled();
});

test("exporta em CSV por padrão e em Excel quando escolhido", async ({
  page,
}) => {
  await openOverview(page);

  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await page
    .getByRole("menuitem", { name: /Baixar todos os ambientes/ })
    .click();
  expect((await csv).suggestedFilename()).toMatch(/\.csv$/);

  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /Excel/ }).click();
  await expect(
    page.getByRole("menuitemradio", { name: /Excel/ }),
  ).toHaveAttribute("aria-checked", "true");
  const xlsx = page.waitForEvent("download");
  await page
    .getByRole("menuitem", { name: /Baixar todos os ambientes/ })
    .click();
  expect((await xlsx).suggestedFilename()).toMatch(/\.xlsx$/);
});
