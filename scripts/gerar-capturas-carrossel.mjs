// Gera as capturas finais do carrossel a partir das capturas brutas do inventário.
// Cada recorte exclui a barra lateral (conta da pessoa), o cursor e qualquer e-mail.
// Uso: node scripts/gerar-capturas-carrossel.mjs
import sharp from "sharp";

const raw = "design/inventario/capturas-brutas/";
const out = "design/inventario/capturas/";
const publico = "public/images/carrossel/";

// Todos os recortes têm proporção próxima de 15:8, a mesma do quadro do carrossel.
const jobs = [
  ["T15-funil-plano-pronto", "carrossel-01-plano", { left: 402, top: 0, width: 500, height: 267 }],
  ["T06-app-meu-enxoval", "carrossel-02-lista", { left: 365, top: 5, width: 1120, height: 597 }],
  ["T07-app-planejamento", "carrossel-03-quando-comprar", { left: 365, top: 77, width: 1120, height: 597 }],
  ["T08-app-ajuda-nino", "carrossel-04-nino", { left: 365, top: 160, width: 960, height: 512 }],
  ["T10-novo-item-importar-link", "carrossel-05-link", { left: 388, top: 25, width: 760, height: 405 }],
  ["T04-app-visao-geral", "carrossel-06-visao-geral", { left: 365, top: 77, width: 1120, height: 597 }],
  ["T11-convidar", "carrossel-07-lista-a-dois", { left: 445, top: 40, width: 647, height: 345 }],
];

// Retângulos (x, y, largura, altura) cobertos com a cor do fundo ao lado, para esconder o cursor.
const cobrir = { "T06-app-meu-enxoval": [{ x: 752, y: 36, w: 30, h: 34 }] };

async function comCursorCoberto(src) {
  const caminho = `${raw}${src}.jpg`;
  const areas = cobrir[src];
  if (!areas) return sharp(caminho);
  const { data, info } = await sharp(caminho).raw().toBuffer({ resolveWithObject: true });
  for (const { x, y, w, h } of areas) {
    const i = (y * info.width + (x - 24)) * info.channels;
    const cor = [data[i], data[i + 1], data[i + 2]];
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) {
        const j = (yy * info.width + xx) * info.channels;
        data[j] = cor[0]; data[j + 1] = cor[1]; data[j + 2] = cor[2];
      }
  }
  return sharp(data, { raw: info });
}

for (const [src, name, region] of jobs) {
  const pipeline = (await comCursorCoberto(src))
    .extract(region)
    .resize({ width: 1000, withoutEnlargement: true })
    .webp({ quality: 82 });
  await pipeline.clone().toFile(`${out}${name}.webp`);
  await pipeline.clone().toFile(`${publico}${name}.webp`);
  console.log(name);
}
