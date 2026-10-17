// Imagens dos itens: recebe um arquivo ou um link, confere que é mesmo uma imagem, reduz, converte para WebP e
// guarda no banco (tabela item_images). O item só guarda o endereço interno, e a imagem é servida só a quem
// participa do enxoval.
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import sharp from 'sharp';
import type { Queryable } from '../database.ts';
import { HttpError } from '../security.ts';
import { ITEM_IMAGE_PATH, MAX_IMAGE_UPLOAD_BYTES, internalImageId, itemImageUrl } from '../../src/itemImages.ts';
import { assertAllowedUrl, safeLookup } from './productScraper.ts';

/** Maior lado da imagem guardada: sobra para a miniatura da lista e para uma visualização ampliada. */
export const MAX_IMAGE_SIDE = 640;
const WEBP_QUALITY = 82;
/** Foto de celular tem 12 a 50 megapixels; acima disso é arquivo anormal (ou bomba de descompressão). */
const MAX_INPUT_PIXELS = 60_000_000;
const MIN_SIDE = 24;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);
const REMOTE_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface ProcessedImage {
  data: Buffer;
  width: number;
  height: number;
  sha256: string;
}

/**
 * Valida o conteúdo (pelos bytes, não pelo nome nem pelo tipo informado), corrige a rotação da foto,
 * reduz para no máximo MAX_IMAGE_SIDE, apoia imagens com transparência sobre fundo branco e converte
 * para WebP. Metadados (como a localização da foto) não são mantidos.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (!input.length) throw new HttpError(400, 'A imagem veio vazia.');
  if (input.length > MAX_IMAGE_UPLOAD_BYTES) throw new HttpError(413, 'A imagem passa de 8 MB. Escolha um arquivo menor.');
  try {
    const source = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await source.metadata();
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format))
      throw new HttpError(415, 'Use uma imagem JPG, PNG, WebP, GIF ou AVIF.');
    if ((meta.width ?? 0) < MIN_SIDE || (meta.height ?? 0) < MIN_SIDE)
      throw new HttpError(422, 'Essa imagem é pequena demais. Escolha uma com pelo menos 24 pixels de lado.');
    const { data, info } = await source
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, sha256: createHash('sha256').update(data).digest('hex') };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'Não foi possível ler essa imagem. Tente outro arquivo (JPG, PNG ou WebP).');
  }
}

interface RemoteResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function getOnce(url: URL): Promise<RemoteResponse> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      action();
    };
    const lib = url.protocol === 'https:' ? https : http;
    // O `safeLookup` confere o IP no momento da conexão: um nome que aponta para a rede interna é recusado.
    const request = lib.get(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', 'Accept-Encoding': 'identity' },
      lookup: safeLookup,
      agent: false,
    }, response => {
      const type = String(response.headers['content-type'] ?? '').toLowerCase();
      const isRedirect = [301, 302, 303, 307, 308].includes(response.statusCode ?? 0);
      if (!isRedirect && (response.statusCode ?? 0) === 200 && (type.startsWith('text/') || type.includes('svg') || type.includes('json') || type.includes('xml'))) {
        request.destroy();
        finish(() => reject(new HttpError(422, 'Esse link não leva direto a uma imagem. Abra a imagem, copie o endereço dela e cole aqui.')));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_IMAGE_UPLOAD_BYTES && !isRedirect) {
          request.destroy();
          finish(() => reject(new HttpError(413, 'A imagem desse link passa de 8 MB.')));
          return;
        }
        if (!isRedirect) chunks.push(chunk);
      });
      response.on('end', () => finish(() => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) })));
      response.on('error', () => finish(() => reject(new HttpError(502, 'Não foi possível baixar a imagem desse link.'))));
    });
    const deadline = setTimeout(() => {
      request.destroy();
      finish(() => reject(new HttpError(504, 'O endereço da imagem demorou demais para responder.')));
    }, REMOTE_TIMEOUT_MS);
    request.on('error', () => finish(() => reject(new HttpError(502, 'Não foi possível baixar a imagem desse link.'))));
  });
}

/** Baixa uma imagem de um endereço público (http/https), seguindo poucos redirecionamentos e validando cada destino. */
export async function downloadImage(rawUrl: string): Promise<Buffer> {
  let current: URL;
  try {
    current = new URL(rawUrl.trim());
  } catch {
    throw new HttpError(400, 'Link da imagem inválido.');
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      assertAllowedUrl(current);
    } catch {
      throw new HttpError(400, 'Esse link de imagem não pode ser usado. Use o endereço público de uma imagem.');
    }
    const response = await getOnce(current);
    const location = response.headers.location;
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      try {
        current = new URL(location, current);
      } catch {
        throw new HttpError(502, 'O link da imagem redirecionou para um endereço inválido.');
      }
      continue;
    }
    if (response.status !== 200) throw new HttpError(response.status === 404 ? 404 : 502, 'Não foi possível baixar a imagem desse link.');
    return response.body;
  }
  throw new HttpError(502, 'O link da imagem redirecionou vezes demais.');
}

