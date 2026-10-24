import { expect, test, type Page } from "@playwright/test";

// Fase 11 na interface: parcelas, responsável, presentes, documentos, lojas e modo loja, no celular e no desktop.
const home = {
  id: "home",
  name: "Nossa casa",
  ownerId: "owner",
  ownerName: "Ana",
  role: "owner",
  discountCents: 0,
  moveDate: "2026-12-05",
  state: "BA",
  city: null,
  spendingTier: "equilibrado",
  monthlyBudgetCents: 500_00,
};
const members = [
  { id: "owner", name: "Ana Souza", email: "ana@example.invalid", role: "owner", avatarUrl: null },
  { id: "leo", name: "Léo Lima", email: "leo@example.invalid", role: "editor", avatarUrl: null },
];
const categories = [
  { id: "kitchen", name: "Cozinha", sortOrder: 0 },
  { id: "room", name: "Sala", sortOrder: 1 },
];
const offer = (id: string, domain: string, cents: number, isPrimary = false) => ({
  id,
  url: `https://www.${domain}/produto`,
  domain,
  isPrimary,
  currentPriceCents: cents,
  pixPriceCents: null,
  inStock: true,
  lastCheckedAt: "2026-11-01T12:00:00Z",
  status: "ok",
});
const base = {
  link: "",
  description: "",
  quantity: 1,
  discountCents: 0,
  buyWeek: null,
  priceCategory: null,
  priority: null,
  timing: null,
  createdAt: "2026-10-18T12:00:00Z",
  updatedAt: "2026-10-18T12:00:00Z",
  installments: 1,
  offers: [],
  documentCount: 0,
};

function initialItems() {
  return [
    { ...base, id: "fridge", name: "Geladeira", categoryId: "kitchen", category: "Cozinha", checked: true, status: "bought", priceCents: 1_890_00, sortOrder: 0, installments: 10, paymentMethod: "credit", purchasedAt: "2026-11-02", warrantyMonths: 12, warrantyUntil: "2026-11-30", documentCount: 2 },
    { ...base, id: "airfryer", name: "Air fryer", categoryId: "kitchen", category: "Cozinha", checked: false, status: "researching", priceCents: 500_00, sortOrder: 1, assigneeId: "owner", description: "Cesto de 5 litros", link: "https://www.amazon.com.br/air-fryer", offers: [offer("o1", "amazon.com.br", 500_00, true), offer("o2", "magazineluiza.com.br", 459_00), offer("o3", "loja.example.com", 480_00)] },
    { ...base, id: "glasses", name: "Jogo de taças", categoryId: "kitchen", category: "Cozinha", checked: true, status: "received", priceCents: 120_00, sortOrder: 2, giftFrom: "Tia Rosa", giftMessage: "Para brindar!" },
    { ...base, id: "sofa", name: "Sofá retrátil", categoryId: "room", category: "Sala", checked: false, status: "researching", priceCents: 3_000_00, sortOrder: 0, assigneeId: "leo", installments: 10, link: "https://www.loja-a.example.com/sofa-1", offers: [offer("s1", "loja-a.example.com", 3_000_00, true)] },
  ];
}

