import { test, expect, type Page, type Route } from "@playwright/test";

/*
 * Entrar e criar conta (/login e /cadastro). Tudo com rotas simuladas: nenhuma conta real é usada.
 */

const SIZES = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 425, height: 800 },
  { width: 1366, height: 768 },
] as const;

const TECHNICAL_ERROR = "Ops, tropeçamos aqui. Tente de novo em instantes.";
const STRONG_PASSWORD = "Casa#Mia7xq";

async function open(page: Page, path: string, size: { width: number; height: number } = { width: 375, height: 667 }) {
  await page.setViewportSize(size);
  await page.addInitScript(() =>
    localStorage.setItem(
      "casamia:consent",
      JSON.stringify({ analytics: false, marketing: false, version: "2026-10", decidedAt: new Date().toISOString() }),
    ),
  );
  await page.route("**/api/bootstrap**", (route) => route.fulfill({ status: 401, json: { error: "Faça login." } }));
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("h1")).toBeVisible();
}

/*
 * Primeiro acesso, sem consentimento semeado. O aviso de cookies só existe em builds com VITE_POSTHOG_KEY ou
 * VITE_GTM_ID (consentRequired); no build comum o teste pula. Para rodar: VITE_POSTHOG_KEY=phc_medicao_local npm run build.
 * No celular o aviso é uma faixa compacta que reserva espaço no fim da página: o botão de envio precisa ficar
 * visível e clicável, sem ser coberto, depois de rolar se preciso.
 */
test.describe("primeiro acesso com o aviso de cookies", () => {
  for (const path of ["/login", "/cadastro"]) {
    for (const size of [SIZES[1], SIZES[0]]) {
      test(`${path} em ${size.width}x${size.height}: o aviso não cobre o botão de envio`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.route("**/api/bootstrap**", (route) => route.fulfill({ status: 401, json: { error: "Faça login." } }));
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("h1")).toBeVisible();
        test.skip((await page.locator(".consent-banner").count()) === 0, "build sem chave de análise: o aviso não aparece");
        // behavior instant: product.css usa scroll-behavior: smooth.
        const m = await page.locator("form button[type=submit]").evaluate((el) => {
          const banner = document.querySelector(".consent-banner")!;
          const bannerTop = () => banner.getBoundingClientRect().top;
          el.scrollIntoView({ block: "center", behavior: "instant" });
          const rect = el.getBoundingClientRect();
          if (rect.bottom > bannerTop() - 4) window.scrollBy({ top: rect.bottom - bannerTop() + 8, behavior: "instant" });
          const b = banner.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          const hit = document.elementFromPoint(cx, cy);
          const actions = [...banner.querySelectorAll(".consent-button")].map((x) => x.getBoundingClientRect());
          return {
            banner: { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) },
            button: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
            cx,
            cy,
            onButton: Boolean(hit && (el === hit || el.contains(hit))),
            covered: Boolean(hit?.closest(".consent-banner")),
            actionsInside: actions.length === 3 && actions.every((a) => a.top >= b.top && a.bottom <= b.bottom + 0.5),
          };
        });
        test.info().annotations.push({ type: "medida", description: JSON.stringify(m) });
        console.log(`medida ${path} ${size.width}x${size.height}`, JSON.stringify(m));
        expect(m.covered).toBe(false);
        expect(m.onButton).toBe(true);
        expect(m.button.bottom).toBeLessThanOrEqual(m.banner.top);
        expect(m.banner.height).toBeLessThanOrEqual(0.4 * size.height);
        expect(m.banner.bottom).toBeLessThanOrEqual(size.height);
        expect(m.actionsInside).toBe(true);
        // Clique real no centro medido: chega ao botão (validação do formulário) e não decide o consentimento.
        await page.mouse.click(m.cx, m.cy);
        await expect(page.getByText("Digite seu e-mail.")).toBeVisible();
        await expect(page.locator(".consent-banner")).toBeVisible();
      });
    }
  }
});

/** Segura a resposta do pedido até `release()`, para observar o estado de envio. */
function holdRequest(page: Page, url: string) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const seen: string[] = [];
  const ready = page.route(url, async (route: Route) => {
    seen.push(route.request().url());
    await gate;
    await route.fulfill({ status: 401, json: { error: "E-mail ou senha incorretos." } });
  });
  return { ready, release, seen };
}

const isCompact = (width: number) => width <= 1023;

