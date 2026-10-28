import { useEffect, useRef, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { ApiError, fetchPublicHousewarming, sendHousewarmingGuest } from '../api';
import type { PublicHousewarming } from '../housewarming';
import { Brand } from './Brand';
import { Dialog } from './Dialog';
import { Gift, Heart, Copy, CalendarDays, MessageCircleHeart } from './icons';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { useHousewarmingLive } from '../hooks/useHousewarmingLive';

const failure = (error: unknown) => error instanceof Error ? error.message : 'Ops, tropeçamos aqui. Tente de novo.';

function GuestForm({ slug, item, onSent, onClose }: {
  slug: string; item: PublicHousewarming['items'][number] | null; onSent: (message: string) => void; onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      await sendHousewarmingGuest(slug, item ? 'reservations' : 'messages', {
        requestId: requestId.current, name, message, ...(item ? { email, itemId: item.id } : {}),
      });
      onSent(item ? `Carinho reservado: ${item.name}. Combine a entrega com os moradores.` : 'Seu recado já chegou aos moradores. Obrigado pelo carinho!');
    } catch (err) { setError(failure(err)); } finally { setBusy(false); }
  }
  return <Dialog title={item ? `Presentear com ${item.name}` : 'Um recado para a casa nova'} isOpen onClose={onClose} busy={busy} className="housewarming-dialog">
    <form className="housewarming-form" onSubmit={submit}>
      <p>{item ? 'Vamos guardar sua escolha para evitar presentes repetidos. A entrega é combinada diretamente com os moradores.' : 'Deixe suas boas-vindas para esse novo capítulo.'}</p>
      <label>Seu nome<Input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label>
      {item && <label>Seu e-mail<Input required type="email" maxLength={254} autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} /></label>}
      <label>Seu recado {item && <span>(opcional)</span>}<Textarea required={!item} maxLength={500} rows={4} value={message} onChange={event => setMessage(event.target.value)} disabled={busy} /></label>
      <small>Seu nome{item ? ', e-mail' : ''} e recado ficam visíveis apenas para os moradores. <a href="/privacidade" target="_blank" rel="noopener noreferrer">Como cuidamos dos seus dados</a>.</small>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="housewarming-actions"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Voltar</Button>
        <Button type="submit" variant="brand" size="brand" className="button button-dark" disabled={busy}>{busy ? 'Enviando carinho…' : item ? 'Reservar este presente' : 'Enviar recado'}</Button></div>
    </form>
  </Dialog>;
}

function PixDialog({ pix, onClose }: { pix: NonNullable<PublicHousewarming['pix']>; onClose: () => void }) {
  const [qr, setQr] = useState('');
  const [status, setStatus] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(pix.payload, { width: 280, margin: 4, errorCorrectionLevel: 'M' })
      .then(url => { if (alive) setQr(url); }).catch(() => { if (alive) setStatus('Use o código copia e cola abaixo para presentear.'); });
    return () => { alive = false; };
  }, [pix.payload]);
  return <Dialog title="Carinho em forma de Pix" isOpen onClose={onClose} className="housewarming-dialog">
    <div className="housewarming-pix">
      <p>Escolha o valor no aplicativo do seu banco. O Pix vai direto para <strong>{pix.receiverName}</strong>.</p>
      {qr ? <img src={qr} width={280} height={280} alt="QR Code Pix para presentear os moradores" /> : <p role="status">Preparando QR Code…</p>}
      <label>Código Pix copia e cola<Textarea ref={field} value={pix.payload} readOnly rows={4} onFocus={event => event.target.select()} /></label>
      <Button variant="brand" size="brand" className="button button-dark" onClick={async () => {
        try { await navigator.clipboard.writeText(pix.payload); setStatus('Código copiado. Abra o Pix copia e cola no seu banco.'); }
        catch { field.current?.focus(); field.current?.select(); setStatus('Selecione e copie o código acima.'); }
      }}><Copy size={18} /> Copiar código Pix</Button>
      <p role="status">{status}</p>
      <small>Confira o favorecido no banco antes de confirmar. O Casa Mia não recebe o dinheiro nem confirma a transferência.</small>
    </div>
  </Dialog>;
}

