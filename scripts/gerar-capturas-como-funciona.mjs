// Gera as capturas mobile (390x844 @2x) da seção "Como funciona" da home, direto do app em desenvolvimento.
// Cria contas mock descartáveis (Ana e Léo, e-mails @example.com) no banco LOCAL, as popula com dados
// de exemplo e apaga tudo no fim. Nenhuma senha é gravada: ela nasce aleatória a cada execução.
// Requer: `npm run dev:full` rodando em http://localhost:3000, Docker com o contêiner casamia_db e .env carregado.
// Uso: node --env-file=.env scripts/gerar-capturas-como-funciona.mjs
import { chromium, request } from "@playwright/test";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const brutas = "design/inventario/capturas-brutas/";
const publico = "public/images/como-funciona/";
mkdirSync(brutas, { recursive: true });

const psql = (sql) =>
  execFileSync(
    "docker",
    ["exec", "casamia_db", "psql", "-U", process.env.POSTGRES_USER, "-d", process.env.POSTGRES_DB, "-tAc", sql],
    { encoding: "utf8" },
  ).trim();

const EMAIL_ANA = "ana@example.com";
const EMAIL_LEO = "leo@example.com";
const limpar = () =>
  psql(`DELETE FROM users WHERE email IN ('${EMAIL_ANA}', '${EMAIL_LEO}') OR email LIKE 'mock-%@example.com'`);

// Fração de itens conquistados por ambiente, para a visão geral mostrar progressos variados.
const PROGRESSO = { Quarto: 0.45, Banheiro: 0.64, Cozinha: 0.49, "Sala de Estar": 0.4, "Área de Serviço": 0.33, Eletrodomésticos: 0.16 };

function popular(enxovalId) {
  const frac = Object.entries(PROGRESSO)
    .map(([nome, f]) => `WHEN '${nome}' THEN ${f}`)
    .join(" ");
  psql(`
    WITH base AS (
      SELECT i.id, c.name AS cat,
             row_number() OVER (PARTITION BY c.id ORDER BY i.sort_order, i.created_at) AS rn,
             count(*) OVER (PARTITION BY c.id) AS n
      FROM items i JOIN categories c ON c.id = i.category_id
      WHERE i.enxoval_id = '${enxovalId}'
    ), alvo AS (
      SELECT id, rn, n,
        CASE
          WHEN cat = 'Cozinha' THEN (rn IN (1, 2, 4) OR (rn > 6 AND rn % 2 = 0 AND rn <= n))
          ELSE rn <= round(n * (CASE cat ${frac} ELSE 0.2 END))
        END AS feito,
        (rn <= 8 OR rn <= round(n * 0.5)) AS com_preco
      FROM base
    )
    UPDATE items SET
      checked = alvo.feito,
      status = CASE WHEN NOT alvo.feito THEN 'researching' WHEN alvo.rn % 5 = 0 THEN 'owned' WHEN alvo.rn % 3 = 0 THEN 'received' ELSE 'bought' END,
      price_cents = CASE WHEN alvo.com_preco AND NOT (alvo.feito AND (alvo.rn % 5 = 0 OR alvo.rn % 3 = 0))
        THEN (1990 + (alvo.rn * 7919) % 28000) / 100 * 100 + 90 END
    FROM alvo WHERE items.id = alvo.id`);
}

limpar();
const senha = randomBytes(12).toString("hex");
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "pt-BR",
});
const page = await ctx.newPage();

