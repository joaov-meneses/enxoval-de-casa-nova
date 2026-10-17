// Gera as capturas finais do inventário: reduzidas e com e-mails e dados da conta cobertos.
// As brutas (capturas-brutas/, ignorada pelo Git) podem ter dados de teste; estas, não.
// Uso: node scripts/mascarar-capturas.mjs
import sharp from "sharp";
import { readdirSync } from "node:fs";

const raw = "design/inventario/capturas-brutas/";
const out = "design/inventario/capturas/";
const CREME = { r: 243, g: 230, b: 211 };

// Áreas a cobrir, em pixels da captura bruta (x, y, largura, altura).
const mascaras = {
  "T11-convidar": [{ x: 552, y: 436, w: 300, h: 24 }],
  "T04-visao-geral-conta-antiga": [{ x: 0, y: 612, w: 275, h: 62 }],
  "T07-planejamento-conta-antiga": [{ x: 0, y: 612, w: 275, h: 62 }],
  "T08-nino-prioritarios-antigo": [{ x: 0, y: 612, w: 275, h: 62 }],
};

for (const arquivo of readdirSync(raw).filter((f) => f.endsWith(".jpg"))) {
  const nome = arquivo.replace(/\.jpg$/, "");
  let imagem = sharp(raw + arquivo);
  const areas = mascaras[nome];
  if (areas) {
    const cobertas = areas.map(({ x, y, w, h }) => ({
      input: { create: { width: w, height: h, channels: 3, background: CREME } },
      left: x,
      top: y,
    }));
    imagem = sharp(await imagem.composite(cobertas).toBuffer());
  }
  await imagem.resize({ width: 1100, withoutEnlargement: true }).webp({ quality: 78 }).toFile(`${out}${nome}.webp`);
  console.log(nome);
}
