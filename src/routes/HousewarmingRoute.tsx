import { useEffect, useRef, useState, type FormEvent } from 'react';
import { cancelHousewarmingReservation, fetchHousewarming, readHousewarmingEntries, saveHousewarming, updateItem } from '../api';
import type { EnxovalItem, EnxovalSummary } from '../types';
import type { HousewarmingManagement, HousewarmingSettings, PixKeyType } from '../housewarming';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Gift, Copy, ExternalLink, MessageCircleHeart, Link2, Lock, PackageCheck, Search, ShieldCheck } from '../components/icons';
import { Dialog } from '../components/Dialog';
import { DatePicker } from '../components/DatePicker';
import { useHousewarmingLive } from '../hooks/useHousewarmingLive';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'Ops, tropeçamos aqui. Tente de novo.';
const settingsKey = (settings: HousewarmingSettings | null) => settings && JSON.stringify([settings.slug, settings.title, settings.message, settings.eventDate,
  settings.isPublic, settings.pix && [settings.pix.key, settings.pix.keyType, settings.pix.receiverName, settings.pix.city], [...settings.itemIds].sort()]);
const formatEventDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
function groupByRoom(list: EnxovalItem[]) {
  const rooms = new Map<string, EnxovalItem[]>();
  for (const item of list) rooms.set(item.category, [...(rooms.get(item.category) ?? []), item]);
  return [...rooms];
}
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
  const [tab, setTab] = useState<'invite' | 'inbox'>('invite');
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
  const selectItems = (ids: string[], checked: boolean) => {
    const next = new Set(selected);
    for (const id of ids) { if (!checked) next.delete(id); else if (next.size < 500) next.add(id); }
    update({ itemIds: [...next] });
  };
  const term = search.toLocaleLowerCase('pt-BR');
  const openItems = items.filter(item => item.status === 'researching');
  const conqueredSelected = items.filter(item => item.status !== 'researching' && selected.has(item.id));
  const rooms = groupByRoom(openItems.filter(item => item.name.toLocaleLowerCase('pt-BR').includes(term)));
  const activeReservations = data?.inbox.filter(entry => entry.kind === 'reservation' && !entry.cancelledAt) ?? [];
  const unread = data?.unreadCount ?? 0;
  const isLive = Boolean(data?.list?.isPublic);
  const dirty = !data?.list || settingsKey(draft) !== settingsKey({ ...data.list, itemIds: data.itemIds });

  return <section className="housewarming-manager">
    <header className="housewarming-intro">
      <div>
        <h2><Gift size={28} aria-hidden="true" /> Chá de Casa Nova</h2>
        <p>Escolha os presentes, escreva seu convite e compartilhe com quem faz parte da sua história.</p>
      </div>
      {data && <span className={`housewarming-state${isLive ? ' is-live' : ''}`}>{isLive ? 'Convite no ar' : 'Rascunho'}</span>}
    </header>
    {error && <div className="form-error" role="alert">{error} {!draft && <Button variant="outline" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Tentar de novo</Button>}</div>}
    <p role="status" className="housewarming-feedback">{status}</p>
    {!draft ? <p role="status">Preparando seu Chá…</p> : <>
      <div className="housewarming-tabs" role="tablist" aria-label="Seções do Chá">
        <button type="button" role="tab" id="housewarming-tab-invite" aria-controls="housewarming-pane-invite" aria-selected={tab === 'invite'} onClick={() => setTab('invite')}>Convite</button>
        <button type="button" role="tab" id="housewarming-tab-inbox" aria-controls="housewarming-pane-inbox" aria-selected={tab === 'inbox'} onClick={() => setTab('inbox')}>
          Recados e reservas{unread > 0 && <span className="housewarming-count"><span aria-hidden="true">{unread}</span><span className="sr-only">, {unread} {unread === 1 ? 'novidade' : 'novidades'}</span></span>}
        </button>
      </div>
      <div className="housewarming-layout" data-tab={tab}>
        <section className={`housewarming-share${isLive ? ' is-live' : ''}`} aria-labelledby="housewarming-share-title" data-pane="invite">
          <div className="housewarming-preview" aria-hidden="true">
            <Gift size={22} />
            <strong>{draft.title || 'Chá de Casa Nova'}</strong>
            {draft.eventDate && <span>{formatEventDate(draft.eventDate)}</span>}
          </div>
          <div className="housewarming-share-body">
            <h3 id="housewarming-share-title">{isLive ? 'Seu convite está no ar' : 'Prepare tudo no seu tempo'}</h3>
            <p className="housewarming-share-meta">{selected.size} {selected.size === 1 ? 'presente' : 'presentes'} no convite{draft.pix ? ' · Pix ativo' : ''}</p>
            {isLive ? <>
              <label>Link para compartilhar<span className="housewarming-field-icon"><Link2 size={17} aria-hidden="true" /><Input readOnly value={link} onFocus={event => event.target.select()} /></span></label>
              <div className="housewarming-actions">
                <Button variant="brand" size="brand" className="button button-dark" onClick={() => void action(async () => { await navigator.clipboard.writeText(link); setStatus('Link copiado. Agora é só enviar seu convite.'); })}><Copy size={17} /> Copiar link</Button>
                <Button asChild variant="outline"><a href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} /> Ver convite</a></Button>
              </div>
            </> : <p>Salve o rascunho e publique quando estiver pronto para receber os convidados.</p>}
          </div>
        </section>

        <form className="housewarming-form" onSubmit={save} data-pane="invite" id="housewarming-pane-invite">
          {!canEdit && <p className="housewarming-hint"><Lock size={17} aria-hidden="true" /> Quem criou o enxoval pode editar e publicar o convite. Você pode acompanhar os recados e confirmar os presentes recebidos.</p>}
          <fieldset disabled={!canEdit || busy}>
            <section className="housewarming-card" aria-labelledby="housewarming-invite-title">
              <h3 id="housewarming-invite-title">Seu convite</h3>
              <label>Título do Chá<Input required minLength={3} maxLength={120} value={draft.title} onChange={event => update({ title: event.target.value })} /></label>
              <label>Mensagem de boas-vindas<Textarea maxLength={1000} rows={4} value={draft.message} onChange={event => update({ message: event.target.value })} /></label>
              <div className="housewarming-fields">
                <label><span className="housewarming-label">Data do Chá <span>(opcional)</span></span><DatePicker value={draft.eventDate} onChange={eventDate => update({ eventDate })} disablePast /></label>
                <label>Nome do link<Input required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.slug} onChange={event => update({ slug: event.target.value })} />
                  <small>/cha/{draft.slug} · Se mudar, o link anterior deixa de funcionar.</small></label>
              </div>
            </section>

            <section className="housewarming-card" aria-labelledby="housewarming-gifts-title">
              <div className="housewarming-card-heading"><h3 id="housewarming-gifts-title">Presentes da lista</h3><span>{selected.size} no convite</span></div>
              <p>Só aparecem aqui os itens que ainda estão na fila. Preços e anotações ficam no enxoval.</p>
              <label>Buscar um item<span className="housewarming-field-icon"><Search size={17} aria-hidden="true" /><Input type="search" value={search} onChange={event => setSearch(event.target.value)} /></span></label>
              <div className="housewarming-item-picker" role="group" aria-label="Itens do convite">
                {!rooms.length && <p className="housewarming-empty">{search ? 'Nenhum item na fila com esse nome.' : items.length ? 'Todos os itens do enxoval já foram conquistados.' : 'Adicione itens em Meu enxoval para escolher os presentes.'}</p>}
                {rooms.map(([room, roomItems]) => {
                  const ids = roomItems.map(item => item.id);
                  const chosen = ids.filter(id => selected.has(id)).length;
                  const all = chosen === ids.length;
                  return <div key={room} className="housewarming-room">
                    <div className="housewarming-room-heading">
                      <span><strong>{room}</strong> {chosen} de {ids.length}</span>
                      <button type="button" onClick={() => selectItems(ids, !all)} disabled={!all && selected.size >= 500}>{all ? 'Tirar todos' : 'Escolher todos'}<span className="sr-only"> de {room}</span></button>
                    </div>
                    {roomItems.map(item => <label key={item.id} className="housewarming-pick">
                      <input type="checkbox" checked={selected.has(item.id)} disabled={!selected.has(item.id) && selected.size >= 500}
                        onChange={event => selectItems([item.id], event.target.checked)} />
                      <span>{item.name}</span>
                    </label>)}
                  </div>;
                })}
              </div>
              {selected.size >= 500 && <small>O convite comporta até 500 presentes.</small>}
              {conqueredSelected.length > 0 && <div className="housewarming-note">
                <p>{conqueredSelected.length === 1 ? '1 item já conquistado continua' : `${conqueredSelected.length} itens já conquistados continuam`} no convite, marcado como presenteado.</p>
                <Button type="button" variant="outline" onClick={() => selectItems(conqueredSelected.map(item => item.id), false)}>Tirar do convite</Button>
              </div>}
            </section>

            <section className="housewarming-card" aria-labelledby="housewarming-pix-title">
              <h3 id="housewarming-pix-title">Presentear via Pix</h3>
              <label className="housewarming-switch"><span>Aceitar carinho em forma de Pix<small>Quem preferir pode enviar um valor direto para a sua chave.</small></span>
                <input type="checkbox" checked={Boolean(draft.pix)} onChange={event => update({ pix: event.target.checked ? { key: '', keyType: 'random', receiverName: '', city: '' } : null })} /></label>
              {draft.pix && <div className="housewarming-pix-fields">
                <p className="housewarming-hint"><ShieldCheck size={17} aria-hidden="true" /> A chave fica visível a quem tiver o link. Prefira uma chave aleatória para preservar seus dados pessoais.</p>
                <div className="housewarming-fields">
                  <label>Tipo da chave<select value={draft.pix.keyType} onChange={event => changePix('keyType', event.target.value as PixKeyType)}>
                    <option value="random">Aleatória</option><option value="email">E-mail</option><option value="phone">Celular</option><option value="cpf">CPF</option>
                  </select></label>
                  <label>Chave Pix<Input required maxLength={77} value={draft.pix.key} onChange={event => changePix('key', event.target.value)} /></label>
                  <label>Nome do favorecido<Input required minLength={2} maxLength={25} value={draft.pix.receiverName} onChange={event => changePix('receiverName', event.target.value)} /><small>Como aparece na conta que recebe o Pix.</small></label>
                  <label>Cidade do favorecido<Input required minLength={2} maxLength={15} value={draft.pix.city} onChange={event => changePix('city', event.target.value)} /></label>
                </div>
              </div>}
            </section>

            <section className="housewarming-card" aria-labelledby="housewarming-publish-title">
              <h3 id="housewarming-publish-title">Publicação</h3>
              <label className="housewarming-switch"><span>Deixar o convite disponível pelo link<small>O convite mostra o título, a mensagem, a data, os itens escolhidos e o Pix, se cadastrado. Nomes, e-mails e recados ficam só com os moradores.</small></span>
                <input type="checkbox" checked={draft.isPublic} onChange={event => update({ isPublic: event.target.checked })} /></label>
            </section>

            {canEdit && <div className="housewarming-savebar">
              <span className={dirty ? 'is-dirty' : undefined}>{!data?.list ? 'Convite ainda não salvo' : dirty ? 'Há alterações para salvar' : isLive ? 'Tudo salvo · convite no ar' : 'Tudo salvo · rascunho'}</span>
              <Button type="submit" variant="brand" size="brand" className="button button-dark" disabled={busy}>{busy ? 'Salvando…' : 'Salvar convite'}</Button>
            </div>}
          </fieldset>
        </form>

        <section className="housewarming-card housewarming-inbox-card" aria-labelledby="housewarming-inbox" data-pane="inbox" id="housewarming-pane-inbox">
          <div className="housewarming-card-heading"><h3 id="housewarming-inbox"><MessageCircleHeart size={22} /> Carinho recebido</h3>
            {unread > 0 && <span>{unread} {unread === 1 ? 'novidade' : 'novidades'}</span>}</div>
          <p>Reservar não marca um item como recebido: confirme quando o presente chegar.</p>
          {unread > 0 && <Button variant="outline" disabled={busy} onClick={() => void action(async () => {
            await readHousewarmingEntries(enxoval.id, data!.inbox.map(entry => entry.id)); setData(await fetchHousewarming(enxoval.id)); setStatus('Novidades marcadas como lidas.');
          })}>Marcar as novidades visíveis como lidas</Button>}
          {!data?.inbox.length && <p className="housewarming-empty">Os recados e as reservas vão aparecer aqui. O app confere as novidades enquanto esta tela está aberta.</p>}
          <ol className="housewarming-inbox">{data?.inbox.map(entry => <li key={entry.id} className={!entry.readAt && !entry.cancelledAt ? 'is-new' : undefined}>
            <span className="housewarming-avatar" aria-hidden="true">{entry.name.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?'}</span>
            <div>
              <p><strong>{entry.name}</strong>{entry.kind === 'reservation' ? ` reservou ${entry.itemName}` : ' deixou um recado'}{!entry.readAt && !entry.cancelledAt && <span className="housewarming-badge">Novo</span>}</p>
              <small>{new Date(entry.createdAt).toLocaleString('pt-BR')}{entry.email ? ` · ${entry.email}` : ''}</small>
              {entry.message && <blockquote>{entry.message}</blockquote>}
              {entry.cancelledAt ? <small>Reserva liberada</small> : entry.kind === 'reservation' && <div className="housewarming-actions">
                {entry.itemStatus === 'researching' ? <>
                  <Button variant="outline" disabled={busy} onClick={() => void action(async () => {
                    const saved = await updateItem(entry.itemId!, { status: 'received' }); onSavedItem(saved); setData(await fetchHousewarming(enxoval.id)); setStatus('Presente recebido. O carinho já ficou guardado no item.');
                  })}><PackageCheck size={17} /> Já recebi este presente</Button>
                  {canEdit && <Button variant="ghost" disabled={busy} onClick={() => setReleasing(entry.id)}>Liberar reserva</Button>}
                </> : <span className="housewarming-badge">Item conquistado</span>}
              </div>}
            </div>
          </li>)}</ol>
          {data?.inbox.length === 100 && <p>Mostrando até 100 novidades, com as não lidas primeiro. Marque as visíveis como lidas para acompanhar as demais.</p>}
          {activeReservations.length > 0 && <small>Quem reservou fica registrado no item para facilitar o agradecimento.</small>}
        </section>
      </div>
    </>}
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
