import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createWorker, type Worker } from 'tesseract.js';
import { HttpError } from '../security.ts';
import { isIsoDate } from '../../src/planning/installments.ts';
import type { ReceiptPreview } from '../../src/types.ts';

const require = createRequire(import.meta.url);
let busy = false;
export const receiptReaderBusy = () => busy;

export function receiptDailyLimit(env: NodeJS.ProcessEnv = process.env) {
  const value = Number(env.RECEIPT_READ_DAILY_LIMIT ?? 20);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 200) : 20;
}

/** Extract only labelled amounts: never turn a card installment, tax or change into the receipt total. */
export function parseReceiptText(text: string, confidence: number, now = new Date()): ReceiptPreview {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 500);
  const fold = (line: string) => line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let totalCents: number | null = null;
  for (let index = 0; index < lines.length; index++) {
    const label = fold(lines[index]);
    if (!/^(?:valor\s+)?total\b|^valor\s+a\s+pagar\b/.test(label) || /(?:tribut|impost|descont|itens|produto|troco|parcela)/.test(label)) continue;
    const value = `${lines[index]} ${lines[index + 1] ?? ''}`.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+),\s*(\d{2})\b/);
    if (value) {
      const cents = Number(value[1].replaceAll('.', '')) * 100 + Number(value[2]);
      if (Number.isSafeInteger(cents) && cents > 0 && cents <= 1_000_000_000) totalCents = cents;
      break;
    }
  }
  const dateLines = [...lines.filter(line => /emiss|data.*compra/i.test(fold(line))), ...lines];
  let purchasedAt: string | null = null;
  for (const line of dateLines) {
    const match = line.match(/\b(\d{2})[/-](\d{2})[/-](20\d{2})\b/);
    if (!match) continue;
    const date = `${match[3]}-${match[2]}-${match[1]}`;
    if (isIsoDate(date) && date <= now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })) { purchasedAt = date; break; }
  }
  const storeName = lines.slice(0, 12).find(line => /[a-z\u00c0-\u024f]{3}/i.test(line)
    && !/\d|cnpj|cpf|nota|cupom|fiscal|consumidor|danfe|documento|endereco|emiss|telefone|www\.|https?:/i.test(fold(line)))?.slice(0, 80) ?? null;
  return { storeName, purchasedAt, totalCents, confidence: Math.max(0, Math.min(1, confidence / 100)),
    multipleItems: lines.some(line => Number(fold(line).match(/(?:qtd|quantidade).*itens\D*(\d+)\b/)?.[1]) > 1), method: 'local_ocr' };
}

/** Portuguese model ships with npm: no receipt bytes, CPF or OCR text are sent to an external API or logged. */
export async function readReceiptImage(data: Buffer): Promise<ReceiptPreview> {
  if (busy) throw new HttpError(503, 'Outra nota está sendo lida. Tente novamente em alguns instantes.');
  busy = true;
  let worker: Worker | undefined;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = (async () => {
      const image = await sharp(data, { limitInputPixels: 25_000_000 }).rotate().resize({ width: 2200, height: 3000, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).grayscale().normalize().png().toBuffer();
      const language = require('@tesseract.js-data/por') as { langPath: string };
      worker = await createWorker('por', 1, { langPath: language.langPath, cacheMethod: 'none',
        workerPath: require.resolve('tesseract.js/src/worker-script/node/index.js'), errorHandler: () => undefined });
      if (expired) { await worker.terminate(); throw new Error('Leitura expirada.'); }
      const { data: result } = await worker.recognize(image);
      const preview = parseReceiptText(result.text, result.confidence);
      if (result.confidence < 35 || (!preview.storeName && !preview.purchasedAt && !preview.totalCents))
        throw new HttpError(422, 'Não foi possível ler os dados com segurança. Envie uma foto mais nítida ou preencha manualmente.');
      return preview;
    })();
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(new HttpError(504, 'A leitura demorou demais. Tente uma foto menor e mais nítida.')); }, 45_000); });
    return await Promise.race([operation, timeout]);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(422, 'Não foi possível abrir esta imagem. Envie uma foto JPG ou PNG nítida.');
  } finally {
    if (timer) clearTimeout(timer);
    await worker?.terminate().catch(() => undefined);
    busy = false;
  }
}
