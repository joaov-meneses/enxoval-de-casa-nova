import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift, House, LoaderCircle, ShoppingBag } from 'lucide-react';
import { Dialog } from './Dialog';
import type { ItemStatus } from '../itemStatus';
import './itemCompletion.css';

const choices = [
  { value: 'bought', label: 'Comprei', hint: 'Uma nova compra para a casa. O valor entra em Já investimos.', Icon: ShoppingBag },
  { value: 'received', label: 'Ganhei', hint: 'Um presente que você recebeu, sem custo de compra.', Icon: Gift },
  { value: 'owned', label: 'Já tenho', hint: 'Você já tinha este item e vai usá-lo na casa.', Icon: House },
] as const;

export function ItemCompletionDialog({ itemName, onClose, onConfirm }: {
  itemName: string; onClose: () => void; onConfirm: (status: ItemStatus) => Promise<void>;
}) {
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [selected, setSelected] = useState<ItemStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { await onConfirm(selected); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível atualizar o item. Tente novamente.'); }
    finally { setBusy(false); }
  }
  return createPortal(<Dialog title="Como você conseguiu?" isOpen onClose={onClose} busy={busy} className="item-completion-dialog">
    <div className="item-completion-body">
      <p className="item-completion-intro" tabIndex={-1} data-dialog-autofocus>
        <strong>{itemName}</strong>
        <span>Escolha uma opção para atualizar o progresso e os valores da sua casa.</span>
      </p>
      <div className="item-completion-options" role="radiogroup" aria-label="Como você conseguiu este item?">
        {choices.map(({ value, label, hint, Icon }, index) => <button key={value} ref={element => { optionRefs.current[index] = element; }} type="button" role="radio" aria-checked={selected === value} disabled={busy} tabIndex={selected === value || (!selected && index === 0) ? 0 : -1} className={`item-completion-option${selected === value ? ' is-selected' : ''}`} onClick={() => {
          if (!busy) { setSelected(value); setError(''); }
        }} onKeyDown={event => {
          const next = ['ArrowDown', 'ArrowRight'].includes(event.key) ? (index + 1) % choices.length
            : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? (index + choices.length - 1) % choices.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : null;
          if (next === null || busy) return;
          event.preventDefault(); setSelected(choices[next].value); setError(''); optionRefs.current[next]?.focus();
        }}>
          <span className="item-completion-radio" aria-hidden="true" />
          <Icon size={22} aria-hidden="true" />
          <span><strong>{label}</strong><small>{hint}</small></span>
        </button>)}
      </div>
      {error && <p className="item-completion-error" role="alert">{error}</p>}
    </div>
    <div className="item-completion-footer">
      <button type="button" className="button button-outline" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="button button-dark" disabled={!selected || busy} onClick={() => void confirm()}>
        {busy && <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />}
        {busy ? 'Salvando…' : 'Confirmar situação'}
      </button>
    </div>
  </Dialog>, document.body);
}