test.describe("layout em quatro tamanhos", () => {
  for (const size of SIZES) {
    test(`/login e /cadastro cabem em ${size.width}x${size.height}`, async ({ page }) => {
      await open(page, "/login", size);
      const scrollWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
      expect(await scrollWidth()).toBeLessThanOrEqual(size.width);
      const loginButton = page.getByRole("button", { name: "Entrar no meu enxoval" });
      await expect(loginButton).toBeVisible();
      const loginBottom = await loginButton.evaluate((el) => el.getBoundingClientRect().bottom);
      expect(loginBottom, "botão de entrar inteiro na dobra").toBeLessThanOrEqual(size.height);

      await page.goto("/cadastro");
      await page.evaluate(() => document.fonts.ready);
      expect(await scrollWidth()).toBeLessThanOrEqual(size.width);
      const registerButton = page.getByRole("button", { name: "Criar minha conta" });
      await expect(registerButton).toBeVisible();
      const registerBottom = await registerButton.evaluate((el) => el.getBoundingClientRect().bottom);
      if (size.width === 320) {
        const note = `/cadastro em 320x568: base do botão em ${Math.round(registerBottom)}px (janela de ${size.height}px)`;
        test.info().annotations.push({ type: "medida", description: note });
        console.log(note);
      } else {
        expect(registerBottom, "botão de criar conta inteiro na dobra").toBeLessThanOrEqual(size.height);
      }
    });
  }
});

test.describe("aparência por faixa de tela", () => {
  for (const size of SIZES.filter((s) => isCompact(s.width))) {
    test(`até 1023px: sem caixa azul e sem cartão em ${size.width}x${size.height}`, async ({ page }) => {
      await open(page, "/login", size);
      const info = await page.evaluate(() => {
        const main = document.querySelector("main")!;
        const blue = [...main.querySelectorAll("*"), main].filter(
          (el) => getComputedStyle(el).backgroundColor === "rgb(36, 75, 102)",
        ).length;
        const door = getComputedStyle(document.querySelector(".auth-door")!);
        const card = getComputedStyle(document.querySelector(".auth-card")!);
        const shell = getComputedStyle(main);
        const form = document.querySelector("form")!.getBoundingClientRect();
        const arch = document.querySelector(".auth-nino-arch")!;
        const nino = document.querySelector<HTMLElement>(".auth-nino")!.getBoundingClientRect();
        return {
          blue,
          doorBg: door.backgroundColor,
          doorShadow: door.boxShadow,
          cardBg: card.backgroundColor,
          cardShadow: card.boxShadow,
          shellBg: shell.backgroundColor,
          formWidth: form.width,
          archDisplay: getComputedStyle(arch).display,
          ninoWidth: nino.width,
        };
      });
      expect(info.blue).toBe(0);
      expect(info.doorBg).toBe("rgba(0, 0, 0, 0)");
      expect(info.doorShadow).toBe("none");
      expect(info.cardBg).toBe("rgba(0, 0, 0, 0)");
      expect(info.cardShadow).toBe("none");
      expect(info.shellBg, "fundo opaco esconde os arcos do fundo").not.toBe("rgba(0, 0, 0, 0)");
      expect(Math.abs(info.formWidth - (size.width - 40))).toBeLessThanOrEqual(1);
      if (size.height <= 600) {
        expect(info.archDisplay).toBe("none");
      } else {
        expect(info.archDisplay).not.toBe("none");
        expect(Math.abs(info.ninoWidth - 72)).toBeLessThanOrEqual(2);
        await expect(page.locator(".auth-nino")).toBeVisible();
      }
    });
  }

  test("desktop: porta em arco com borda de 1,5px, Nino e arcos do fundo preservados", async ({ page }) => {
    await open(page, "/login", { width: 1366, height: 768 });
    const info = await page.evaluate(() => {
      const door = getComputedStyle(document.querySelector(".auth-door")!);
      return {
        radius: door.borderTopLeftRadius,
        border: door.borderTopWidth,
        borderColor: door.borderTopColor,
        bg: door.backgroundColor,
        shell: getComputedStyle(document.querySelector("main")!).backgroundColor,
      };
    });
    expect(info.radius).toBe("999px");
    // A borda é de 1,5px no CSS; a 1x de densidade o navegador a arredonda para 1px no valor calculado.
    expect(["1px", "1.5px"]).toContain(info.border);
    expect(info.borderColor).toBe("rgb(216, 201, 179)");
    expect(info.bg).not.toBe("rgb(36, 75, 102)");
    expect(info.shell).toBe("rgba(0, 0, 0, 0)");
    await expect(page.locator(".auth-nino")).toBeVisible();
  });
});

