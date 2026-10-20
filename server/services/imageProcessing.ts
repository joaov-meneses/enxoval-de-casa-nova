import { getLogger } from '../logger.ts';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { HttpError } from '../security.ts';
import { MAX_IMAGE_UPLOAD_BYTES } from '../../src/imageUploadLimits.ts';

/** Maior lado da foto processada para o perfil. */
export const MAX_IMAGE_SIDE = 640;
const WEBP_QUALITY = 82;
/** Foto de celular tem 12 a 50 megapixels; acima disso é arquivo anormal (ou bomba de descompressão). */
const MAX_INPUT_PIXELS = 60_000_000;
const MIN_SIDE = 24;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);

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
    getLogger().info({ event: 'image.processing.completed', inputBytes: input.length, outputBytes: data.length, metadata: meta, output: info }, 'Profile image processed.');
    return { data, width: info.width, height: info.height, sha256: createHash('sha256').update(data).digest('hex') };
  } catch (error) {
    getLogger().warn({ event: 'image.processing.failed', inputBytes: input.length, err: error }, 'Image processing failed.');
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'Não foi possível ler essa imagem. Tente outro arquivo (JPG, PNG ou WebP).');
  }
}
