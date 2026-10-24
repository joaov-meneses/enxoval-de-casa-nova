import { useEffect, useId, useState } from 'react';
import { fetchFiscalBilling, formatBillingAmount, updateFiscalProfile, type FiscalBilling } from '../api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import type { FiscalAddress } from '../../shared/fiscal';

const EMPTY_ADDRESS: FiscalAddress = { logradouro: '', numero: '', complemento: '', bairro: '', codigo_municipio: '', uf: '', cep: '' };

const STATUS: Record<FiscalBilling['invoices'][number]['status'], string> = {
  pending: 'Aguardando emissão', processing: 'Em processamento', authorized: 'Emitida', cancelled: 'Cancelada',
  needs_data: 'Complete os dados fiscais abaixo', rejected: 'Emissão precisa de revisão pela equipe', failed: 'Emissão temporariamente indisponível',
};

export function FiscalBillingSection() {
  const id = useId();
  const [data, setData] = useState<FiscalBilling | null>(null);
  const [profile, setProfile] = useState<FiscalBilling['profile']>({ name: '', document: '' });
  const [municipalities, setMunicipalities] = useState<{ id: string; name: string; state: string }[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    fetchFiscalBilling().then(result => { if (active) { setData(result); setProfile(result.profile); } })
      .catch(() => { if (active) setError('Não foi possível carregar suas notas fiscais.'); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (!data?.enabled) return;
    const controller = new AbortController();
    fetch('/data/municipios-ibge.json', { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('municipalities');
      return response.json();
    }).then(setMunicipalities).catch(err => {
      if (err.name !== 'AbortError') setError('Não foi possível carregar as cidades. Toque em Atualizar notas para tentar novamente.');
    });
    return () => controller.abort();
  }, [data?.enabled, attempt]);
  if (!data) return <div className="profile-fiscal">{error ? <><p role="alert">{error}</p><Button type="button" variant="outline" onClick={() => setAttempt(value => value + 1)}>Tentar novamente</Button></> : <p role="status">Carregando notas fiscais…</p>}</div>;
  if (!data.enabled && !data.invoices.length) return null;
  const address = profile.address || EMPTY_ADDRESS;
  const updateAddress = (key: keyof FiscalAddress, value: string) => setProfile(current => ({ ...current, address: { ...(current.address || EMPTY_ADDRESS), [key]: value } }));
  return <section className="profile-fiscal" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Notas fiscais</h3>
    <p>As notas acompanham os pagamentos e o calendário fiscal da assinatura. O período de teste sem cobrança não gera nota.</p>
    {data.enabled && <form className="profile-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); setNotice('');
      try { await updateFiscalProfile(profile); setNotice('Dados fiscais salvos. Notas que aguardavam esses dados serão processadas novamente.'); setAttempt(value => value + 1); }
      catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar os dados fiscais.'); }
      finally { setBusy(false); }
    }}>
      <Label htmlFor={`${id}-name`}>Nome completo ou razão social</Label>
      <Input id={`${id}-name`} value={profile.name} onChange={event => setProfile(current => ({ ...current, name: event.target.value }))} minLength={2} maxLength={120} autoComplete="billing name" required disabled={busy} />
      <Label htmlFor={`${id}-document`}>CPF ou CNPJ</Label>
      <Input id={`${id}-document`} value={profile.document} onChange={event => setProfile(current => ({ ...current, document: event.target.value }))} inputMode="numeric" maxLength={18} required disabled={busy} />
      <details open={data.requireAddress || undefined}>
        <summary>Endereço de cobrança{data.requireAddress ? '' : ' (opcional)'}</summary>
        <div className="profile-form profile-fiscal-address">
          <Label htmlFor={`${id}-street`}>Rua ou avenida</Label>
          <Input id={`${id}-street`} autoComplete="billing address-line1" value={address.logradouro} maxLength={150} required={data.requireAddress} disabled={busy} onChange={event => updateAddress('logradouro', event.target.value)} />
          <div className="profile-field-grid">
            <div><Label htmlFor={`${id}-number`}>Número</Label><Input id={`${id}-number`} value={address.numero} maxLength={20} required={data.requireAddress} disabled={busy} onChange={event => updateAddress('numero', event.target.value)} /></div>
            <div><Label htmlFor={`${id}-extra`}>Complemento</Label><Input id={`${id}-extra`} autoComplete="billing address-line2" value={address.complemento || ''} maxLength={150} disabled={busy} onChange={event => updateAddress('complemento', event.target.value)} /></div>
          </div>
          <Label htmlFor={`${id}-neighborhood`}>Bairro</Label>
          <Input id={`${id}-neighborhood`} value={address.bairro} maxLength={150} required={data.requireAddress} disabled={busy} onChange={event => updateAddress('bairro', event.target.value)} />
          <div className="profile-field-grid">
            <div><Label htmlFor={`${id}-state`}>Estado</Label><select id={`${id}-state`} className="profile-fiscal-select" autoComplete="billing address-level1" value={address.uf} required={data.requireAddress} disabled={busy || !municipalities.length} onChange={event => setProfile(current => ({ ...current, address: { ...(current.address || EMPTY_ADDRESS), uf: event.target.value, codigo_municipio: '' } }))}>
              <option value="">Selecione</option>{[...new Set(municipalities.map(city => city.state))].sort().map(state => <option key={state} value={state}>{state}</option>)}
            </select></div>
            <div><Label htmlFor={`${id}-city`}>Cidade</Label><select id={`${id}-city`} className="profile-fiscal-select" autoComplete="billing address-level2" value={address.codigo_municipio} required={data.requireAddress} disabled={busy || !address.uf || !municipalities.length} onChange={event => updateAddress('codigo_municipio', event.target.value)}>
              <option value="">Selecione</option>{municipalities.filter(city => city.state === address.uf).map(city => <option key={city.id} value={city.id}>{city.name}</option>)}
            </select></div>
          </div>
          <Label htmlFor={`${id}-postal`}>CEP</Label>
          <Input id={`${id}-postal`} autoComplete="billing postal-code" inputMode="numeric" maxLength={9} value={address.cep} required={data.requireAddress} disabled={busy} onChange={event => updateAddress('cep', event.target.value)} />
        </div>
      </details>
      <Button type="submit" variant="brand" size="brand" disabled={busy}>{busy ? 'Salvando…' : 'Salvar dados fiscais'}</Button>
    </form>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {data.invoices.length ? <ul className="profile-fiscal-list">{data.invoices.map(invoice => <li key={invoice.id}>
      <div><strong>{invoice.number ? `Nota ${invoice.number}` : 'Nota fiscal'}</strong> · {formatBillingAmount({ amount: invoice.amountCents, currency: invoice.currency })}</div>
      <p>{new Date(invoice.createdAt).toLocaleDateString('pt-BR')} · {STATUS[invoice.status]}{invoice.environment === 'homologacao' && ' · Homologação, sem valor fiscal'}</p>
      {invoice.status === 'authorized' && <div className="profile-billing-actions">
        {invoice.pdfUrl && <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">Abrir nota (PDF)</a>}
        {invoice.xmlUrl && <a href={invoice.xmlUrl} target="_blank" rel="noopener noreferrer">Baixar XML</a>}
      </div>}
    </li>)}</ul> : <p>Nenhuma nota fiscal disponível ainda.</p>}
    <Button type="button" variant="outline" disabled={busy} onClick={() => setAttempt(value => value + 1)}>Atualizar notas</Button>
  </section>;
}