test.describe("troca entre entrar e criar conta", () => {
  for (const size of SIZES) {
    test(`mantém e-mail, topo do título e foco em ${size.width}x${size.height}`, async ({ page }) => {
      await open(page, "/login", size);
      expect(await page.getByRole("tab").count()).toBe(0);
      await page.getByLabel("Seu e-mail").fill("pessoa@exemplo.com");
      await page.getByLabel("Sua senha", { exact: true }).fill("alguma-senha");
      const top = () => page.locator("h1").evaluate((el) => el.getBoundingClientRect().top);
      const before = await top();

      await page.getByRole("link", { name: "Criar conta", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Crie sua conta." })).toBeFocused();
      await expect(page).toHaveURL(/\/cadastro$/);
      await expect(page).toHaveTitle("Crie sua conta | Casa Mia");
      await expect(page.getByLabel("Seu e-mail")).toHaveValue("pessoa@exemplo.com");
      expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(0.5);
      expect(await page.getByRole("tab").count()).toBe(0);

      await page.getByLabel("Seu e-mail").fill("outra@exemplo.com");
      await page.getByRole("link", { name: "Entre por aqui" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Entre, a casa é sua." })).toBeFocused();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page).toHaveTitle("Entre, a casa é sua | Casa Mia");
      await expect(page.getByLabel("Seu e-mail")).toHaveValue("outra@exemplo.com");
      await expect(page.getByLabel("Sua senha", { exact: true })).toHaveValue("");
      expect(Math.abs((await top()) - before)).toBeLessThanOrEqual(0.5);
    });
  }

  test("/cadastro abre direto no modo de criar conta", async ({ page }) => {
    await open(page, "/cadastro");
    await expect(page.getByRole("heading", { level: 1, name: "Crie sua conta." })).toBeVisible();
    await expect(page).toHaveTitle("Crie sua conta | Casa Mia");
    await expect(page.getByRole("button", { name: "Criar minha conta" })).toBeVisible();
  });

  test("o link de troca é um link de verdade, com href para o outro modo", async ({ page }) => {
    await open(page, "/login");
    await expect(page.getByRole("link", { name: "Criar conta", exact: true })).toHaveAttribute("href", "/cadastro");
    await page.goto("/cadastro");
    await expect(page.getByRole("link", { name: "Entre por aqui" })).toHaveAttribute("href", "/login");
  });
});

test.describe("teclado e alvos de toque", () => {
  test("ao trocar de modo pelo teclado, o título focado não ganha linha de foco", async ({ page }) => {
    await open(page, "/login", { width: 1366, height: 768 });
    const link = page.getByRole("link", { name: "Criar conta", exact: true });
    await link.focus();
    await page.keyboard.press("Enter");
    const heading = page.getByRole("heading", { level: 1, name: "Crie sua conta." });
    await expect(heading).toBeFocused();
    const style = await heading.evaluate((el) => {
      const s = getComputedStyle(el);
      return { shadow: s.boxShadow, outlineStyle: s.outlineStyle, outlineWidth: s.outlineWidth };
    });
    expect(style.shadow).toBe("none");
    expect(style.outlineStyle === "none" || style.outlineWidth === "0px").toBe(true);
  });

  test("a ordem do Tab segue e-mail, senha, mostrar senha, esqueci minha senha, entrar", async ({ page }) => {
    await open(page, "/login");
    await page.locator("#auth-email").focus();
    await page.keyboard.press("Tab");
    await expect(page.locator("#auth-password")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Mostrar senha" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Esqueci minha senha" })).toBeFocused();
    await page.keyboard.press("Tab");
    const submit = page.getByRole("button", { name: "Entrar no meu enxoval" });
    await expect(submit).toBeFocused();
    // A sombra do botão não pode apagar a linha interna de foco.
    expect(await submit.evaluate((el) => getComputedStyle(el).boxShadow)).toContain("inset");
  });

  test("Esqueci minha senha leva o e-mail digitado pela sessão", async ({ page }) => {
    await open(page, "/login");
    await page.getByLabel("Seu e-mail").fill("pessoa@exemplo.com");
    await page.getByRole("link", { name: "Esqueci minha senha" }).click();
    await expect(page).toHaveURL(/\/esqueci-senha$/);
    await expect(page.getByLabel(/e-mail/i).first()).toHaveValue("pessoa@exemplo.com");
  });

  for (const size of [SIZES[0], SIZES[1]]) {
    test(`alvos de pelo menos 44px em ${size.width}x${size.height}`, async ({ page }) => {
      await open(page, "/login", size);
      const targets = [
        page.getByRole("button", { name: "Mostrar senha" }),
        page.getByRole("link", { name: "Esqueci minha senha" }),
        page.getByRole("link", { name: "Criar conta", exact: true }),
        page.getByRole("button", { name: "Entrar no meu enxoval" }),
        page.getByRole("link", { name: "Voltar ao início" }),
      ];
      for (const target of targets) {
        const box = await target.boundingBox();
        expect(box, await target.innerText().catch(() => "alvo")).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      const field = await page.locator("#auth-email").evaluate((el) => {
        const style = getComputedStyle(el);
        return { height: el.getBoundingClientRect().height, radius: style.borderTopLeftRadius };
      });
      expect(field).toEqual({ height: 48, radius: "10px" });

      await page.goto("/cadastro");
      const toLogin = await page.getByRole("link", { name: "Entre por aqui" }).boundingBox();
      expect(toLogin!.width).toBeGreaterThanOrEqual(44);
      expect(toLogin!.height).toBeGreaterThanOrEqual(44);
      const toggle = await page.getByRole("button", { name: "Mostrar senha" }).boundingBox();
      expect(toggle!.width).toBeGreaterThanOrEqual(44);
      expect(toggle!.height).toBeGreaterThanOrEqual(44);
    });
  }
});

test.describe("validação dentro da interface", () => {
  test("login: mensagens junto do campo, sem balão nativo e sem pedido à rede", async ({ page }) => {
    await open(page, "/login");
    let requests = 0;
    await page.route("**/api/auth/login", (route) => {
      requests += 1;
      return route.fulfill({ status: 401, json: { error: "x" } });
    });
    expect(await page.locator("form").evaluate((form: HTMLFormElement) => form.noValidate)).toBe(true);
    const email = page.getByLabel("Seu e-mail");
    const submit = page.getByRole("button", { name: "Entrar no meu enxoval" });

    await submit.click();
    await expect(page.getByText("Digite seu e-mail.")).toBeVisible();
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    const describedBy = await email.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(page.locator(`#${describedBy}`)).toHaveText("Digite seu e-mail.");

    await email.fill("nome");
    await expect(email).not.toHaveAttribute("aria-invalid", "true");
    await submit.click();
    await expect(page.getByText("Confira o e-mail: use o formato nome@exemplo.com.")).toBeVisible();

    await email.fill("nome@exemplo.com");
    await submit.click();
    await expect(page.getByText("Digite sua senha.")).toBeVisible();
    const password = page.locator("#auth-password");
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute("aria-invalid", "true");
    expect(requests).toBe(0);
  });

  test("a mensagem do campo é uma região viva, mesmo com o campo já focado (Enter)", async ({ page }) => {
    await open(page, "/login");
    const email = page.getByLabel("Seu e-mail");
    const alertBox = page.locator("#auth-email-error");
    // Sempre montada e vazia antes do envio; vazia não ocupa espaço nem é lida.
    await expect(alertBox).toHaveAttribute("role", "alert");
    await expect(alertBox).toBeEmpty();
    await expect(alertBox).toBeHidden();
    await email.fill("nome");
    await email.focus();
    await page.keyboard.press("Enter");
    // O campo já tinha o foco, então focus() não anuncia nada: quem anuncia é a região viva.
    await expect(page.getByRole("alert").filter({ hasText: "Confira o e-mail" })).toBeVisible();
    await expect(alertBox).toHaveText("Confira o e-mail: use o formato nome@exemplo.com.");
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-describedby", "auth-email-error");
    await expect(email).toHaveAttribute("aria-invalid", "true");
  });

  test("login aceita e-mail sem ponto no domínio; o cadastro recusa", async ({ page }) => {
    await open(page, "/login");
    let loginRequests = 0;
    await page.route("**/api/auth/login", (route) => {
      loginRequests += 1;
      return route.fulfill({ status: 401, json: { error: "E-mail ou senha incorretos." } });
    });
    await page.getByLabel("Seu e-mail").fill("a@b");
    await page.getByLabel("Sua senha", { exact: true }).fill("qualquer");
    await page.getByRole("button", { name: "Entrar no meu enxoval" }).click();
    await expect(page.getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
    expect(loginRequests).toBe(1);

    await page.getByRole("link", { name: "Criar conta", exact: true }).click();
    let registerRequests = 0;
    await page.route("**/api/auth/register", (route) => {
      registerRequests += 1;
      return route.fulfill({ status: 400, json: { error: "x" } });
    });
    await page.locator("#register-password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    await expect(page.getByText("Confira o e-mail: use o formato nome@exemplo.com.")).toBeVisible();
    await expect(page.getByLabel("Seu e-mail")).toBeFocused();
    expect(registerRequests).toBe(0);
  });

  test("cadastro: senha fraca mostra a mensagem da política junto do campo", async ({ page }) => {
    await open(page, "/cadastro");
    await page.getByLabel("Seu e-mail").fill("pessoa@exemplo.com");
    await page.locator("#register-password").fill("abc");
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    const password = page.locator("#register-password");
    await expect(password).toBeFocused();
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#register-password-error")).toContainText("A senha precisa ter pelo menos 8 caracteres");
    await expect(password).toHaveAttribute("aria-describedby", /register-password-error/);
    await expect(password).toHaveAttribute("aria-describedby", /register-password-hint/);
  });

  test("campo com erro usa a cor de erro na borda e sem anel de foco", async ({ page }) => {
    await open(page, "/login");
    await page.getByRole("button", { name: "Entrar no meu enxoval" }).click();
    const read = () =>
      page.locator("#auth-email").evaluate((el) => {
        const s = getComputedStyle(el);
        return { border: s.borderTopColor, shadow: s.boxShadow };
      });
    // A borda transita em 0,2s: espera o valor final.
    await expect.poll(async () => (await read()).border).toBe("rgb(180, 35, 24)");
    expect((await read()).shadow).toBe("none");
  });
});

test.describe("envio e falhas", () => {
  test("login: o botão mostra Entrando… e um duplo clique gera um único pedido", async ({ page }) => {
    await open(page, "/login");
    const held = holdRequest(page, "**/api/auth/login");
    await held.ready;
    await page.getByLabel("Seu e-mail").fill("pessoa@exemplo.com");
    await page.getByLabel("Sua senha", { exact: true }).fill("alguma-senha");
    await page.getByRole("button", { name: "Entrar no meu enxoval" }).dblclick();
    const busy = page.getByRole("button", { name: "Entrando…" });
    await expect(busy).toBeVisible();
    await expect(busy).toHaveAttribute("aria-busy", "true");
    expect(held.seen.length).toBe(1);
    held.release();
    await expect(page.getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
    expect(held.seen.length).toBe(1);
    await expect(page.getByRole("button", { name: "Entrar no meu enxoval" })).toHaveAttribute("aria-busy", "false");
  });

  test("cadastro: o botão mostra Criando sua conta… e um duplo clique gera um único pedido", async ({ page }) => {
    await open(page, "/cadastro");
    const held = holdRequest(page, "**/api/auth/register");
    await held.ready;
    await page.getByLabel("Seu e-mail").fill("pessoa@exemplo.com");
    await page.locator("#register-password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: "Criar minha conta" }).dblclick();
    const busy = page.getByRole("button", { name: "Criando sua conta…" });
    await expect(busy).toBeVisible();
    await expect(busy).toHaveAttribute("aria-busy", "true");
    expect(held.seen.length).toBe(1);
    held.release();
    await expect(page.getByRole("alert")).toBeVisible();
    expect(held.seen.length).toBe(1);
  });

  for (const failure of ["queda de rede", "500", "503"] as const) {
    test(`falha técnica (${failure}) mostra só a mensagem da marca`, async ({ page }) => {
      await open(page, "/login");
      await page.route("**/api/auth/login", (route) => {
        if (failure === "queda de rede") return route.abort();
        const status = Number(failure);
        return route.fulfill({ status, json: { error: "Detalhe interno que não deve aparecer" } });
      });
      await page.getByLabel("Seu e-mail").fill("pessoa@exemplo.com");
      await page.getByLabel("Sua senha", { exact: true }).fill("alguma-senha");
      await page.getByRole("button", { name: "Entrar no meu enxoval" }).click();
      const alert = page.getByRole("alert");
      await expect(alert).toHaveText(TECHNICAL_ERROR);
      await expect(page.locator("body")).not.toContainText("Failed to fetch");
      await expect(page.locator("body")).not.toContainText("Detalhe interno");
    });
  }

  test("401 do login mostra a mensagem do servidor", async ({ page }) => {
    await open(page, "/login");
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ status: 401, json: { error: "E-mail ou senha incorretos." } }),
    );
    await page.getByLabel("Seu e-mail").fill("pessoa@exemplo.com");
    await page.getByLabel("Sua senha", { exact: true }).fill("alguma-senha");
    await page.getByRole("button", { name: "Entrar no meu enxoval" }).click();
    await expect(page.getByRole("alert")).toHaveText("E-mail ou senha incorretos.");
  });

  test("409 do cadastro mostra o texto neutro, sem confirmar que a conta existe", async ({ page }) => {
    await open(page, "/cadastro");
    await page.route("**/api/auth/register", (route) =>
      route.fulfill({ status: 409, json: { error: "Já existe uma conta com esse e-mail." } }),
    );
    await page.getByLabel("Seu e-mail").fill("pessoa@exemplo.com");
    await page.locator("#register-password").fill(STRONG_PASSWORD);
    await page.getByRole("button", { name: "Criar minha conta" }).click();
    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Não foi possível criar a conta com esse e-mail.");
    await expect(alert).not.toContainText("Já existe");
  });
});

test.describe("cadastro", () => {
  test("não tem campo de confirmação; dica e regras da senha acompanham o foco", async ({ page }) => {
    await open(page, "/cadastro");
    await expect(page.getByLabel("Confirme a senha")).toHaveCount(0);
    await expect(page.locator("#register-password-confirmation")).toHaveCount(0);
    const rules = page.getByRole("list", { name: "Requisitos da senha" });
    const hint = page.getByText("Com letras, números e um caractere especial.");
    await expect(hint).toBeVisible();
    await expect(rules).toHaveCount(0);
    await expect(page.locator("#register-password")).toHaveAttribute("aria-describedby", "register-password-hint");

    await page.locator("#register-password").focus();
    await expect(rules).toBeVisible();
    await expect(hint).toHaveCount(0);

    // Com senha digitada, as regras seguem abertas mesmo sem foco.
    await page.locator("#register-password").fill("abc");
    await page.getByLabel("Seu e-mail").focus();
    await page.waitForTimeout(400);
    await expect(rules).toBeVisible();

    // Vazia e sem foco, a dica volta.
    await page.locator("#register-password").fill("");
    await page.getByLabel("Seu e-mail").focus();
    await page.waitForTimeout(400);
    await expect(rules).toHaveCount(0);
    await expect(hint).toBeVisible();
  });

  test("a caixa de e-mails começa desmarcada e o clique nela vale com a senha focada", async ({ page }) => {
    await open(page, "/cadastro");
    const optin = page.getByRole("checkbox");
    await expect(optin).not.toBeChecked();
    await page.locator("#register-password").focus();
    await optin.click();
    await expect(optin).toBeChecked();
  });

  test("a caixa de e-mails mostra foco visível ao chegar pelo Tab", async ({ page }) => {
    await open(page, "/cadastro");
    const box = page.locator(".auth-optin");
    const shadow = () => box.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(await shadow()).toBe("none");
    await page.locator("#register-password").focus();
    await page.keyboard.press("Tab"); // mostrar senha
    await page.keyboard.press("Tab"); // caixa de e-mails
    await expect(page.getByRole("checkbox")).toBeFocused();
    // Linha interna de 2px em terracota profundo, sem anel afastado.
    expect(await shadow()).toBe("rgb(163, 76, 48) 0px 0px 0px 2px inset");
    expect(await box.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
  });

  for (const marketing of [false, true]) {
    test(`o pedido leva emailMarketing=${marketing}`, async ({ page }) => {
      await open(page, "/cadastro");
      let body: Record<string, unknown> = {};
      await page.route("**/api/auth/register", (route) => {
        body = route.request().postDataJSON();
        return route.fulfill({ status: 400, json: { error: "Recusado de propósito." } });
      });
      await page.getByLabel("Seu e-mail").fill("pessoa@exemplo.com");
      await page.locator("#register-password").fill(STRONG_PASSWORD);
      if (marketing) await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Criar minha conta" }).click();
      await expect(page.getByRole("alert")).toHaveText("Recusado de propósito.");
      expect(body.emailMarketing).toBe(marketing);
    });
  }

  test("textos, aviso de cobrança e texto legal colado ao botão", async ({ page }) => {
    await open(page, "/cadastro");
    const h1 = page.getByRole("heading", { level: 1, name: "Crie sua conta." });
    await expect(h1).toBeVisible();
    expect(await h1.innerText()).not.toMatch(/gr[áa]tis/i);
    await expect(
      page.getByText("Depois você escolhe: Passe de R$ 99 ou Mensal com 2 dias grátis, com cartão.", { exact: true }),
    ).toBeVisible();

    const legal = page.locator(".auth-legal");
    // O aviso "(abre em nova aba)" é só para leitores de tela.
    const visibleText = await legal.evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll(".sr-only").forEach((node) => node.remove());
      return clone.textContent;
    });
    expect(visibleText).toBe(
      "Ao criar a conta, você concorda com os Termos de Uso e confirma que leu a Política de Privacidade.",
    );
    for (const [name, href] of [
      ["Termos de Uso", "/termos"],
      ["Política de Privacidade", "/privacidade"],
    ] as const) {
      const link = legal.getByRole("link", { name: new RegExp(name) });
      await expect(link).toHaveAttribute("href", href);
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
    // O texto legal vem imediatamente antes do botão.
    const adjacent = await legal.evaluate((el) => el.nextElementSibling?.matches("button[type=submit]") ?? false);
    expect(adjacent).toBe(true);

    expect(await page.getByRole("link", { name: "Entre por aqui" }).innerText()).not.toMatch(/gr[áa]tis/i);
  });

  test("o login não tem aviso de teste nem a palavra grátis no link de troca", async ({ page }) => {
    await open(page, "/login");
    await expect(page.locator("body")).not.toContainText("Teste completo");
    const link = page.getByRole("link", { name: "Criar conta", exact: true });
    await expect(link).toBeVisible();
    expect(await link.innerText()).not.toMatch(/gr[áa]tis/i);
    await expect(page.getByText("Ainda não tem conta?")).toBeVisible();
  });
});

test.describe("contraste", () => {
  /** Converte qualquer cor CSS (inclusive oklab) para RGB pelo canvas e calcula a razão de contraste. */
  async function installContrast(page: Page) {
    await page.evaluate(() => {
      const toRgba = (css: string): [number, number, number, number] => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      };
      const lum = ([r, g, b]: number[]) => {
        const c = [r, g, b].map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const ratio = (a: number[], b: number[]) => {
        const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
        return (hi + 0.05) / (lo + 0.05);
      };
      const surface = (el: Element | null): number[] => {
        for (let node = el; node; node = node.parentElement) {
          const [r, g, b, a] = toRgba(getComputedStyle(node).backgroundColor);
          if (a > 0.99) return [r, g, b];
        }
        return [255, 255, 255];
      };
      (window as any).__contrast = {
        text(selector: string) {
          const el = document.querySelector(selector)!;
          return ratio(toRgba(getComputedStyle(el).color), surface(el));
        },
        border(selector: string) {
          const el = document.querySelector(selector)!;
          const line = toRgba(getComputedStyle(el).borderTopColor);
          return { onParent: ratio(line, surface(el.parentElement)), onField: ratio(line, surface(el)) };
        },
      };
    });
  }
  const text = (page: Page, selector: string) => page.evaluate((s) => (window as any).__contrast.text(s) as number, selector);
  const border = (page: Page, selector: string) =>
    page.evaluate((s) => (window as any).__contrast.border(s) as { onParent: number; onField: number }, selector);

  for (const size of [SIZES[1], SIZES[3]]) {
    test(`login em ${size.width}px: texto 4,5:1 e borda 3:1`, async ({ page }) => {
      await open(page, "/login", size);
      await installContrast(page);
      for (const selector of [".auth-heading p", ".auth-switch-link", ".auth-forgot", ".auth-footnote", ".auth-back"]) {
        expect(await text(page, selector), selector).toBeGreaterThanOrEqual(4.5);
      }
      const line = await border(page, "#auth-email");
      expect(line.onParent).toBeGreaterThanOrEqual(3);
      expect(line.onField).toBeGreaterThanOrEqual(3);

      await page.locator("#auth-email").focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Shift+Tab");
      // A borda transita em 0,2s: espera o terracota profundo final antes de medir.
      await expect
        .poll(() => page.locator("#auth-email").evaluate((el) => getComputedStyle(el).borderTopColor))
        .toBe("rgb(163, 76, 48)");
      const focused = await border(page, "#auth-email");
      expect(focused.onParent).toBeGreaterThanOrEqual(3);

      await page.getByRole("button", { name: "Entrar no meu enxoval" }).click();
      await page.waitForSelector(".auth-hint.is-error");
      expect(await text(page, ".auth-hint.is-error")).toBeGreaterThanOrEqual(4.5);
    });

    test(`cadastro em ${size.width}px: aviso, legal e links com 4,5:1`, async ({ page }) => {
      await open(page, "/cadastro", size);
      await installContrast(page);
      for (const selector of [".auth-billing span", ".auth-legal", ".auth-legal a", ".auth-hint", ".auth-switch-link", ".auth-optin span"]) {
        expect(await text(page, selector), selector).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

test.describe("movimento reduzido", () => {
  test("o Nino, as transições e o spinner ficam parados", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/login", { width: 1366, height: 768 });
    const held = holdRequest(page, "**/api/auth/login");
    await held.ready;
    const css = await page.evaluate(() => ({
      nino: getComputedStyle(document.querySelector(".auth-nino")!).animationName,
      input: getComputedStyle(document.querySelector("#auth-email")!).transitionDuration,
      back: getComputedStyle(document.querySelector(".auth-back svg")!).transitionDuration,
    }));
    expect(css.nino).toBe("none");
    expect(css.input).toBe("0s");
    expect(css.back).toBe("0s");
    await page.getByLabel("Seu e-mail").fill("pessoa@exemplo.com");
    await page.getByLabel("Sua senha", { exact: true }).fill("alguma-senha");
    await page.getByRole("button", { name: "Entrar no meu enxoval" }).click();
    await expect(page.getByRole("button", { name: "Entrando…" })).toBeVisible();
    // O spinner gira por JavaScript (motion); com movimento reduzido ele não pode girar.
    const spinner = page.locator("button[aria-busy=true] svg").first();
    const first = await spinner.evaluate((el) => el.getAttribute("style") ?? "");
    await page.waitForTimeout(400);
    expect(await spinner.evaluate((el) => el.getAttribute("style") ?? "")).toBe(first);
    held.release();
  });
});

test.describe("telas que compartilham .auth-form", () => {
  test("esqueci a senha e login do admin mantêm o campo de 49px e raio de 7px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript(() =>
      localStorage.setItem(
        "casamia:consent",
        JSON.stringify({ analytics: false, marketing: false, version: "2026-10", decidedAt: new Date().toISOString() }),
      ),
    );
    await page.route("**/api/bootstrap**", (route) => route.fulfill({ status: 401, json: { error: "Faça login." } }));
    for (const path of ["/esqueci-senha", "/admin/login"]) {
      await page.goto(path);
      const input = page.locator("input").first();
      await expect(input).toBeVisible();
      const box = await input.evaluate((el) => {
        const s = getComputedStyle(el);
        return { height: el.getBoundingClientRect().height, radius: s.borderTopLeftRadius };
      });
      expect(box, path).toEqual({ height: 49, radius: "7px" });
      // A cor da borda no foco também não muda (a transição de 0,2s termina antes de medir).
      await input.focus();
      await expect
        .poll(() => input.evaluate((el) => getComputedStyle(el).borderTopColor), { message: path })
        .toBe("rgb(163, 76, 48)");
    }
  });

  test("/preferencias (API simulada) mantém as caixas de e-mail como antes", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript(() =>
      localStorage.setItem(
        "casamia:consent",
        JSON.stringify({ analytics: false, marketing: false, version: "2026-10", decidedAt: new Date().toISOString() }),
      ),
    );
    await page.route("**/api/bootstrap**", (route) => route.fulfill({ status: 401, json: { error: "Faça login." } }));
    await page.route("**/api/preferences**", (route) =>
      route.fulfill({ json: { email: "ana@example.invalid", subscribed: true, reminders: true, tips: false, pausedUntil: null } }),
    );
    await page.goto("/preferencias?token=teste");
    const boxes = page.locator(".auth-optin");
    await expect(boxes).toHaveCount(2);
    const read = () =>
      boxes.first().evaluate((el) => {
        const s = getComputedStyle(el);
        return { shadow: s.boxShadow, margin: s.margin, padding: s.padding };
      });
    const before = await read();
    await page.locator(".auth-optin input").first().focus();
    // Fora de .auth-shell, a regra de foco do cadastro não vale: o rótulo não muda.
    expect(await read()).toEqual(before);
    expect(before.margin).toBe("0px");
  });
});