/** Baixa e processa a imagem de um link. */
export async function importImageFromUrl(rawUrl: string): Promise<ProcessedImage> {
  return processImage(await downloadImage(rawUrl));
}

/** Guarda a imagem no enxoval (a mesma imagem enviada duas vezes reaproveita o registro) e devolve o endereço interno. */
export async function storeImage(queryable: Queryable, enxovalId: string, userId: string, image: ProcessedImage): Promise<string> {
  const existing = await queryable.query<{ id: string }>(
    'SELECT id FROM item_images WHERE enxoval_id = $1 AND sha256 = $2', [enxovalId, image.sha256]);
  if (existing.rows[0]) return itemImageUrl(existing.rows[0].id);
  const id = randomUUID();
  await queryable.query(`
    INSERT INTO item_images (id, enxoval_id, created_by, content_type, data, width, height, byte_size, sha256)
    VALUES ($1, $2, $3, 'image/webp', $4, $5, $6, $7, $8)
    ON CONFLICT (enxoval_id, sha256) DO NOTHING
  `, [id, enxovalId, userId, image.data, image.width, image.height, image.data.length, image.sha256]);
  // Em corrida (mesma imagem ao mesmo tempo) quem perdeu o INSERT usa o registro do vencedor.
  const stored = await queryable.query<{ id: string }>(
    'SELECT id FROM item_images WHERE enxoval_id = $1 AND sha256 = $2', [enxovalId, image.sha256]);
  return itemImageUrl(stored.rows[0]?.id ?? id);
}

/** A imagem interna existe e é deste enxoval? (Impede apontar o item para a imagem de outro enxoval.) */
export async function imageBelongsToEnxoval(queryable: Queryable, enxovalId: string, imageUrl: string) {
  const id = internalImageId(imageUrl);
  if (!id) return false;
  const result = await queryable.query('SELECT 1 FROM item_images WHERE id = $1 AND enxoval_id = $2', [id, enxovalId]);
  return result.rows.length > 0;
}

/**
 * Remove as imagens que nenhum item usa mais. Imagens recém-enviadas ficam de fora por uma hora: a pessoa
 * pode ter enviado e ainda não ter salvo o item.
 */
export async function purgeUnusedImages(queryable: Queryable, enxovalId: string) {
  await queryable.query(`
    DELETE FROM item_images ii
    WHERE ii.enxoval_id = $1
      AND ii.created_at < now() - interval '1 hour'
      AND NOT EXISTS (
        SELECT 1 FROM items i
        WHERE i.enxoval_id = ii.enxoval_id AND i.image_url = $2 || ii.id::text
      )
  `, [enxovalId, ITEM_IMAGE_PATH]);
}

/** Endereço externo (http/https) de imagem: o que o leitor de lojas devolve e o servidor pode baixar e guardar. */
export const isExternalImageUrl = (value: string | null | undefined): value is string =>
  typeof value === 'string' && /^https?:\/\//i.test(value);
