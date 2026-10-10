import { Jimp } from 'jimp';
import path from 'path';

interface Palette {
  name: string;
  filename: string;
  house: { r: number; g: number; b: number };
  door: { r: number; g: number; b: number };
  bg?: { r: number; g: number; b: number };
}

const PALETTES: Palette[] = [
  {
    name: 'V1 (Terracota & Café)',
    filename: 'casamia-v1-terracota.png',
    house: { r: 194, g: 96, b: 63 }, // Terracota #C2603F
    door: { r: 59, g: 42, b: 32 },   // Café #3B2A20
  },
  {
    name: 'V2 (Oliva Botânica)',
    filename: 'casamia-v2-oliva.png',
    house: { r: 92, g: 102, b: 67 }, // Oliva #5C6643
    door: { r: 194, g: 96, b: 63 },  // Terracota #C2603F
  },
  {
    name: 'V3 (Azulejo Português)',
    filename: 'casamia-v3-azulejo.png',
    house: { r: 36, g: 75, b: 102 },  // Azulejo #244B66
    door: { r: 194, g: 96, b: 63 },   // Terracota #C2603F
  },
  {
    name: 'V4 (Café & Terracota)',
    filename: 'casamia-v4-cafe.png',
    house: { r: 59, g: 42, b: 32 },   // Café #3B2A20
    door: { r: 194, g: 96, b: 63 },   // Terracota #C2603F
  },
  {
    name: 'V5 (Areia Nobre / Dark Mode)',
    filename: 'casamia-v5-areia.png',
    house: { r: 212, g: 184, b: 149 }, // Areia #D4B895
    door: { r: 194, g: 96, b: 63 },    // Terracota #C2603F
    bg: { r: 42, g: 30, b: 23 },       // Café Profundo #2A1E17
  },
];

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s, l };
}

const rgbaToInt = (r: number, g: number, b: number, a: number) =>
  (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;

async function run() {
  const sourcePath = path.resolve('public/brand/casamia-symbol.jpg');
  console.log('Carregando imagem base:', sourcePath);
  const baseImg = await Jimp.read(sourcePath);
  const width = baseImg.width;
  const height = baseImg.height;

  for (const pal of PALETTES) {
    console.log(`Gerando ${pal.name}...`);
    const img = baseImg.clone();

    // Referência da terracota original na imagem base:
    const origTerracottaLum = 0.299 * 192 + 0.587 * 96 + 0.114 * 58; // ~120
    const origDoorLum = 0.299 * 77 + 0.587 * 45 + 0.114 * 12; // ~51

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const col = img.getPixelColor(x, y);
        const r = (col >> 24) & 255;
        const g = (col >> 16) & 255;
        const b = (col >> 8) & 255;
        const a = col & 255;

        const { h, s, l } = rgbToHsl(r, g, b);
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // 1. Detectar Casa & Chaminé (Terracota original: Hue 8..28, Sat > 0.35, Lum 0.25..0.65)
        const isTerracotta = h >= 8 && h <= 28 && s >= 0.35 && l >= 0.25 && l <= 0.65;

        // 2. Detectar Porta (Café escuro: lum < 80 na área central da porta x: 420..610, y: 380..720)
        const isDoor = x >= 420 && x <= 610 && y >= 380 && y <= 720 && lum < 80 && maxDiff(r, g, b) < 70;

        // 3. Fundo externo (para V5 com fundo escuro)
        const isBackground = pal.bg && (x < 140 || x > 880 || y < 140 || y > 880) && l > 0.8;

        if (isTerracotta && pal.name !== 'V1 (Terracota & Café)') {
          const ratio = Math.max(0.6, Math.min(1.4, lum / origTerracottaLum));
          const newR = Math.min(255, Math.round(pal.house.r * ratio));
          const newG = Math.min(255, Math.round(pal.house.g * ratio));
          const newB = Math.min(255, Math.round(pal.house.b * ratio));
          img.setPixelColor(rgbaToInt(newR, newG, newB, a), x, y);
        } else if (isDoor && pal.name !== 'V1 (Terracota & Café)') {
          const ratio = Math.max(0.4, Math.min(1.3, lum / origDoorLum));
          const newR = Math.min(255, Math.round(pal.door.r * ratio * 0.75));
          const newG = Math.min(255, Math.round(pal.door.g * ratio * 0.75));
          const newB = Math.min(255, Math.round(pal.door.b * ratio * 0.75));
          img.setPixelColor(rgbaToInt(newR, newG, newB, a), x, y);
        } else if (isBackground && pal.bg) {
          img.setPixelColor(rgbaToInt(pal.bg.r, pal.bg.g, pal.bg.b, a), x, y);
        }
      }
    }

    const outPath = path.resolve('public/brand', pal.filename);
    await img.write(outPath as any);
    console.log(`Salvo com sucesso: ${pal.filename}`);
  }
  console.log('Todas as 5 variações geradas com sucesso!');
}

function maxDiff(r: number, g: number, b: number) {
  return Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
}

run().catch(console.error);