async function mockApp(page: Page) {
  let items = initialItems();
  const patches: Record<string, unknown>[] = [];
  const posts: Record<string, unknown>[] = [];
  const offerPosts: Record<string, unknown>[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/bootstrap")
      return route.fulfill({
        json: {
          user: { id: "owner", name: "Ana Souza", email: "ana@example.invalid", plan: "monthly", isGuest: false, onboardingCompleted: true },
          enxovais: [home],
          activeEnxoval: home,
          members,
          categories,
          items,
        },
      });
    if (path === "/api/billing/status")
      return route.fulfill({ json: { available: true, plan: "monthly", status: "active", accessAllowed: true, isOwner: true, trialUsed: true, trialNotice: null } });
    if (path === "/api/items/fridge/documents")
      return route.fulfill({
        json: {
          documents: [
            { id: "d1", itemId: "fridge", kind: "invoice", fileName: "nota-geladeira.pdf", contentType: "application/pdf", sizeBytes: 182_000, createdAt: "2026-11-02T12:00:00Z", url: "/api/documents/d1/file" },
            { id: "d2", itemId: "fridge", kind: "warranty", fileName: "garantia.jpg", contentType: "image/jpeg", sizeBytes: 820_000, createdAt: "2026-11-02T12:00:00Z", url: "/api/documents/d2/file" },
          ],
        },
      });
    if (path === "/api/enxovais/home/documents")
      return route.fulfill({ json: { documents: [], usedBytes: 1_002_000, quotaBytes: 500 * 1024 * 1024 } });
    if (path === "/api/items/sofa/offers" && request.method() === "POST") {
      const body = request.postDataJSON();
      offerPosts.push(body);
      items = items.map((item) =>
        item.id === "sofa" ? { ...item, offers: [...(item.offers ?? []), offer("s2", new URL(body.url).hostname.replace(/^www\./, ""), 0)] } : item,
      );
      return route.fulfill({ status: 201, json: items.find((item) => item.id === "sofa") });
    }
    if (path === "/api/items" && request.method() === "POST") {
      const body = request.postDataJSON();
      posts.push(body);
      const created = { ...base, id: "novo", name: body.name, categoryId: body.categoryId, category: "Cozinha", checked: body.status === "bought", status: body.status ?? "researching", priceCents: body.priceCents ?? null, sortOrder: -1 };
      items = [created as unknown as (typeof items)[number], ...items];
      return route.fulfill({ status: 201, json: { item: created, category: categories[0] } });
    }
    if (/^\/api\/items\/[^/]+$/.test(path) && request.method() === "PATCH") {
      const id = path.split("/").pop();
      const updates = request.postDataJSON();
      patches.push({ id, ...updates });
      items = items.map((item) => {
        if (item.id !== id) return item;
        const status = updates.status ?? (updates.checked === false ? "researching" : item.status);
        const { thanked, ...rest } = updates;
        return {
          ...item,
          ...rest,
          ...(thanked === undefined ? {} : { thankedAt: thanked ? "2026-11-15T12:00:00Z" : null }),
          status,
          checked: ["bought", "received", "owned"].includes(status),
        };
      });
      return route.fulfill({ json: items.find((item) => item.id === id) });
    }
    return route.fulfill({ json: {} });
  });
  await page.clock.setFixedTime(new Date("2026-11-15T12:00:00-03:00"));
  return { patches, posts, offerPosts, errors };
}

async function openList(page: Page) {
  await page.goto("/app");
  const nav = page.locator(page.viewportSize()!.width < 1024 ? ".mobile-bottom-nav" : ".workspace-sidebar");
  await nav.getByRole("button", { name: /^Meu enxoval/ }).click();
  await expect(page.locator(".item-row")).toHaveCount(4);
}

