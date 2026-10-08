import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { AdminUser } from "../src/types";

const sampleUsers: AdminUser[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Ana Oliveira",
    email: "ana@example.invalid",
    isActive: true,
    mustChangePassword: false,
    passwordResetExpiresAt: null,
    createdAt: "2026-09-20T12:00:00Z",
    lastLoginAt: "2026-10-01T12:00:00Z",
    workspaceCount: 2,
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Lucas Almeida",
    email: "lucas@example.invalid",
    isActive: false,
    mustChangePassword: false,
    passwordResetExpiresAt: null,
    createdAt: "2026-09-25T12:00:00Z",
    lastLoginAt: null,
    workspaceCount: 1,
  },
];
async function mockAdmin(page: Page) {
  let authenticated = false;
  const users = structuredClone(sampleUsers);
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path.endsWith("/login")) {
      const body = route.request().postDataJSON();
      if (body.password !== "SenhaAdminTeste123")
        return json(401, { error: "Login ou senha inválidos." });
      authenticated = true;
      return json(200, { login: "gestor" });
    }
    if (!authenticated)
      return json(401, { error: "Entre com seu acesso administrativo." });
    if (path.endsWith("/session")) return json(200, { login: "gestor" });
    if (path.endsWith("/logout")) {
      authenticated = false;
      return route.fulfill({ status: 204 });
    }
    if (path.endsWith("/users") && method === "GET")
      return json(200, { users });
    const user = users.find((user) => path.includes(user.id));
    if (!user) return json(404, { error: "Usuário não encontrado." });
    if (path.endsWith("/reset-password")) {
      user.mustChangePassword = true;
      user.passwordResetExpiresAt = "2030-10-02T12:00:00Z";
      return json(200, {
        temporaryPassword: "Larume-Teste1234",
        expiresAt: user.passwordResetExpiresAt,
      });
    }
    if (path.endsWith("/status")) {
      user.isActive = route.request().postDataJSON().isActive;
      return route.fulfill({ status: 204 });
    }
    return json(404, { error: "Não encontrado." });
  });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const width of [320, 390, 1440]) {
  test(`admin login, filters, reset, statuses and dialogs at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mockAdmin(page);
    await page.goto("/admin/login");
    await expect(
      page.getByRole("heading", { name: "Acesso administrativo." }),
    ).toBeVisible();
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByLabel("Login administrativo").fill("gestor");
    await page
      .getByLabel("Senha administrativa", { exact: true })
      .fill("incorreta");
    await page.getByRole("button", { name: "Entrar na gestão" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Login ou senha inválidos.",
    );
    await page
      .getByLabel("Senha administrativa", { exact: true })
      .fill("SenhaAdminTeste123");
    await page.getByRole("button", { name: "Entrar na gestão" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText("Ana Oliveira", { exact: true })).toBeVisible();
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `tmp/validation/admin-users-${width}.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: /^Inativos/ }).click();
    await expect(page.getByText("Ana Oliveira", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByText("Lucas Almeida", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Redefinir senha de lucas@example.invalid",
      }),
    ).toBeDisabled();
    await page.getByRole("button", { name: /^Todos/ }).click();
    await page.getByLabel("Buscar usuários").fill("ana@");
    await expect(page.getByText("Lucas Almeida", { exact: true })).toHaveCount(
      0,
    );
    await page
      .getByRole("button", { name: "Redefinir senha de ana@example.invalid" })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "Redefinir senha",
      exact: true,
    });
    await expect(
      dialog.getByRole("button", { name: "Cancelar" }),
    ).toBeFocused();
    await dialog
      .getByRole("button", { name: "Gerar senha temporária" })
      .click();
    dialog = page.getByRole("dialog", { name: "Senha temporária pronta" });
    await expect(
      dialog.getByLabel("Senha temporária", { exact: true }),
    ).toHaveValue("Larume-Teste1234");
    await expect(
      dialog.getByLabel("Senha temporária", { exact: true }),
    ).toBeFocused();
    await dialog.getByRole("button", { name: "Copiar senha" }).click();
    await expect(
      dialog.getByRole("button", { name: "Senha copiada" }),
    ).toBeVisible();
    await dialog.evaluate((element) =>
      Promise.all(
        element.getAnimations().map((animation) => animation.finished),
      ),
    );
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `tmp/validation/admin-reset-${width}.png`,
      fullPage: true,
    });
    await dialog.getByRole("button", { name: "Já copiei, concluir" }).click();
    await expect(
      page.getByLabel("Senha temporária", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Troca de senha pendente", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Desativar ana@example.invalid" })
      .click();
    dialog = page.getByRole("dialog", { name: "Desativar conta", exact: true });
    await dialog
      .getByRole("button", { name: "Desativar conta", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Reativar ana@example.invalid" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Reativar ana@example.invalid" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Reativar conta", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Redefinir senha de ana@example.invalid",
      }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Acesso administrativo." }),
    ).toBeVisible();
  });

  test(`temporary password requires a new password, including reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    let authenticated = false;
    let pending = true;
    let changes = 0;
    const bootstrap = () => ({
      user: {
        id: "test-user",
        name: "Ana",
        email: "ana@example.invalid",
        mustChangePassword: pending,
      },
      enxovais: [],
      activeEnxoval: null,
      categories: [],
      items: [],
      members: [],
    });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const json = (status: number, body: unknown) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (path === "/api/auth/login") {
        authenticated = true;
        return json(200, bootstrap());
      }
      if (path === "/api/bootstrap")
        return authenticated
          ? json(200, bootstrap())
          : json(401, { error: "Faça login." });
      if (path === "/api/auth/change-password") {
        changes++;
        pending = false;
        return json(200, bootstrap());
      }
      return json(404, { error: "Não encontrado." });
    });
    await page.goto("/login");
    await page.getByLabel("Seu e-mail").fill("ana@example.invalid");
    await page
      .getByLabel("Sua senha", { exact: true })
      .fill("TemporariaTeste123");
    await page.getByRole("button", { name: "Entrar no meu enxoval" }).click();
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(
      page.getByRole("heading", { name: "Defina sua nova senha." }),
    ).toBeVisible();
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: "Defina sua nova senha." }),
    ).toBeVisible();
    await noOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `tmp/validation/required-password-${width}.png`,
      fullPage: true,
    });
    await page
      .getByLabel("Nova senha", { exact: true })
      .fill("SenhaPessoalTeste123");
    await page.getByLabel("Confirme a nova senha").fill("DiferenteTeste123");
    await page
      .getByRole("button", { name: "Salvar senha e continuar" })
      .click();
    await expect(page.getByRole("alert")).toHaveText(
      "As senhas não coincidem.",
    );
    expect(changes).toBe(0);
    await page.getByLabel("Confirme a nova senha").fill("SenhaPessoalTeste123");
    await page
      .getByRole("button", { name: "Salvar senha e continuar" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Defina sua nova senha." }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(/\/app$/);
    expect(changes).toBe(1);
  });
}
