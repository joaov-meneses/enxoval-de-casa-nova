// Campos da Fase 11 no item: parcelas e pagamento, responsável, presente e agradecimento, garantia e loja física.
// Só devolve as colunas que vieram no pedido (ou que mudam por consequência, como a data da compra).
import type { Queryable } from './database.ts';
import { HttpError } from './security.ts';
import type { ItemStatus, PaymentMethod } from '../src/types.ts';
import { addMonths, isIsoDate, MAX_INSTALLMENTS } from '../src/planning/installments.ts';

const PAYMENT_METHODS: readonly PaymentMethod[] = ['pix', 'credit', 'debit', 'boleto', 'cash', 'other'];
const MAX_CENTS = 1_000_000_000;

function optionalText(value: unknown, max: number, label: string) {
  if (value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, `${label} inválido.`);
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length > max) throw new HttpError(400, `${label} pode ter no máximo ${max} caracteres.`);
  return text || null;
}

function optionalDate(value: unknown, label: string) {
  if (value === null) return null;
  if (!isIsoDate(value)) throw new HttpError(400, `${label} inválida.`);
  return value;
}

/** Hoje no fuso de Brasília (AAAA-MM-DD): a data da compra é a do dia em que a pessoa riscou o item. */
export function todayInBrazil(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now);
}

export async function parseItemExtras(
  queryable: Queryable,
  updates: Record<string, unknown>,
  current: {
    enxovalId: string;
    previousStatus: ItemStatus;
    status: ItemStatus;
    statusChanged: boolean;
    purchasedAt: string | null;
    warrantyMonths: number | null;
    warrantyUntil: string | null;
  },
  now = new Date(),
): Promise<[string, unknown][]> {
  const has = (key: string) => Object.prototype.hasOwnProperty.call(updates, key) && updates[key] !== undefined;
  const columns: [string, unknown][] = [];

  // 11.1 Parcelas e pagamento.
  if (has('installments')) {
    const value = updates.installments;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > MAX_INSTALLMENTS)
      throw new HttpError(400, `Parcelas inválidas. Use um número de 1 a ${MAX_INSTALLMENTS}.`);
    columns.push(['installments', value]);
    // À vista não tem valor de parcela com juros.
    if (value === 1 && !has('installmentCents')) columns.push(['installment_cents', null]);
  }
  if (has('installmentCents')) {
    const value = updates.installmentCents;
    if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > MAX_CENTS))
      throw new HttpError(400, 'Valor da parcela inválido.');
    columns.push(['installment_cents', value]);
  }
  if (has('firstInstallmentOn')) columns.push(['first_installment_on', optionalDate(updates.firstInstallmentOn, 'Data da primeira parcela')]);
  if (has('paymentMethod')) {
    const value = updates.paymentMethod;
    if (value !== null && !(PAYMENT_METHODS as readonly unknown[]).includes(value)) throw new HttpError(400, 'Meio de pagamento inválido.');
    columns.push(['payment_method', value]);
  }

  // Data da compra: informada pela pessoa, ou gravada ao passar para Comprado. Fora de Comprado, não há compra.
  let purchasedAt = current.purchasedAt;
  if (has('purchasedAt')) {
    purchasedAt = optionalDate(updates.purchasedAt, 'Data da compra');
    if (purchasedAt && purchasedAt > todayInBrazil(now)) throw new HttpError(400, 'A data da compra não pode estar no futuro.');
    columns.push(['purchased_at', purchasedAt]);
  } else if (current.statusChanged && current.status !== current.previousStatus) {
    if (current.status === 'bought' && !purchasedAt) {
      purchasedAt = todayInBrazil(now);
      columns.push(['purchased_at', purchasedAt]);
    } else if (current.status !== 'bought' && purchasedAt) {
      purchasedAt = null;
      columns.push(['purchased_at', null]);
    }
  }

  // 11.2 Responsável: só o dono ou um membro deste enxoval.
  if (has('assigneeId')) {
    const value = updates.assigneeId;
    if (value !== null) {
      if (typeof value !== 'string') throw new HttpError(400, 'Responsável inválido.');
      const member = await queryable.query('SELECT 1 FROM enxoval_members WHERE enxoval_id = $1 AND user_id::text = $2', [current.enxovalId, value]);
      if (!member.rowCount) throw new HttpError(400, 'O responsável precisa participar deste enxoval.');
    }
    columns.push(['assignee_id', value]);
  }

  // 11.3 Presente e agradecimento.
  if (has('giftFrom')) columns.push(['gift_from', optionalText(updates.giftFrom, 120, 'O nome de quem deu o presente')]);
  if (has('giftMessage')) {
    const value = updates.giftMessage;
    if (value !== null && typeof value !== 'string') throw new HttpError(400, 'Recado inválido.');
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length > 500) throw new HttpError(400, 'O recado pode ter no máximo 500 caracteres.');
    columns.push(['gift_message', text || null]);
  }
  if (has('thanked')) {
    if (typeof updates.thanked !== 'boolean') throw new HttpError(400, 'Agradecimento inválido.');
    columns.push(['thanked_at', updates.thanked ? now : null]);
  }

  // 11.4 Garantia e loja. O fim da garantia sai da data da compra, mas a pessoa pode informar outro.
  let warrantyMonths = current.warrantyMonths;
  if (has('warrantyMonths')) {
    const value = updates.warrantyMonths;
    if (value !== null && (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 240))
      throw new HttpError(400, 'Garantia inválida. Use de 1 a 240 meses.');
    warrantyMonths = value as number | null;
    columns.push(['warranty_months', warrantyMonths]);
  }
  if (has('warrantyUntil')) {
    columns.push(['warranty_until', optionalDate(updates.warrantyUntil, 'Data do fim da garantia')]);
  } else if (has('warrantyMonths') || (has('purchasedAt') && warrantyMonths)) {
    const base = purchasedAt ?? todayInBrazil(now);
    columns.push(['warranty_until', warrantyMonths ? addMonths(base, warrantyMonths) : null]);
  }
  if (has('storeName')) columns.push(['store_name', optionalText(updates.storeName, 80, 'O nome da loja')]);

  return columns;
}