for (const width of [375, 1440]) {
  test.describe(`Fase 11 em ${width}px`, () => {
    test.use({ viewport: { width, height: width < 1024 ? 812 : 1000 } });

    test("selos, atalhos, agradecimento e detalhes do item", async ({ page }) => {
      const state = await mockApp(page);
      await openList(page);
      const fridge = page.locator('[data-item-id="fridge"]');
      await expect(fridge.locator(".item-installments-tag")).toHaveText(/10x\sR\$\s189/);
      await expect(fridge.locator(".item-warranty-tag")).toHaveText("Garantia vence em 15 dias");
      await expect(fridge.locator(".item-doc-tag")).toBeVisible();
      const airfryer = page.locator('[data-item-id="airfryer"]');
      await expect(airfryer.getByRole("button", { name: /3 lojas · a partir de R\$\s459/ })).toBeVisible();
      await expect(airfryer.locator(".item-assignee")).toHaveAttribute("title", "Com você");
      await expect(page.locator('[data-item-id="sofa"] .item-assignee')).toHaveAttribute("title", "Com Léo");
      const insights = page.getByRole("group", { name: "Atalhos da lista" });
      await expect(insights.getByRole("button", { name: "Meus itens (1)" })).toBeVisible();
      await expect(insights.getByRole("button", { name: "1 agradecimento pendente" })).toBeVisible();
      await expect(insights.getByRole("button", { name: "1 garantia vence em 30 dias" })).toBeVisible();

      // Atalho "Meus itens": só o que está com a própria pessoa.
      await insights.getByRole("button", { name: "Meus itens (1)" }).click();
      await expect(page.locator(".item-row")).toHaveCount(1);
      await page.getByRole("button", { name: "Remover filtro: Meus itens" }).click();
      await expect(page.locator(".item-row")).toHaveCount(4);

      // Agradecer: marca como agradecido sem sair da lista.
      const glasses = page.locator('[data-item-id="glasses"]');
      await expect(glasses.locator(".item-gift-tag")).toHaveText(/de Tia Rosa/);
      await glasses.getByRole("button", { name: "Agradecer" }).click();
      const thanks = page.getByRole("dialog", { name: "Agradecer o presente" });
      await expect(thanks.getByLabel("Mensagem")).toHaveValue(/Oi, Tia Rosa! O presente \(Jogo de taças\)/);
      await thanks.getByRole("button", { name: "Marquei como agradecido" }).click();
      await expect(thanks).toBeHidden();
      await expect(glasses.getByRole("button", { name: "Agradecer" })).toHaveCount(0);
      expect(state.patches).toContainEqual({ id: "glasses", thanked: true });

      // Detalhes do item comprado: parcelas, garantia e documentos.
      await fridge.getByRole("button", { name: "Abrir detalhes de Geladeira" }).click();
      const form = page.getByRole("form", { name: "Editar Geladeira na lista" });
      await expect(form.getByLabel("Parcelas", { exact: true })).toBeVisible();
      await expect(form.getByText("10x de R$")).toBeVisible();
      await expect(form.getByLabel("Garantia (meses)")).toHaveValue("12");
      await expect(form.getByRole("link", { name: "nota-geladeira.pdf" })).toBeVisible();
      await expect(form.getByRole("button", { name: "Fotografar" })).toBeVisible();
      await form.getByRole("combobox", { name: "Quem vai comprar" }).click();
      await page.getByRole("option", { name: "Léo Lima" }).click();
      await expect(form.getByRole("combobox", { name: "Quem vai comprar" })).toHaveText(/Léo Lima/);
      await form.getByRole("button", { name: "Salvar alterações" }).click();
      await expect(form).toBeHidden();
      expect(state.patches.find((patch) => patch.id === "fridge")).toMatchObject({ assigneeId: "leo" });

      // Lojas do item pendente: a mais barata ganha o selo e pode virar a principal.
      await airfryer.getByRole("button", { name: /3 lojas/ }).click();
      const offers = page.getByRole("form", { name: "Editar Air fryer na lista" }).locator(".item-offer");
      await expect(offers).toHaveCount(3);
      await expect(offers.nth(1)).toContainText("Mais barato");
      await expect(offers.nth(1).getByRole("button", { name: "Tornar principal" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((node) => !node.closest(".environment-tabs-scroll, .list-insights") && node.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && node.getBoundingClientRect().width > 0)
          .map((node) => `${node.tagName}.${String(node.className).slice(0, 60)} ${Math.round(node.getBoundingClientRect().right)} [${(node.parentElement?.className ?? "").toString().slice(0, 50)}] "${(node.textContent ?? "").slice(0, 30)}"`)
          .slice(0, 8),
      );
      expect(overflow, wide.join("\n")).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `test-results/fase11-lista-${width}.png`, fullPage: true });
      expect(state.errors).toEqual([]);
    });

    test("modo loja: só o que falta, comparação de preço e riscar rápido", async ({ page }) => {
      const state = await mockApp(page);
      await page.goto("/app/home/loja");
      await expect(page.getByRole("heading", { name: "Modo loja" })).toBeVisible();
      const listed = page.locator(".store-item");
      await expect(listed).toHaveCount(2);
      await expect(listed.first()).toContainText("Cesto de 5 litros");
      await page.getByRole("button", { name: "Sala", exact: true }).click();
      await expect(page).toHaveURL(/\/app\/home\/loja\/room$/);
      await expect(listed).toHaveCount(1);
      await page.getByRole("group", { name: "Filtrar por ambiente" }).getByRole("button", { name: "Todos", exact: true }).click();
      const airfryer = listed.filter({ hasText: "Air fryer" });
      await airfryer.getByRole("button", { name: "Vale a pena?" }).click();
      await airfryer.getByLabel("Preço da etiqueta").fill("44000");
      await expect(airfryer.locator(".store-worth-lines")).toContainText("Mais barato que o menor preço online");
      await airfryer.getByRole("button", { name: "Comprei" }).click();
      const dialog = page.getByRole("dialog", { name: "Comprei" });
      await dialog.getByLabel("Quanto você pagou?").fill("44000");
      await dialog.getByLabel("Parcelas").click();
      await page.getByRole("option", { name: "3x", exact: true }).click();
      await dialog.getByRole("button", { name: "Confirmar situação" }).click();
      await expect(dialog).toBeHidden();
      await expect(listed).toHaveCount(1);
      expect(state.patches).toContainEqual({ id: "airfryer", status: "bought", checked: true, priceCents: 440_00, installments: 3 });
      await page.screenshot({ path: `test-results/fase11-loja-${width}.png`, fullPage: true });
      expect(state.errors).toEqual([]);
    });

    test("planejamento mostra as parcelas por mês e Meu Lar os presentes", async ({ page }) => {
      await mockApp(page);
      await page.goto("/app/home/plano");
      const flow = page.getByRole("region", { name: "Parcelas por mês" });
      await expect(flow).toBeVisible();
      await expect(flow.getByText("Comprometido nos próximos 3 meses")).toBeVisible();
      await expect(flow.locator(".flow-month")).not.toHaveCount(0);
      await expect(flow.getByLabel("Teto mensal para parcelas")).toHaveValue(/R\$\s500,00/);
      await flow.locator(".flow-month").first().screenshot({ path: `test-results/fase11-fluxo-mes-${width}.png` });
      await page.screenshot({ path: `test-results/fase11-plano-${width}.png`, fullPage: true });
      await page.goto("/app/home/meu-lar");
      const gifts = page.getByRole("region", { name: "Presentes" });
      await expect(gifts).toContainText("de Tia Rosa");
      await expect(gifts.getByRole("button", { name: "Exportar CSV" })).toBeVisible();
      await expect(page.getByRole("region", { name: "Documentos da casa" })).toContainText("Geladeira");
    });
  });
}

