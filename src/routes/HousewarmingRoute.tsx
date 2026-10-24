import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cancelHousewarmingReservation, fetchHousewarming, readHousewarmingEntries, saveHousewarming, updateItem } from '../api';
import type { EnxovalItem, EnxovalSummary } from '../types';
import type { HousewarmingManagement, HousewarmingSettings, PixKeyType } from '../housewarming';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Gift, Copy, ExternalLink, MessageCircleHeart } from '../components/icons';
import { Dialog } from '../components/Dialog';
import { useHousewarmingLive } from '../hooks/useHousewarmingLive';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Ops, tropeçamos aqui. Tente de novo.';
const slugify = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '');

export default function HousewarmingRoute({ enxoval, items, canEdit, onSavedItem, onRefresh }: {
  enxoval: EnxovalSummary; items: EnxovalItem[]; canEdit: boolean;
  onSavedItem: (item: EnxovalItem) => void; onRefresh: () => void;
}) {
  const [data, setData] = useState<HousewarmingManagement | null>(null);
  const [draft, setDraft] = useState<HousewarmingSettings | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const initialized = useRef(false);
  const [attempt, setAttempt] = useState(0);
  useHousewarmingLive(`/api/enxovais/${encodeURIComponent(enxoval.id)}/housewarming/events`, () => setAttempt(value => value + 1));
  useEffect(() => {
    let alive = true;
    let loading = false;
    const load = async () => {
      if (loading || document.visibilityState === 'hidden') return;
      loading = true;
      try {
        const next = await fetchHousewarming(enxoval.id);
        if (!alive) return;
        setData(next);
        if (!initialized.current) {
          initialized.current = true;
          setDraft(next.list ? { ...next.list, itemIds: next.itemIds } : {
            slug: `${slugify(enxoval.name) || 'meu-lar'}-${enxoval.id.slice(0, 6)}`, title: `Chá de Casa Nova: ${enxoval.name}`.slice(0, 120),
            message: 'Estamos montando nosso cantinho. Sua presença e seu carinho já são um presente!',
            eventDate: null, isPublic: false, itemIds: [], pix: null,
          });
        }
      } catch (err) { if (alive) setError(errorText(err)); }
      finally { loading = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    window.addEventListener('focus', load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [enxoval.id, enxoval.name, attempt]);

  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setStatus('');
    try { await work(); } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    await action(async () => {
      const saved = await saveHousewarming(enxoval.id, draft);
      setData(saved); setDraft({ ...saved.list!, itemIds: saved.itemIds });
      setStatus(saved.list?.isPublic ? 'Seu Chá está publicado. O link já pode ser compartilhado.' : 'Rascunho salvo. A página está fora do ar.');
    });
  }
  const link = data?.list ? `${window.location.origin}/cha/${data.list.slug}` : '';
  const update = (patch: Partial<HousewarmingSettings>) => setDraft(current => current && ({ ...current, ...patch }));
  const changePix = (field: 'key' | 'keyType' | 'receiverName' | 'city', value: string) => {
    if (draft?.pix) update({ pix: { ...draft.pix, [field]: value } });
  };
  const selected = new Set(draft?.itemIds);
  const visibleItems = items.filter(item => item.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
  const activeReservations = data?.inbox.filter(entry => entry.kind === 'reservation' && !entry.cancelledAt) ?? [];

  return <section className="housewarming-manager">
    <header className="housewarming-heading"><span className="eyebrow">Um lar cercado de carinho</span>
      <h2><Gift size={28} aria-hidden="true" /> Chá de Casa Nova</h2>
      <p>Escolha os presentes, escreva seu convite e compartilhe com quem faz parte da sua história.</p>
    </header>
    {error && <div className="form-error" role="alert">{error} {!draft && <Button variant="outline" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Tentar de novo</Button>}</div>}
    <p role="status" className="housewarming-feedback">{status}</p>
    {!draft ? <p role="status">Preparando seu Chá…</p> : <div className="housewarming-layout">
      <form className="housewarming-panel housewarming-form" onSubmit={save}>
        <h3>Seu convite</h3>
        {!canEdit && <p>Quem criou o enxoval pode editar e publicar o convite. Você pode acompanhar os recados e confirmar os presentes recebidos.</p>}
        <fieldset disabled={!canEdit || busy}>
          <label>Título do Chá<Input required minLength={3} maxLength={120} value={draft.title} onChange={event => update({ title: event.target.value })} /></label>
          <label>Mensagem de boas-vindas<Textarea maxLength={1000} rows={4} value={draft.message} onChange={event => update({ message: event.target.value })} /></label>
          <label>Data do Chá <span>(opcional)</span><Input type="date" value={draft.eventDate ?? ''} onChange={event => update({ eventDate: event.target.value || null })} /></label>
          <label>Nome do link<Input required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.slug} onChange={event => update({ slug: event.target.value })} />
            <small>/cha/{draft.slug} · Se mudar, o link anterior deixa de funcionar.</small></label>
          <div className="housewarming-section-title"><h3>Presentes da lista</h3><span>{selected.size}/500 selecionados</span></div>
          <p>Somente os itens marcados abaixo aparecem no convite. Preços e anotações ficam no enxoval.</p>
          <label>Buscar um item<Input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <div className="housewarming-item-picker" role="group" aria-label="Itens do convite">
            {!visibleItems.length && <p>{items.length ? 'Nenhum item com esse nome.' : 'Adicione itens em Meu enxoval para escolher os presentes.'}</p>}
            {visibleItems.map(item => <label key={item.id} className="housewarming-check"><input type="checkbox" checked={selected.has(item.id)}
              disabled={!selected.has(item.id) && selected.size >= 500}
              onChange={event => update({ itemIds: event.target.checked ? [...selected, item.id] : [...selected].filter(id => id !== item.id) })} />
              <span>{item.name}<small>{item.category}{item.status !== 'researching' ? ' · Já conquistado' : ''}</small></span>
            </label>)}
          </div>
          <h3>Presentear via Pix</h3>
          <label className="housewarming-check"><input type="checkbox" checked={Boolean(draft.pix)} onChange={event => update({ pix: event.target.checked ? { key: '', keyType: 'random', receiverName: '', city: '' } : null })} /> Aceitar carinho em forma de Pix</label>
          {draft.pix && <div className="housewarming-pix-fields">
            <p>A chave ficará visível a quem tiver o link. Prefira uma chave aleatória para preservar seus dados pessoais.</p>
            <label>Tipo da chave<select value={draft.pix.keyType} onChange={event => changePix('keyType', event.target.value as PixKeyType)}>
              <option value="random">Aleatória</option><option value="email">E-mail</option><option value="phone">Celular</option><option value="cpf">CPF</option>
            </select></label>
            <label>Chave Pix<Input required maxLength={77} value={draft.pix.key} onChange={event => changePix('key', event.target.value)} /></label>
            <label>Nome do favorecido<Input required minLength={2} maxLength={25} value={draft.pix.receiverName} onChange={event => changePix('receiverName', event.target.value)} /><small>Como aparece na conta que recebe o Pix.</small></label>
            <label>Cidade do favorecido<Input required minLength={2} maxLength={15} value={draft.pix.city} onChange={event => changePix('city', event.target.value)} /></label>
          </div>}
          <h3>Publicação</h3>
          <label className="housewarming-check"><input type="checkbox" checked={draft.isPublic} onChange={event => update({ isPublic: event.target.checked })} /> Deixar o convite disponível pelo link</label>
          <p>O convite mostra o título, a mensagem, a data, os itens escolhidos e o Pix, se cadastrado. Nomes, e-mails e recados de convidados ficam só com os moradores.</p>
          {canEdit && <Button type="submit" variant="brand" size="brand" className="button button-dark" disabled={busy}>{busy ? 'Salvando…' : 'Salvar convite'}</Button>}
        </fieldset>
      </form>
      <aside className="housewarming-side">
        <section className="housewarming-panel"><h3>{data?.list?.isPublic ? 'Seu convite está no ar' : 'Prepare tudo no seu tempo'}</h3>
          {data?.list?.isPublic ? <><label>Link para compartilhar<Input readOnly value={link} onFocus={event => event.target.select()} /></label>
            <div className="housewarming-actions"><Button variant="outline" onClick={() => void action(async () => { await navigator.clipboard.writeText(link); setStatus('Link copiado. Agora é só enviar seu convite.'); })}><Copy size={17} /> Copiar link</Button>
              <Button asChild variant="outline"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /> Ver convite</a></Button></div>
          </> : <p>Salve seu rascunho e publique quando estiver pronto para receber os convidados.</p>}
        </section>
        <section className="housewarming-panel" aria-labelledby="housewarming-inbox"><h3 id="housewarming-inbox"><MessageCircleHeart size={22} /> Carinho recebido</h3>
          <p>{data?.unreadCount ?? 0} {data?.unreadCount === 1 ? 'novidade' : 'novidades'} para ler. Reservar não marca um item como recebido.</p>
          {Boolean(data?.unreadCount) && <Button variant="outline" disabled={busy} onClick={() => void action(async () => {
            await readHousewarmingEntries(enxoval.id, data!.inbox.map(entry => entry.id)); setData(await fetchHousewarming(enxoval.id)); setStatus('Novidades marcadas como lidas.');
          })}>Marcar as novidades visíveis como lidas</Button>}
          {!data?.inbox.length && <p>Os recados e as reservas vão aparecer aqui. O app confere as novidades enquanto esta tela está aberta.</p>}
          <ol className="housewarming-inbox">{data?.inbox.map(entry => <li key={entry.id}>
            <p><strong>{entry.name}</strong>{entry.kind === 'reservation' ? ` reservou ${entry.itemName}` : ' deixou um recado'}{!entry.readAt && !entry.cancelledAt && <span className="housewarming-badge">Novo</span>}</p>
            <small>{new Date(entry.createdAt).toLocaleString('pt-BR')}{entry.email ? ` · ${entry.email}` : ''}</small>
            {entry.message && <blockquote>{entry.message}</blockquote>}
            {entry.cancelledAt ? <small>Reserva liberada</small> : entry.kind === 'reservation' && <div className="housewarming-actions">
              {entry.itemStatus === 'researching' ? <>
                <Button variant="outline" disabled={busy} onClick={() => void action(async () => {
                  const saved = await updateItem(entry.itemId!, { status: 'received' }); onSavedItem(saved); setData(await fetchHousewarming(enxoval.id)); setStatus('Presente recebido. O carinho já ficou guardado no item.');
                })}>Já recebi este presente</Button>
                {canEdit && <Button variant="ghost" disabled={busy} onClick={() => setReleasing(entry.id)}>Liberar reserva</Button>}
              </> : <span className="housewarming-badge">Item conquistado</span>}
            </div>}
          </li>)}</ol>
          {data?.inbox.length === 100 && <p>Mostrando até 100 novidades, com as não lidas primeiro. Marque as visíveis como lidas para acompanhar as demais.</p>}
          {activeReservations.length > 0 && <small>Quem reservou fica registrado no item para facilitar o agradecimento.</small>}
        </section>
      </aside>
    </div>}
    <Dialog title="Liberar este presente?" isOpen={Boolean(releasing)} onClose={() => setReleasing(null)} busy={busy}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p>O item ficará disponível para outra pessoa reservar. Combine antes com quem escolheu o presente.</p>
      <div className="housewarming-actions"><Button variant="outline" disabled={busy} onClick={() => setReleasing(null)}>Manter reserva</Button>
        <Button disabled={busy} onClick={() => void action(async () => {
          await cancelHousewarmingReservation(enxoval.id, releasing!); setReleasing(null); setData(await fetchHousewarming(enxoval.id)); onRefresh(); setStatus('Reserva liberada.');
        })}>Liberar reserva</Button></div>
    </Dialog>
  </section>;
}