try {
  // Conta da Ana, já no plano pago para o app mostrar todos os ambientes.
  const reg = await ctx.request.post(`${BASE}/api/auth/register`, { data: { email: EMAIL_ANA, password: senha } });
  if (reg.status() !== 201) throw new Error(`Cadastro falhou: ${reg.status()}`);
  psql(`UPDATE users SET plan = 'pass' WHERE email = '${EMAIL_ANA}'`);

  const cta = (nome) => page.getByRole("button", { name: new RegExp(`^${nome}`) });
  const seguir = async () => {
    await cta("Continuar").click();
    await page.waitForTimeout(600);
  };
  const salvar = async (arquivo) => {
    await page.screenshot({ path: `${brutas}${arquivo}.png` });
    await sharp(`${brutas}${arquivo}.png`).webp({ quality: 80 }).toFile(`${publico}${arquivo}.webp`);
    console.log(arquivo);
  };

  // Funil de onboarding, que roda autenticado logo depois do cadastro.
  await page.goto(`${BASE}/comecar`);
  await cta("Vamos começar").click();
  await page.getByRole("textbox", { name: /Como podemos te chamar/ }).fill("Ana");
  await seguir();
  await seguir();
  await page.getByLabel(/Vou morar com meu par/).check();
  await seguir();
  await page.getByRole("button", { name: "Em 3 meses" }).click();
  await seguir();
  await seguir();
  await page.getByRole("option", { name: "São Paulo" }).click();
  await seguir();
  await seguir();
  await page.getByLabel(/Apartamento/).check();
  await seguir();
  await seguir(); // quantas pessoas (2 já vem marcado) -> quais espaços
  await page.getByText("Quais espaços você quer equipar?").waitFor();
  await page.waitForTimeout(800);
  await salvar("passo-1-conte");
  await seguir();
  await page.getByLabel(/Ainda nada/).check();
  await seguir();
  await page.getByLabel(/Completo, sem faltar nada/).check();
  await seguir();
  await page.getByLabel("De R$ 10 a 25 mil").check();
  await seguir();
  await cta("Pular").click();
  await page.waitForTimeout(600);
  await page.getByLabel(/Dividir com quem mora comigo/).check();
  await seguir();
  await cta("Montar meu plano").click();
  // O plano leva alguns segundos para montar; depois seguem as telas de resultado até "Salvar meu plano".
  for (let i = 0; i < 40 && !(await cta("Salvar meu plano").isVisible()); i++) {
    if (await cta("Continuar").isVisible()) await cta("Continuar").click();
    await page.waitForTimeout(800);
  }
  await cta("Salvar meu plano").click();
  await page.getByRole("button", { name: /^Criar meu plano/ }).click();
  await page.waitForURL(/\/app/, { timeout: 30000 });
  await page.waitForTimeout(1500);

  // Dados de exemplo: progresso, preços e a segunda pessoa (Léo) no enxoval.
  const enxovalId = psql(`SELECT e.id FROM enxovais e JOIN users u ON u.id = e.owner_id WHERE u.email = '${EMAIL_ANA}'`);
  popular(enxovalId);
  const leo = await request.newContext();
  const regLeo = await leo.post(`${BASE}/api/auth/register`, { data: { email: EMAIL_LEO, password: randomBytes(12).toString("hex") } });
  if (regLeo.status() !== 201) throw new Error(`Cadastro do Léo falhou: ${regLeo.status()}`);
  await leo.dispose();
  psql(`UPDATE users SET name = 'Léo' WHERE email = '${EMAIL_LEO}'`);
  psql(`INSERT INTO enxoval_members (enxoval_id, user_id, role, invited_by)
        SELECT '${enxovalId}', l.id, 'editor', a.id FROM users l, users a WHERE l.email = '${EMAIL_LEO}' AND a.email = '${EMAIL_ANA}'`);
  await page.reload();
  await page.waitForTimeout(1500);

  // Passo 2: visão geral com os ambientes e o progresso de cada um.
  await page.getByRole("button", { name: "Meu Lar" }).click();
  await page.waitForTimeout(900);
  await salvar("passo-2-plano");

  // Passo 3: lista da Cozinha, com itens riscados e itens a comprar com preço.
  await page.getByRole("button", { name: "Meu enxoval" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /^Cozinha/ }).first().click();
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await salvar("passo-3-conquiste");

  // Passo 4: menu do enxoval com o cartão "Organizem juntos" (Ana e Léo).
  await page.getByRole("button", { name: "Abrir menu do enxoval" }).click();
  await page.waitForTimeout(900);
  await salvar("passo-4-juntos");
} finally {
  await browser.close();
  limpar();
}
