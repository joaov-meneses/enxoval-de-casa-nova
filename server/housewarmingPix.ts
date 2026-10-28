import { HttpError } from './security.ts';
import type { HousewarmingPix } from '../src/housewarming.ts';

const ascii = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

function validCpf(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const digit = (sum * 10) % 11;
    if ((digit === 10 ? 0 : digit) !== Number(cpf[length])) return false;
  }
  return true;
}

export function parseHousewarmingPix(input: unknown): HousewarmingPix | null {
  if (input === null) return null;
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Confira os dados do Pix.');
  const pix = input as Record<string, unknown>;
  if (![pix.key, pix.receiverName, pix.city].every(value => typeof value === 'string')) throw new HttpError(400, 'Informe a chave Pix, o nome do favorecido e a cidade.');
  let key = (pix.key as string).trim();
  const receiverName = ascii(pix.receiverName as string);
  const city = ascii(pix.city as string);
  if (receiverName.length < 2 || receiverName.length > 25 || city.length < 2 || city.length > 15)
    throw new HttpError(400, 'Use de 2 a 25 letras no nome do favorecido e de 2 a 15 na cidade.');
  const keyType = pix.keyType;
  let valid = false;
  if (keyType === 'cpf') { key = key.replace(/[.\-\s]/g, ''); valid = validCpf(key); }
  if (keyType === 'email') { key = key.toLowerCase(); valid = /^[a-z0-9.!#$%&'*+/=?^_`{|}~\-]+@[a-z0-9]+(?:[.\-][a-z0-9]+)*\.[a-z]{2,}$/i.test(key); }
  if (keyType === 'phone') { key = key.replace(/[()\s-]/g, ''); valid = /^\+[1-9]\d{7,14}$/.test(key); }
  if (keyType === 'random') { key = key.toLowerCase(); valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key); }
  if (!valid || key.length > 77) throw new HttpError(400, 'Confira a chave Pix. Para celular, inclua + e o código do país, como +55.');
  return { key, keyType: keyType as HousewarmingPix['keyType'], receiverName, city };
}

/** Static BR Code, free amount. BCB Manual de Padrões para Iniciação do Pix, section 1. */
export function housewarmingPixPayload(pix: HousewarmingPix) {
  const field = (id: string, value: string) => `${id}${String(Buffer.byteLength(value, 'utf8')).padStart(2, '0')}${value}`;
  const payload = field('00', '01') + field('26', field('00', 'br.gov.bcb.pix') + field('01', pix.key))
    + field('52', '0000') + field('53', '986') + field('58', 'BR')
    + field('59', pix.receiverName) + field('60', pix.city) + field('62', field('05', '***')) + '6304';
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return payload + crc.toString(16).toUpperCase().padStart(4, '0');
}