export function HousewarmingPage() {
  const slug = window.location.pathname.split('/')[2] ?? '';
  const [data, setData] = useState<PublicHousewarming | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [category, setCategory] = useState('');
  const [dialog, setDialog] = useState<'message' | 'pix' | PublicHousewarming['items'][number] | null>(null);
  const unavailable = useRef(false);
  useHousewarmingLive(`/api/public/housewarming/${encodeURIComponent(slug)}/events`, () => setAttempt(value => value + 1));
  useEffect(() => {
    let alive = true;
    let loading = false;
    const load = async () => {
      if (loading || document.visibilityState === 'hidden') return;
      loading = true;
      try {
        const next = await fetchPublicHousewarming(slug);
        if (alive) { setData(next); setError(''); unavailable.current = false; document.title = `${next.title} | Casa Mia`; }
      } catch (err) {
        if (alive) {
          setError(failure(err));
          if (err instanceof ApiError && err.status === 404) { setData(null); setDialog(null); unavailable.current = true; }
        }
      } finally { loading = false; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    window.addEventListener('focus', load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [slug, attempt]);
  const sent = (message: string) => { setDialog(null); setSuccess(message); setAttempt(value => value + 1); };
  const categories = [...new Set(data?.items.map(item => item.category))];
  return <div className="housewarming-public">
    <header className="housewarming-public-header"><a href="/" aria-label="Casa Mia, página inicial"><Brand /></a><a href="/comecar" className="housewarming-home-link">Monte seu enxoval</a></header>
    <main>
      {!data ? <section className="housewarming-unavailable"><Gift size={44} aria-hidden="true" />
        <h1>{error ? 'Vamos encontrar esse convite?' : 'Preparando um convite cheio de carinho…'}</h1>
        {error && <><p role="alert">{error}</p><p>{unavailable.current ? 'Confira o link com os moradores. O convite pode estar sendo preparado.' : 'Confira sua conexão e tente novamente.'}</p>
          <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Tentar de novo</Button></>}
      </section> : <>
        <section className="housewarming-hero"><div className="housewarming-hero-copy"><span className="eyebrow">Um novo capítulo, juntos</span>
          <h1>{data.title}</h1><p className="housewarming-invitation-message">{data.message}</p>
          {data.eventDate && <p className="housewarming-date"><CalendarDays size={20} aria-hidden="true" />{new Date(`${data.eventDate}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>}
          <div className="housewarming-actions">{Boolean(data.items.length) && <Button asChild variant="brand" size="brand" className="button button-dark"><a href="#presentes"><Gift size={19} /> Escolher um presente</a></Button>}
            {data.pix && <Button variant="outline" onClick={() => setDialog('pix')}><Heart size={19} /> Presentear via Pix</Button>}
            <Button variant="ghost" onClick={() => setDialog('message')}><MessageCircleHeart size={19} /> Deixar um recado</Button>
          </div></div><div className="housewarming-nino"><img src="/brand/nino-logo.webp" alt="Nino, o companheiro da casa nova" width={224} height={264} /><span>Cada carinho encontra seu lugar.</span></div>
        </section>
        {success && <p role="status" className="housewarming-success">{success}</p>}
        {error && <p role="alert" className="form-error">{error}</p>}
        <section id="presentes" className="housewarming-gifts" aria-labelledby="housewarming-gifts-title">
          <div className="housewarming-section-title"><div><span className="eyebrow">Pequenos começos, grandes memórias</span><h2 id="housewarming-gifts-title">Um presente para o novo lar</h2></div>
            <span>{data.items.filter(item => item.availability === 'available').length} {data.items.filter(item => item.availability === 'available').length === 1 ? 'disponível' : 'disponíveis'}</span></div>
          <p>Escolha com carinho e reserve para evitar presentes repetidos. Depois, combine a entrega com os moradores.</p>
          {categories.length > 1 && <div className="housewarming-filters" role="group" aria-label="Filtrar presentes por ambiente">
            {['', ...categories].map(name => <Button key={name} variant={category === name ? 'default' : 'outline'} aria-pressed={category === name} onClick={() => setCategory(name)}>{name || 'Todos'}</Button>)}
          </div>}
          {!data.items.length ? <div className="housewarming-panel"><p>{data.pix ? 'Quer participar desse começo? Você pode presentear pelo Pix ou deixar um recado de boas-vindas.' : 'Os moradores estão preparando a lista. Enquanto isso, deixe um recado de carinho.'}</p></div>
            : <ul className="housewarming-gift-grid">{data.items.filter(item => !category || item.category === category).map(item => <li key={item.id} className={`housewarming-gift-card is-${item.availability}`}>
              <span className="housewarming-gift-symbol"><Gift size={30} aria-hidden="true" /></span><span className="eyebrow">{item.category}</span><h3>{item.name}</h3>
              <span className="housewarming-availability">{item.availability === 'available' ? 'À espera de carinho' : item.availability === 'reserved' ? 'Já reservado' : 'Já conquistado'}</span>
              <Button variant={item.availability === 'available' ? 'outline' : 'ghost'} disabled={item.availability !== 'available'} onClick={() => setDialog(item)}>
                {item.availability === 'available' ? 'Vou presentear com este item' : item.availability === 'reserved' ? 'Alguém já escolheu este presente' : 'Este carinho já chegou'}
              </Button></li>)}</ul>}
        </section>
        <section className="housewarming-message-cta"><MessageCircleHeart size={32} aria-hidden="true" /><h2>Palavras também fazem um lar.</h2><p>Um desejo de felicidade, uma lembrança boa, suas boas-vindas. Deixe seu carinho para os moradores.</p>
          <Button variant="outline" onClick={() => setDialog('message')}>Escrever um recado</Button></section>
      </>}
    </main>
    <footer className="housewarming-public-footer"><a href="/" aria-label="Casa Mia"><Brand compact /></a><p>Lista organizada com amor no Casa Mia.<br />Monte o seu enxoval também.</p>
      <Button asChild variant="brand" size="brand" className="button button-dark"><a href="/comecar">Começar grátis</a></Button><a href="/privacidade">Privacidade</a></footer>
    {dialog === 'pix' && data?.pix && <PixDialog pix={data.pix} onClose={() => setDialog(null)} />}
    {dialog && dialog !== 'pix' && <GuestForm key={typeof dialog === 'string' ? dialog : dialog.id} slug={slug} item={dialog === 'message' ? null : dialog} onSent={sent} onClose={() => setDialog(null)} />}
  </div>;
}