// Formulário de edição do item: nenhum campo pode quebrar, estourar ou cobrir o vizinho em qualquer largura.
for (const width of [375, 768, 1100, 1440, 1920]) {
  test.describe(`Formulário do item em ${width}px`, () => {
    test.use({ viewport: { width, height: width < 1024 ? 900 : 1100 } });

    for (const id of ["fridge", "airfryer", "glasses"]) {
      test(`campos de ${id} alinhados e sem sobreposição`, async ({ page }) => {
        const state = await mockApp(page);
        await openList(page);
        await page.locator(`[data-item-id="${id}"] .item-title-button`).click();
        const grid = page.locator(".item-edit-dialog .item-inline-grid");
        await expect(grid).toBeVisible();
        const report = await grid.evaluate((node) => {
          const boxes = [...node.children]
            .map((child) => ({ el: child as HTMLElement, r: child.getBoundingClientRect() }))
            .filter(({ r }) => r.width > 0 && r.height > 0);
          const name = (el: HTMLElement) => `${el.tagName}.${String(el.className).split(" ").slice(0, 2).join(".")}`;
          const overlaps: string[] = [];
          for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
              const a = boxes[i].r;
              const b = boxes[j].r;
              const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (x > 1 && y > 1) overlaps.push(`${name(boxes[i].el)} x ${name(boxes[j].el)}`);
            }
          }
          const gridRect = node.getBoundingClientRect();
          const outside = boxes.filter(({ r }) => r.left < gridRect.left - 1 || r.right > gridRect.right + 1).map(({ el }) => name(el));
          const clipped = boxes.filter(({ el }) => el.scrollWidth > el.clientWidth + 1).map(({ el }) => name(el));
          return { overlaps, outside, clipped, page: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        expect(report.overlaps, "sobreposição").toEqual([]);
        expect(report.outside, "fora da grade").toEqual([]);
        expect(report.clipped, "conteúdo cortado").toEqual([]);
        expect(report.page, "rolagem horizontal").toBeLessThanOrEqual(0);
        await page.locator(".item-edit-dialog").screenshot({ path: `test-results/form-item-${id}-${width}.png` });
        expect(state.errors).toEqual([]);
      });
    }
  });
}

test.describe("Novo item com os mesmos campos da edição", () => {
  test.use({ viewport: { width: 1440, height: 1100 } });

  test("compra parcelada com garantia é criada e completada pelo PATCH", async ({ page }) => {
    const state = await mockApp(page);
    await openList(page);
    await page.getByRole("button", { name: "Adicionar item", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Novo item" });
    await dialog.getByLabel("Nome do produto").fill("Batedeira");
    await dialog.getByRole("button", { name: "Mais detalhes" }).click();
    await expect(dialog.getByLabel("Garantia (meses)")).toBeVisible();
    await dialog.getByRole("combobox", { name: "Situação" }).click();
    await page.getByRole("option", { name: "Comprado" }).click();
    await dialog.getByLabel("Preço", { exact: true }).fill("600");
    await dialog.getByRole("combobox", { name: "Parcelas" }).click();
    await page.getByRole("option", { name: "3x", exact: true }).click();
    await dialog.getByLabel("Garantia (meses)").fill("12");
    await dialog.getByLabel("Onde foi comprado").fill("Loja do bairro");
    await dialog.getByRole("button", { name: "Adicionar à lista" }).click();
    await expect(dialog).toBeHidden();
    expect(state.posts[0]).toMatchObject({ name: "Batedeira", status: "bought" });
    expect(state.patches).toContainEqual(
      expect.objectContaining({ id: "novo", installments: 3, warrantyMonths: 12, storeName: "Loja do bairro", purchasedAt: "2026-11-15" }),
    );
    expect(state.errors).toEqual([]);
  });
});

test.describe("Meu enxoval (todos) e ambientes mostram os mesmos campos", () => {
  test.use({ viewport: { width: 1440, height: 1100 } });

  for (const id of ["fridge", "airfryer", "glasses"]) {
    test(`campos de ${id}`, async ({ page }) => {
      await mockApp(page);
      const fieldsAt = async (url: string) => {
        await page.goto(url);
        await page.locator(`[data-item-id="${id}"] .item-title-button`).click();
        const grid = page.locator(".item-edit-dialog .item-inline-grid");
        await expect(grid).toBeVisible();
        return grid.evaluate((node) =>
          [...node.querySelectorAll("label, h4, button[role=combobox]")]
            .map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40))
            .filter(Boolean),
        );
      };
      const all = await fieldsAt("/app/home");
      const room = await fieldsAt("/app/home/itens/kitchen");
      expect(room).toEqual(all);
      expect(all.length).toBeGreaterThan(6);
    });
  }
});

test.describe("Itens riscados e não riscados têm o mesmo formulário", () => {
  test.use({ viewport: { width: 1440, height: 1100 } });

  test("pesquisando, comprado e recebido mostram os mesmos campos", async ({ page }) => {
    await mockApp(page);
    await openList(page);
    const fields = async (id: string) => {
      await page.locator(`[data-item-id="${id}"] .item-title-button`).click();
      const grid = page.locator(".item-edit-dialog .item-inline-grid");
      await expect(grid).toBeVisible();
      const labels = await grid.evaluate((node) =>
        [...node.querySelectorAll("label, h4")]
          .map((el) => (el.getAttribute("aria-label") ?? el.firstChild?.textContent ?? "").replace(/\s+/g, " ").replace(/\d+\/\d+$/, "").trim().slice(0, 28))
          .filter(Boolean),
      );
      await page.keyboard.press("Escape");
      await expect(grid).toBeHidden();
      return labels;
    };
    const gift = /^(Presente|De quem foi|Recado que veio|Já agradeci)/;
    const bought = (await fields("fridge")).filter((label) => !gift.test(label));
    // O campo de link some quando o item chega ao limite de lojas.
    const dependent = /^(Valor da parcela|Primeira parcela|Acompanhar|Me avise|Avisar|Link do produto|Link de outra loja)/;
    const common = bought.filter((label) => !dependent.test(label));
    expect(await fields("airfryer")).toEqual(expect.arrayContaining(common));
    const received = await fields("glasses");
    expect(received).toEqual(expect.arrayContaining(common));
    expect(received.some((label) => gift.test(label))).toBe(true);
    expect((await fields("airfryer")).some((label) => gift.test(label))).toBe(false);
    expect(common).toEqual(expect.arrayContaining([expect.stringMatching(/^Meio de pagamento/), expect.stringMatching(/^Garantia \(meses\)/)]));
  });
});

test.describe("Lojas pelo campo de link", () => {
  test.use({ viewport: { width: 1440, height: 1100 } });

  test("o link só vira outra loja no toque do +, sem botão de copiar nem trocar a principal", async ({ page }) => {
    const state = await mockApp(page);
    await openList(page);
    await page.locator('[data-item-id="sofa"] .item-title-button').click();
    const form = page.getByRole("form", { name: "Editar Sofá retrátil na lista" });
    await expect(form.getByRole("button", { name: /^Copiar link/ })).toHaveCount(0);
    const link = form.getByLabel("Link de outra loja", { exact: true });
    const add = form.getByRole("button", { name: "Adicionar outra loja", exact: true });
    await expect(link).toHaveValue("");
    await expect(add).toBeDisabled();
    // Mesma loja, produto diferente: é outra oferta.
    await link.fill("https://www.loja-a.example.com/sofa-2");
    await link.blur();
    expect(state.offerPosts).toEqual([]);
    await add.click();
    await expect(form.getByText("Loja adicionada.", { exact: false })).toBeVisible();
    expect(state.offerPosts).toEqual([{ url: "https://www.loja-a.example.com/sofa-2" }]);
    await expect(form.locator(".item-offer")).toHaveCount(2);
    await expect(link).toHaveValue("");
    expect(state.errors).toEqual([]);
  });

  test("com 3 lojas, o limite, o campo de link some", async ({ page }) => {
    await mockApp(page);
    await openList(page);
    await page.locator('[data-item-id="airfryer"] .item-title-button').click();
    const form = page.getByRole("form", { name: "Editar Air fryer na lista" });
    await expect(form.locator(".item-offer")).toHaveCount(3);
    await expect(form.getByPlaceholder("https://...")).toHaveCount(0);
    await expect(form.getByText("Este item já tem 3 lojas, o limite.", { exact: false })).toBeVisible();
  });
});
