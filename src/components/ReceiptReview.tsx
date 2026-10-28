import { useId, useState } from 'react';
import type { ReceiptPreview } from '../types';
import { isIsoDate } from '../planning/installments';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';

export interface ReceiptFields { storeName?: string; purchasedAt?: string; priceCents?: number; }
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function ReceiptReview({ preview, onApply, onCancel }: { preview: ReceiptPreview; onApply: (fields: ReceiptFields) => void; onCancel: () => void }) {
  const id = useId();
  const [store, setStore] = useState(preview.storeName ?? '');
  const [date, setDate] = useState(preview.purchasedAt ?? '');
  const [amount, setAmount] = useState(preview.totalCents ? money.format(preview.totalCents / 100) : '');
  const [useAmount, setUseAmount] = useState(false);
  const [error, setError] = useState('');
  function apply() {
    if (date && (!isIsoDate(date) || date > new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))) { setError('Confira a data da compra.'); return; }
    const cents = Number(amount.replace(/\D/g, ''));
    if (useAmount && (!cents || cents > 1_000_000_000)) { setError('Confira o valor da nota.'); return; }
    onApply({ ...(store.trim() ? { storeName: store.trim().slice(0, 80) } : {}), ...(date ? { purchasedAt: date } : {}), ...(useAmount ? { priceCents: cents } : {}) });
  }
  return <section className="receipt-review" aria-label="Conferir dados da nota">
    <h4>Confira o que lemos da nota</h4>
    <p>A foto foi lida no servidor. A leitura pode conter erros; revise antes de usar.</p>
    <Label htmlFor={`${id}-store`}>Loja<Input id={`${id}-store`} value={store} maxLength={80} onChange={event => setStore(event.target.value)} /></Label>
    <Label htmlFor={`${id}-date`}>Data da nota<Input id={`${id}-date`} type="date" value={date} onChange={event => setDate(event.target.value)} /></Label>
    <Label htmlFor={`${id}-amount`}>Total da nota<Input id={`${id}-amount`} inputMode="numeric" value={amount} onChange={event => {
      const digits = event.target.value.replace(/\D/g, '').slice(0, 10);
      setAmount(digits ? money.format(Number(digits) / 100) : '');
    }} /></Label>
    <Label htmlFor={`${id}-use`} className="receipt-use-amount"><Checkbox id={`${id}-use`} checked={useAmount} onCheckedChange={checked => setUseAmount(checked === true)} />Este valor corresponde somente a este item</Label>
    <p>{preview.multipleItems ? 'A nota parece conter vários itens. ' : ''}O total não será usado como preço sem sua confirmação. A data só é aplicada se o item estiver como Comprado.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="receipt-review-actions">
      <Button variant="brand" size="brand" type="button" className="button button-outline button-small" onClick={onCancel}>Cancelar leitura</Button>
      <Button variant="brand" size="brand" type="button" className="button button-dark button-small" onClick={apply}>Usar dados no formulário</Button>
    </div>
  </section>;
}
