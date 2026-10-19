import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, acknowledgePassNotice, formatBillingAmount, acknowledgeTrialNotice, fetchBillingStatus, startCheckout, syncBilling, type BillingStatus } from '../api';
import { PlanSelection } from './PlanSelection';
import { Brand } from './Brand';
import { Dialog } from './Dialog';
import { Nino } from './Nino';
import { CalendarClock, CreditCard, CircleCheck, ListChecks, Wallet, Users } from 'lucide-react';
import './subscription.css';

const SubscriptionCheck = createContext<(() => Promise<boolean>) | null>(null);
export function useSubscriptionCheck() { return useContext(SubscriptionCheck); }
export function SubscriptionAccess({ children, enxovalId, onChanged, onLogout }: {
  children: ReactNode; enxovalId?: string; onChanged?: () => void; onLogout?: () => void;
}) {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const previousAccess = useRef<boolean | null>(null);
  const acknowledgedNotices = useRef(new Set<string>());
  const refresh = useCallback(async () => {
    try {
      const fresh = await fetchBillingStatus(enxovalId);
      if (fresh.passNotice && acknowledgedNotices.current.has(fresh.passNotice)) fresh.passNotice = null;
      if (fresh.trialNotice && acknowledgedNotices.current.has(`${fresh.subscriptionId}:${fresh.trialNotice}`)) fresh.trialNotice = null;
      setStatus(fresh);
      setNow(Date.now());
      if (previousAccess.current !== null && previousAccess.current !== fresh.accessAllowed) changed.current?.();
      previousAccess.current = fresh.accessAllowed;
      setError('');
    } catch (err) {
      setStatus(null); // Never expose cached workspace content when verification fails.
      setError(err instanceof Error ? err.message : 'Não foi possível verificar seu acesso.');
      if (err instanceof ApiError && err.status === 401 && window.location.pathname === '/comecar') window.location.replace('/cadastro');
    }
  }, [enxovalId]);

  useEffect(() => {
    let active = true;
    previousAccess.current = null;
    setStatus(null);
    const initialize = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('assinatura') === 'sucesso') {
        if (window.location.pathname !== '/app') {
          window.location.replace(`/app?${params}`);
          return;
        }
        try {
          const confirmed = await syncBilling(params.get('session_id') ?? undefined, true);
          if (!confirmed.accessAllowed) throw new Error('Aguardando a aprovação do pagamento ou do cadastro do cartão.');
          changed.current?.();
        }
        catch (err) {
          if (active) setError(err instanceof Error ? err.message : 'Não foi possível confirmar a assinatura.');
          return;
        }
        params.delete('assinatura'); params.delete('plano'); params.delete('session_id');
        window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
      }
      if (active) await refresh();
    };
    void initialize();
    const focus = () => void (new URLSearchParams(window.location.search).get('assinatura') === 'sucesso' ? initialize() : refresh());
    const timer = setInterval(focus, 15000);
    window.addEventListener('focus', focus);
    window.addEventListener('casamia:subscription-required', focus);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('casamia:subscription-required', focus); };
  }, [refresh]);

  const action = async (plan: 'monthly' | 'pass') => {
    setBusy(true); setError('');
    try {
      const result = await startCheckout(plan);
      window.location.assign(result.url);
    } catch (err) { setError(err instanceof Error ? err.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  };

  const trial = status?.plan === 'monthly' && status.status === 'trialing';
  const passNotice = status?.plan === 'pass' && Boolean(status.passNotice);
  const endsAt = status?.trialEndsAt ? new Date(status.trialEndsAt) : null;
  const expired = trial && endsAt && endsAt.getTime() <= now;
  const allowed = status?.accessAllowed && !expired;
  const deadline = endsAt?.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const dismissNotice = async () => {
    if (!status || noticeBusy || (!status.passNotice && (!status.trialNotice || !status.subscriptionId))) return;
    setNoticeBusy(true); setError('');
    try {
      if (status.passNotice) {
        await acknowledgePassNotice(status.passNotice);
        acknowledgedNotices.current.add(status.passNotice);
      } else {
        await acknowledgeTrialNotice(status.trialNotice!, status.subscriptionId!);
        acknowledgedNotices.current.add(`${status.subscriptionId}:${status.trialNotice}`);
      }
      setStatus(current => current ? { ...current, trialNotice: null, passNotice: null } : current);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível continuar. Tente novamente.'); }
    finally { setNoticeBusy(false); }
  };
  const notice = error ? <p role="alert">{error}</p> : null;
  if (!allowed) return <main className="subscription-page"><section className="subscription-card">
    <div className="subscription-brand-row">
      <a href="/" aria-label="Casa Mia, página inicial"><Brand /></a>
      {onLogout && <button type="button" className="subscription-signout" aria-label="Sair da conta" onClick={onLogout}>Sair</button>}
    </div>
    {!status ? <><h1>Verificando seu acesso…</h1>{notice}<button className="button button-outline" onClick={() => void refresh()}>Tentar novamente</button></> : <>
      <div className={`subscription-intro${status.isOwner ? ' subscription-promise' : ''}`}>
        <div className="subscription-promise-copy">
          {status.isOwner && <span className="subscription-eyebrow">{status.trialUsed ? 'SEU PLANEJAMENTO CONTINUA AQUI' : 'SEU PLANO ESTÁ SALVO'}</span>}
          <h1>{!status.isOwner ? 'Este enxoval está com o acesso bloqueado' : status.trialUsed ? 'Seu lar merece esse cuidado.' : <>Mais casa.<br />Menos correria.</>}</h1>
          {!status.isOwner && <p>Para liberar o acesso, a pessoa responsável pelo enxoval precisa ativar a assinatura. Sua conta continua ativa e seus dados estão preservados.</p>}
        </div>
        {status.isOwner && <div className="subscription-promise-art" aria-hidden="true"><Nino pose="think" size={120} /><span><CircleCheck size={12} />Feito para seu lar</span></div>}
      </div>
      {status.isOwner && <>
        <ul className="subscription-benefits" aria-label="O que você libera">
          <li><ListChecks size={20} aria-hidden="true" /><span>Sua lista<br /><strong>personalizada</strong></span></li>
          <li><Wallet size={20} aria-hidden="true" /><span>Seus gastos<br /><strong>sob controle</strong></span></li>
          <li><Users size={20} aria-hidden="true" /><span>Todo mundo<br /><strong>planejando junto</strong></span></li>
        </ul>
        <PlanSelection trialUsed={status.trialUsed} busy={busy} disabled={!status.available} onChoose={plan => void action(plan)} />
        {!status.available && <p>O cadastro do cartão está temporariamente indisponível.</p>}
      </>}
      {notice}
    </>}
  </section></main>;

  return <SubscriptionCheck.Provider value={async () => {
    try {
      const fresh = await fetchBillingStatus(enxovalId);
      setStatus(fresh);
      return fresh.accessAllowed;
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : 'Não foi possível verificar seu acesso.');
      return false;
    }
  }}>
    <Dialog title={passNotice ? 'Seu Passe da Casa Nova está ativo' : status?.trialNotice === 'ending' ? 'Seu teste termina em breve' : 'Seu teste de 2 dias começou'} isOpen={Boolean(passNotice || (trial && status?.trialNotice))} onClose={() => void dismissNotice()} busy={noticeBusy} className="subscription-trial-dialog">
      <div className="subscription-trial-body">
      <div className="subscription-trial-welcome">
        <Nino pose="wave" size={76} />
        <p>{passNotice ? 'Pagamento confirmado. Seu enxoval está liberado com o Passe da Casa Nova.' : status?.trialNotice === 'ending' ? 'Seu período de teste está chegando ao fim. Confira a data da primeira cobrança.' : 'Tudo pronto para planejar sua casa. Você tem acesso completo a todos os recursos durante o teste.'}</p>
      </div>
      <ul className="subscription-trial-details">
        <li><CircleCheck size={20} aria-hidden="true" /><div><strong>Seu enxoval completo</strong><span>Ambientes, itens, convidados, importação e exportação liberados.</span></div></li>
        <li><CalendarClock size={20} aria-hidden="true" /><div><strong>{passNotice ? `Passe válido até ${status?.passExpiresAt ? new Date(status.passExpiresAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'a data confirmada no checkout'}` : `Teste até ${deadline}`}</strong><span>{passNotice ? '12 meses de acesso, sem renovação automática.' : 'Horário de Brasília. São 48 horas completas desde a confirmação do cartão.'}</span></div></li>
        <li><CreditCard size={20} aria-hidden="true" /><div><strong>{passNotice ? `Pagamento único de ${formatBillingAmount(status?.passPayment)}` : `Mensal: ${formatBillingAmount(status?.monthlyPrice)} por mês`}</strong><span>{passNotice ? 'O pagamento já foi aprovado. Não haverá cobrança mensal nem renovação automática.' : 'A primeira cobrança será automática no cartão cadastrado, após o fim do teste. O valor segue as condições e eventuais descontos confirmados no checkout.'}</span></div></li>
      </ul>
      <p className="subscription-trial-note">{passNotice ? 'Veja seu plano e seus pagamentos em “Meu perfil” → “Assinatura”.' : 'Você pode gerenciar ou cancelar sua assinatura em “Meu perfil” → “Assinatura”.'} {!passNotice && 'Cancele antes do término do teste para evitar a cobrança. Também enviaremos um lembrete por e-mail.'}</p>
      {notice}
      </div>
      <div className="subscription-trial-footer">
        <button className="button button-dark subscription-trial-continue" disabled={noticeBusy} onClick={() => void dismissNotice()}>{noticeBusy ? 'Continuando…' : 'Continuar para meu enxoval'}</button>
      </div>
    </Dialog>
    {children}
  </SubscriptionCheck.Provider>;
}
