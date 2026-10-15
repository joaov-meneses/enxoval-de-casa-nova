/**
 * Gera o logo e os ícones do Casa Mia a partir da arte do Nino (public/brand/nino.png).
 *
 * Uso: npx tsx scripts/generate-brand-assets.ts
 *
 * Saídas (em public/):
 *   brand/nino-logo.{webp,png}   logo leve, usado no cabeçalho e no funil
 *   brand/nino.webp              Nino acenando em tamanho cheio (landing)
 *   brand/nino-plan.webp         Nino com a prancheta em tamanho cheio (landing)
 *   favicon.ico, favicon-{32x32,192x192,512x512}.png
 *   apple-touch-icon.png         180 x 180, sobre o creme (o iOS não aceita transparência)
 *   icon-maskable-512x512.png    512 x 512, com a margem de segurança dos ícones adaptativos
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const publicDir = path.resolve("public");
const brandDir = path.join(publicDir, "brand");
const CREAM = { r: 251, g: 243, b: 230, alpha: 1 }; // #fbf3e6
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

const source = path.join(brandDir, "nino.png");

/** Centraliza o Nino numa tela quadrada; `fill` é a fração do lado que o desenho ocupa. */
async function square(size: number, fill: number, background: typeof CREAM | typeof CLEAR) {
  const inner = Math.round(size * fill);
  const art = await sharp(source)
    .resize({ width: inner, height: inner, fit: "inside", kernel: "lanczos3" })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: art, gravity: "center" }])
    .png({ compressionLevel: 9 });
}

/** .ico com imagens PNG embutidas (aceito por todos os navegadores atuais). */
function buildIco(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

async function main() {
  if (!fs.existsSync(source)) throw new Error(`Arte do Nino não encontrada: ${source}`);

  // Logo leve (proporção original do Nino), para não carregar o arquivo grande em toda página.
  const logo = sharp(source).resize({ width: 224, kernel: "lanczos3" });
  await logo.clone().webp({ quality: 92, effort: 6 }).toFile(path.join(brandDir, "nino-logo.webp"));
  await logo.clone().png({ compressionLevel: 9 }).toFile(path.join(brandDir, "nino-logo.png"));

  // Favicons: o Nino ocupa quase toda a área, com fundo transparente.
  const favicon = (size: number) => square(size, 0.94, CLEAR);
  const png32 = await (await favicon(32)).toBuffer();
  await fs.promises.writeFile(path.join(publicDir, "favicon-32x32.png"), png32);
  await (await favicon(192)).toFile(path.join(publicDir, "favicon-192x192.png"));
  await (await favicon(512)).toFile(path.join(publicDir, "favicon-512x512.png"));

  const ico = buildIco([
    { size: 16, data: await (await favicon(16)).toBuffer() },
    { size: 32, data: png32 },
    { size: 48, data: await (await favicon(48)).toBuffer() },
  ]);
  await fs.promises.writeFile(path.join(publicDir, "favicon.ico"), ico);

  await (await square(180, 0.82, CREAM)).toFile(path.join(publicDir, "apple-touch-icon.png"));
  // Maskable: o sistema recorta até 20% das bordas, então o desenho fica dentro dos 60% centrais.
  await (await square(512, 0.62, CREAM)).toFile(path.join(publicDir, "icon-maskable-512x512.png"));

  // Versões WebP do Nino em tamanho cheio (landing e funil).
  for (const name of ["nino", "nino-plan"]) {
    await sharp(path.join(brandDir, `${name}.png`))
      .webp({ quality: 92, effort: 6 })
      .toFile(path.join(brandDir, `${name}.webp`));
  }

  console.log("Logo e ícones do Casa Mia gerados a partir de public/brand/nino.png.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
