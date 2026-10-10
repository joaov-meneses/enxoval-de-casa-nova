import sharp from 'sharp';
import { Jimp } from 'jimp';
import path from 'path';

async function extract() {
  const inputPath = path.resolve('public/brand/casamia-v1-terracota.png');
  console.log('Lendo imagem base:', inputPath);

  const img = await Jimp.read(inputPath);
  const w = img.width;
  const h = img.height;

  // 1. Flood fill para encontrar todos os pixels externos da casa
  const isOutside = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qHead = 0;
  let qTail = 0;

  function isTerracotta(x: number, y: number) {
    const col = img.getPixelColor(x, y);
    const r = (col >> 24) & 255;
    const g = (col >> 16) & 255;
    const b = (col >> 8) & 255;
    return r > 130 && (r - g) > 40 && (r - b) > 40;
  }

  // Enfileirar bordas da imagem
  for (let x = 0; x < w; x++) {
    isOutside[x] = 1;
    queue[qTail++] = x;
    isOutside[(h - 1) * w + x] = 1;
    queue[qTail++] = (h - 1) * w + x;
  }
  for (let y = 0; y < h; y++) {
    if (!isOutside[y * w]) {
      isOutside[y * w] = 1;
      queue[qTail++] = y * w;
    }
    if (!isOutside[y * w + (w - 1)]) {
      isOutside[y * w + (w - 1)] = 1;
      queue[qTail++] = y * w + (w - 1);
    }
  }

  // Executar Flood Fill
  while (qHead < qTail) {
    const idx = queue[qHead++];
    const x = idx % w;
    const y = Math.floor(idx / w);

    const neighbors = [
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
    ];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nidx = ny * w + nx;
        if (!isOutside[nidx]) {
          if (!isTerracotta(nx, ny)) {
            isOutside[nidx] = 1;
            queue[qTail++] = nidx;
          }
        }
      }
    }
  }

  // 2. Criar buffer RGBA com transparência e defringing na borda
  const rgbaBuffer = Buffer.alloc(w * h * 4);
  const creamR = 245, creamG = 238, creamB = 218;

  let minX = w, maxX = 0, minY = h, maxY = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const bufIdx = idx * 4;
      const col = img.getPixelColor(x, y);
      const r = (col >> 24) & 255;
      const g = (col >> 16) & 255;
      const b = (col >> 8) & 255;

      if (isOutside[idx]) {
        // Fora da casa = 100% transparente
        rgbaBuffer[bufIdx] = 0;
        rgbaBuffer[bufIdx + 1] = 0;
        rgbaBuffer[bufIdx + 2] = 0;
        rgbaBuffer[bufIdx + 3] = 0;
      } else {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        let isEdge = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && isOutside[ny * w + nx]) {
              isEdge = true;
              break;
            }
          }
          if (isEdge) break;
        }

        if (isEdge) {
          const dist = Math.sqrt(
            Math.pow(r - creamR, 2) + Math.pow(g - creamG, 2) + Math.pow(b - creamB, 2)
          );
          const alpha = Math.min(255, Math.max(0, Math.round((dist / 100) * 255)));

          if (alpha > 15) {
            const factor = alpha / 255;
            const cleanR = Math.min(255, Math.max(0, Math.round((r - (1 - factor) * creamR) / factor)));
            const cleanG = Math.min(255, Math.max(0, Math.round((g - (1 - factor) * creamG) / factor)));
            const cleanB = Math.min(255, Math.max(0, Math.round((b - (1 - factor) * creamB) / factor)));

            rgbaBuffer[bufIdx] = cleanR;
            rgbaBuffer[bufIdx + 1] = cleanG;
            rgbaBuffer[bufIdx + 2] = cleanB;
            rgbaBuffer[bufIdx + 3] = alpha;
          } else {
            rgbaBuffer[bufIdx] = 0;
            rgbaBuffer[bufIdx + 1] = 0;
            rgbaBuffer[bufIdx + 2] = 0;
            rgbaBuffer[bufIdx + 3] = 0;
          }
        } else {
          rgbaBuffer[bufIdx] = r;
          rgbaBuffer[bufIdx + 1] = g;
          rgbaBuffer[bufIdx + 2] = b;
          rgbaBuffer[bufIdx + 3] = 255;
        }
      }
    }
  }

  console.log(`Bounding box detectado: x: ${minX}..${maxX}, y: ${minY}..${maxY}`);
  const houseW = maxX - minX;
  const houseH = maxY - minY;

  // 3. Extrair a casa com Sharp, aplicar crop ajustado e centralizar em 512x512
  const rawImage = sharp(rgbaBuffer, {
    raw: { width: w, height: h, channels: 4 }
  });

  const pad = 20;
  const cropLeft = Math.max(0, minX - pad);
  const cropTop = Math.max(0, minY - pad);
  const cropW = Math.min(w - cropLeft, houseW + pad * 2);
  const cropH = Math.min(h - cropTop, houseH + pad * 2);

  const cropped = rawImage.extract({
    left: cropLeft,
    top: cropTop,
    width: cropW,
    height: cropH
  });

  const targetSize = 512;
  const innerSize = 440; // margem equilibrada

  const resizedHousePngBuffer = await cropped
    .resize(innerSize, innerSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const finalCanvas = sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite([
    {
      input: resizedHousePngBuffer,
      gravity: 'centre'
    }
  ]);

  const outPng = path.resolve('public/brand/casamia-symbol.png');
  const outWebp = path.resolve('public/brand/casamia-symbol.webp');

  await finalCanvas.png().toFile(outPng);
  await finalCanvas.webp({ quality: 95 }).toFile(outWebp);

  console.log('PNG gerado com sucesso:', outPng);
  console.log('WebP gerado com sucesso:', outWebp);
}

extract().catch(console.error);
