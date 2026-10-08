// Real PostgreSQL integration test. Uses a new disposable schema, never existing accounts.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { getPool } from "../server/database.ts";
import { migrateDatabase } from "../server/migrations.ts";
import { registerApiRoutes } from "../server/routes.ts";
import { verifyPassword } from "../server/security.ts";

if (!process.env.DATABASE_URL)
  throw new Error("Configure DATABASE_URL para o teste PostgreSQL.");
const originalUrl = new URL(process.env.DATABASE_URL);
const sslMode = originalUrl.searchParams.get("sslmode");
const ssl =
  process.env.DATABASE_SSL === "true" ||
  (process.env.DATABASE_SSL !== "false" &&
    ["require", "verify-full"].includes(sslMode));
const control = new pg.Pool({
  connectionString: originalUrl.toString(),
  ssl: ssl ? { rejectUnauthorized: false } : undefined,
});
const schema = `larume_admin_test_${randomUUID().replaceAll("-", "")}`;
let server;
let created = false;
try {
  await control.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  originalUrl.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = originalUrl.toString();
  process.env.COOKIE_SECURE = "false";
  process.env.ADMIN_LOGIN = "gestor-teste";
  process.env.ADMIN_PASSWORD = randomBytes(24).toString("base64url");
  await migrateDatabase();
  // Re-running migrations must preserve the newly added flags.
  await migrateDatabase();
  const app = express();
  app.use(express.json());
  registerApiRoutes(app);
  server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  function agent() {
    let cookie = "";
    return {
      get cookie() {
        return cookie;
      },
      async call(path, method = "GET", body, extraHeaders = {}) {
        const response = await fetch(`${base}/api${path}`, {
          method,
          headers: {
            "Content-Type": "application/json",
            Cookie: cookie,
            ...extraHeaders,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const setCookie = response.headers
          .getSetCookie()
          .find((value) =>
            value.startsWith(
              path.startsWith("/admin")
                ? "larume_admin_session="
                : "enxoval_session=",
            ),
          );
        if (setCookie) cookie = setCookie.split(";")[0];
        return {
          status: response.status,
          data: response.status === 204 ? undefined : await response.json(),
        };
      },
    };
  }
  /** O cadastro só existe pelo funil: plano e respostas válidos. */
  const funnelProfile = {
    moment: "casal",
    moveDate: null,
    moveDateAnswered: true,
    state: "SP",
    housing: "apartamento",
    people: 2,
    rooms: ["cozinha", "banheiro"],
    owned: "nada",
    style: "full",
    budget: "unknown",
    worries: [],
    usage: [],
    source: "",
  };
  const funnelBody = (name, email, password, overrides = {}) => ({
    name,
    email,
    password,
    enxovalName: "Nossa casa nova",
    plan: {
      categories: [
        { name: "Cozinha", items: [{ name: "Panela", description: "Essencial" }] },
      ],
    },
    profile: funnelProfile,
    ...overrides,
  });
  // Registra pelo funil e remove o enxoval inicial, para não alterar as contagens dos testes seguintes.
  const registerViaFunnel = async (who, name, email, password) => {
    const result = await who.call("/auth/register", "POST", funnelBody(name, email, password));
    if (result.status === 201) {
      await getPool().query("DELETE FROM enxovais WHERE owner_id = $1", [result.data.user.id]);
    }
    return result;
  };
  const admin = agent();
  const customer = agent();
  const outsider = agent();
  const adminPassword = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  assert.equal(
    (
      await admin.call("/admin/login", "POST", {
        login: "gestor-teste",
        password: adminPassword,
      })
    ).status,
    503,
  );
  process.env.ADMIN_PASSWORD = adminPassword;
  assert.equal(
    (
      await admin.call("/admin/login", "POST", {
        login: "gestor-teste",
        password: "incorreta",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await admin.call("/admin/login", "POST", {
        login: "gestor-teste",
        password: adminPassword,
      })
    ).status,
    200,
  );
  assert.equal((await admin.call("/admin/session")).status, 200);
  const originalPassword = randomBytes(16).toString("base64url");
  const email = "cliente@example.invalid";
  const signup = await registerViaFunnel(customer, "Cliente Teste", email, originalPassword);
  assert.equal(signup.status, 201);
  const id = signup.data.user.id;
  {
    // O cadastro só existe pelo funil: respostas validadas por completo e gravadas em enxovais.onboarding_profile.
    const funnel = agent();
    const good = {
      ...funnelProfile,
      moveDate: "2026-12-01",
      state: "SP",
      rooms: ["cozinha", "sala", "banheiro"],
      owned: "algumas",
      style: "min",
      budget: "10-25",
      worries: ["budget", "budget"],
      usage: ["buy", "share"],
      source: "instagram",
    };
    const registered = await funnel.call(
      "/auth/register",
      "POST",
      funnelBody("Funil Teste", "funil@example.invalid", randomBytes(16).toString("base64url"), {
        enxovalName: "Casa de Funil",
        // O nome vai para users.name; campos fora do perfil (como cpf) são ignorados.
        profile: { ...good, name: "Funil Teste", cpf: "000.000.000-00" },
      }),
    );
    assert.equal(registered.status, 201);
    const stored = (
      await getPool().query(
        "SELECT onboarding_profile FROM enxovais WHERE owner_id = $1",
        [registered.data.user.id],
      )
    ).rows[0].onboarding_profile;
    assert.deepEqual(stored, {
      v: 1,
      moment: "casal",
      moveDate: "2026-12-01",
      moveDateAnswered: true,
      state: "SP",
      housing: "apartamento",
      people: 2,
      rooms: ["cozinha", "sala", "banheiro"],
      owned: "algumas",
      style: "min",
      budget: "10-25",
      worries: ["budget"],
      usage: ["buy", "share"],
      source: "instagram",
    });
    assert.ok(!JSON.stringify(registered.data).includes("onboarding_profile"));

    // Sem funil, ou com qualquer resposta ou plano inválido, o cadastro é recusado e nada é criado.
    const count = async () =>
      (await getPool().query("SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM enxovais)::int AS enxovais, (SELECT count(*) FROM items)::int AS items")).rows[0];
    const before = await count();
    const base = () =>
      funnelBody("Rejeitado", "rejeitado@example.invalid", randomBytes(16).toString("base64url"));
    const rejections = [
      ["cadastro direto, sem o funil", () => {
        const { plan, profile, enxovalName, ...direct } = base();
        return direct;
      }],
      ["sem respostas", () => ({ ...base(), profile: undefined })],
      ["sem plano", () => ({ ...base(), plan: undefined })],
      ["plano sem itens", () => ({ ...base(), plan: { categories: [{ name: "Sala", items: [] }] } })],
      ["momento inválido", () => ({ ...base(), profile: { ...funnelProfile, moment: "marte" } })],
      ["estado inválido", () => ({ ...base(), profile: { ...funnelProfile, state: "ZZ" } })],
      ["moradores demais", () => ({ ...base(), profile: { ...funnelProfile, people: 99 } })],
      ["data inexistente", () => ({ ...base(), profile: { ...funnelProfile, moveDate: "2026-02-31" } })],
      ["data não respondida", () => ({ ...base(), profile: { ...funnelProfile, moveDateAnswered: false } })],
      ["espaço inexistente", () => ({ ...base(), profile: { ...funnelProfile, rooms: ["cozinha", "inexistente"] } })],
      ["nenhum espaço", () => ({ ...base(), profile: { ...funnelProfile, rooms: [] } })],
      ["preocupação inválida", () => ({ ...base(), profile: { ...funnelProfile, worries: ["budget", "nao-existe"] } })],
      ["estilo ausente", () => ({ ...base(), profile: { ...funnelProfile, style: undefined } })],
    ];
    for (const [label, build] of rejections) {
      const result = await agent().call("/auth/register", "POST", build());
      assert.equal(result.status, 400, label);
    }
    assert.deepEqual(await count(), before, "nenhum cadastro recusado deixa rastro");

    // Remove a conta do bloco para não alterar as contagens dos testes seguintes.
    await getPool().query("DELETE FROM users WHERE id = $1", [registered.data.user.id]);
  }
  const workspace = (
    await customer.call("/enxovais", "POST", {
      name: "Lista preservada",
      useDefaultTemplate: false,
    })
  ).data;
  const item = (
    await customer.call("/items", "POST", {
      name: "Toalha preservada",
      enxovalId: workspace.enxoval.id,
      categoryName: "Banheiro",
    })
  ).data.item;
  assert.ok(item.id);
  assert.equal((await outsider.call("/admin/users")).status, 401);
  assert.equal((await customer.call("/admin/users")).status, 401);
  const listing = await admin.call("/admin/users");
  assert.equal(listing.status, 200);
  assert.equal(listing.data.users.length, 1);
  assert.equal(listing.data.users[0].isActive, true);
  assert.equal(listing.data.users[0].workspaceCount, 1);
  assert.equal(Object.hasOwn(listing.data.users[0], "password_hash"), false);
  assert.equal(
    (await outsider.call(`/admin/users/${id}/reset-password`, "POST")).status,
    401,
  );
  assert.equal(
    (await customer.call(`/admin/users/${id}/reset-password`, "POST")).status,
    401,
  );
  assert.equal(
    (await admin.call("/admin/users/not-an-id/reset-password", "POST")).status,
    404,
  );
  assert.equal(
    (
      await admin.call(
        `/admin/users/${id}/reset-password`,
        "POST",
        {},
        { Origin: "https://other.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await admin.call(
        `/admin/users/${id}/reset-password`,
        "POST",
        {},
        { "Content-Type": "text/plain" },
      )
    ).status,
    415,
  );
  console.log(
    "PASS: gestão restrita ao admin, configuração obrigatória, proteção de origem e listagem sem hashes.",
  );

  assert.ok(item.createdAt);
  const originalCreatedAt = item.createdAt;
  const secondItem = (
    await customer.call("/items", "POST", {
      name: "Tapete preservado",
      enxovalId: workspace.enxoval.id,
      categoryId: item.categoryId,
    })
  ).data.item;
  const orderBody = {
    enxovalId: workspace.enxoval.id,
    categoryId: item.categoryId,
    itemIds: [secondItem.id, item.id],
  };
  assert.equal(
    (await outsider.call("/items/order", "PATCH", orderBody)).status,
    401,
  );
  assert.equal(
    (
      await customer.call("/items/order", "PATCH", {
        ...orderBody,
        itemIds: [item.id, item.id],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await customer.call("/items/order", "PATCH", {
        ...orderBody,
        itemIds: [item.id],
      })
    ).status,
    409,
  );
  const reordered = await customer.call("/items/order", "PATCH", orderBody);
  assert.equal(reordered.status, 200);
  assert.deepEqual(
    reordered.data.map((item) => item.id),
    orderBody.itemIds,
  );
  const editedItem = await customer.call(`/items/${item.id}`, "PATCH", {
    name: "Toalha editada na lista",
    priceCents: 1990,
  });
  assert.equal(editedItem.status, 200);
  assert.equal(editedItem.data.createdAt, originalCreatedAt);
  const otherCategory = (
    await customer.call("/categories", "POST", {
      enxovalId: workspace.enxoval.id,
      name: "Quarto",
    })
  ).data;
  assert.equal(
    (
      await customer.call(`/categories/${item.categoryId}`, "PATCH", {
        enxovalId: workspace.enxoval.id,
        name: "Quarto",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await customer.call(`/categories/${item.categoryId}`, "PATCH", {
        enxovalId: workspace.enxoval.id,
        name: "   ",
      })
    ).status,
    400,
  );
  const renamed = await customer.call(
    `/categories/${item.categoryId}`,
    "PATCH",
    { enxovalId: workspace.enxoval.id, name: "Banheiro planejado" },
  );
  assert.equal(renamed.status, 200);
  assert.equal(
    (await customer.call(`/enxovais/${workspace.enxoval.id}`)).data.items.find(
      (value) => value.id === item.id,
    ).category,
    "Banheiro planejado",
  );
  assert.equal(
    (
      await customer.call("/items/order", "PATCH", {
        ...orderBody,
        categoryId: otherCategory.id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await registerViaFunnel(outsider, "Outro usuário", "outro@example.invalid", originalPassword)
    ).status,
    201,
  );
  assert.equal(
    (await outsider.call("/items/order", "PATCH", orderBody)).status,
    404,
  );
  assert.equal(
    (
      await outsider.call(`/categories/${item.categoryId}`, "PATCH", {
        enxovalId: workspace.enxoval.id,
        name: "Acesso indevido",
      })
    ).status,
    404,
  );
  assert.equal((await outsider.call("/auth/logout", "POST")).status, 204);
  console.log(
    "PASS: nomes e ordem persistidos, data de adição preservada, dados fora do ambiente e de outra conta rejeitados.",
  );

  const reset = await admin.call(`/admin/users/${id}/reset-password`, "POST");
  assert.equal(reset.status, 200);
  const temp = reset.data.temporaryPassword;
  assert.ok(temp.length >= 16);
  const row = (await getPool().query("SELECT * FROM users WHERE id = $1", [id]))
    .rows[0];
  assert.equal(row.must_change_password, true);
  assert.equal(await verifyPassword(temp, row.password_hash), true);
  assert.equal(JSON.stringify(row).includes(temp), false);
  assert.equal((await customer.call("/bootstrap")).status, 401);
  assert.equal(
    (
      await customer.call("/auth/login", "POST", {
        email,
        password: originalPassword,
      })
    ).status,
    401,
  );
  assert.equal(
    (await customer.call("/auth/login", "POST", { email, password: temp }))
      .status,
    200,
  );
  const restrictedCookie = customer.cookie;
  const restricted = await customer.call("/bootstrap");
  assert.equal(restricted.data.user.mustChangePassword, true);
  assert.deepEqual(restricted.data.items, []);
  assert.deepEqual(restricted.data.enxovais, []);
  assert.equal(
    (await customer.call(`/enxovais/${workspace.enxoval.id}`)).status,
    403,
  );
  assert.equal(
    (await customer.call(`/items?enxovalId=${workspace.enxoval.id}`)).status,
    403,
  );
  assert.equal(
    (await customer.call("/enxovais", "POST", { name: "Acesso indevido" }))
      .status,
    403,
  );
  const newPassword = randomBytes(18).toString("base64url");
  assert.equal(
    (
      await customer.call("/auth/change-password", "POST", {
        password: "curta",
        confirmation: "curta",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await customer.call("/auth/change-password", "POST", {
        password: newPassword,
        confirmation: "diferente",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await customer.call("/auth/change-password", "POST", {
        password: temp,
        confirmation: temp,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await outsider.call("/auth/change-password", "POST", {
        password: newPassword,
        confirmation: newPassword,
      })
    ).status,
    401,
  );
  const change = await customer.call("/auth/change-password", "POST", {
    password: newPassword,
    confirmation: newPassword,
  });
  assert.equal(change.status, 200);
  assert.equal(change.data.user.mustChangePassword, false);
  assert.ok(change.data.items.some((value) => value.id === item.id));
  const oldSession = await fetch(`${base}/api/bootstrap`, {
    headers: { Cookie: restrictedCookie },
  });
  assert.equal(oldSession.status, 401);
  assert.equal(
    (await customer.call("/auth/login", "POST", { email, password: temp }))
      .status,
    401,
  );
  assert.equal(
    (
      await customer.call("/auth/login", "POST", {
        email,
        password: newPassword,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await customer.call("/auth/change-password", "POST", {
        password: originalPassword,
        confirmation: originalPassword,
      })
    ).status,
    409,
  );
  const changedRow = (
    await getPool().query(
      "SELECT must_change_password, password_reset_expires_at, last_login_at FROM users WHERE id = $1",
      [id],
    )
  ).rows[0];
  assert.equal(changedRow.must_change_password, false);
  assert.equal(changedRow.password_reset_expires_at, null);
  assert.ok(changedRow.last_login_at);
  console.log(
    "PASS: senha temporária, sessões revogadas, troca obrigatória no servidor e listas preservadas.",
  );

  const secondTemp = (
    await admin.call(`/admin/users/${id}/reset-password`, "POST")
  ).data.temporaryPassword;
  const latestTemp = (
    await admin.call(`/admin/users/${id}/reset-password`, "POST")
  ).data.temporaryPassword;
  assert.equal(
    (
      await customer.call("/auth/login", "POST", {
        email,
        password: secondTemp,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await customer.call("/auth/login", "POST", {
        email,
        password: latestTemp,
      })
    ).status,
    200,
  );
  await getPool().query(
    "UPDATE users SET password_reset_expires_at = now() - interval '1 second' WHERE id = $1",
    [id],
  );
  assert.equal((await customer.call("/bootstrap")).status, 401);
  assert.equal(
    (
      await customer.call("/auth/login", "POST", {
        email,
        password: latestTemp,
      })
    ).status,
    401,
  );
  const activeTemp = (
    await admin.call(`/admin/users/${id}/reset-password`, "POST")
  ).data.temporaryPassword;
  assert.equal(
    (
      await customer.call("/auth/login", "POST", {
        email,
        password: activeTemp,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await admin.call(`/admin/users/${id}/status`, "PATCH", {
        isActive: false,
      })
    ).status,
    204,
  );
  assert.equal((await customer.call("/bootstrap")).status, 401);
  assert.equal(
    (
      await customer.call("/auth/login", "POST", {
        email,
        password: activeTemp,
      })
    ).status,
    403,
  );
  assert.equal(
    (await admin.call(`/admin/users/${id}/reset-password`, "POST")).status,
    409,
  );
  assert.equal(
    (await admin.call("/admin/users")).data.users.find((user) => user.id === id)
      .isActive,
    false,
  );
  assert.equal(
    (await admin.call(`/admin/users/${id}/status`, "PATCH", { isActive: true }))
      .status,
    204,
  );
  assert.equal(
    (
      await customer.call("/auth/login", "POST", {
        email,
        password: activeTemp,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await getPool().query(
        "SELECT COUNT(*)::int AS count FROM items WHERE id = $1",
        [item.id],
      )
    ).rows[0].count,
    1,
  );
  console.log(
    "PASS: regeneração invalida senha anterior, expiração, desativação e reativação sem perda de dados.",
  );

  process.env.ADMIN_PASSWORD = randomBytes(24).toString("base64url");
  assert.equal((await admin.call("/admin/session")).status, 401);
  assert.equal(
    (
      await admin.call("/admin/login", "POST", {
        login: "gestor-teste",
        password: process.env.ADMIN_PASSWORD,
      })
    ).status,
    200,
  );
  assert.equal((await admin.call("/admin/logout", "POST")).status, 204);
  assert.equal((await admin.call("/admin/users")).status, 401);
  let limited = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = await admin.call("/admin/login", "POST", {
      login: "gestor-teste",
      password: "incorreta",
    });
    limited ||= result.status === 429;
  }
  assert.equal(limited, true);
  console.log(
    "PASS: rotação de credenciais, logout e limite de tentativas administrativas.",
  );
} finally {
  if (server)
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  await getPool().end();
  if (created) await control.query(`DROP SCHEMA "${schema}" CASCADE`);
  await control.end();
}
