import { Button } from "@/src/components/ui/button";
import { FiscalBillingSection } from './FiscalBillingSection';
import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, acknowledgePassNotice, formatBillingAmount, acknowledgeTrialNotice, fetchBillingStatus, startCheckout, syncBilling } from '../api';
import { PlanSelection } from './PlanSelection';
import { Brand } from './Brand';
import { Dialog } from './Dialog';
import { isAppPath } from '../appRoute';
import { cachedSubscriptionStatus, clearSubscriptionStatus, loadSubscriptionStatus, rememberSubscriptionStatus, subscriptionAllowsAccess, subscriptionScope } from '../subscriptionStatus';
import { WorkspaceLoading } from './WorkspaceLoading';
import { Nino } from './Nino';
import { CalendarClock, CreditCard, CircleCheck, ListChecks, Wallet, Users } from "@/src/components/icons";
import './subscription.css';

const SubscriptionCheck = createContext<(() => Promise<boolean>) | null>(null);
export function useSubscriptionCheck() { return useContext(SubscriptionCheck); }
export function SubscriptionAccess({ children, userId, enxovalId, onChanged, onLogout }: {
  children: ReactNode; userId: string; enxovalId?: string; onChanged?: () => void; onLogout?: () => void;
}) {
  const scope = subscriptionScope(userId, enxovalId);
  const [snapshot, setSnapshot] = useState(() => ({ scope, status: cachedSubscriptionStatus(scope) }));
  const status = snapshot.scope === scope ? snapshot.status : cachedSubscriptionStatus(scope);
  const [verification, setVerification] = useState({ scope, error: '', checking: false });
  const verificationError = verification.scope === scope ? verification.error : '';
  const checking = verification.scope === scope && verification.checking;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const mounted = useRef(false);
  const retryVerification = useRef<() => void>(() => {});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [showFiscal, setShowFiscal] = useState(false);
  const [now, setNow] = useState(Date.now());
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const previousAccess = useRef<{ scope: string; allowed: boolean } | null>(null);
  const acknowledgedNotices = useRef(new Set<string>());
  const refresh = useCallback(async () => {
    setVerification(current => ({ scope, error: current.scope === scope ? current.error : '', checking: true }));
    try {
      const received = await loadSubscriptionStatus(scope, () => fetchBillingStatus(enxovalId, AbortSignal.timeout(10000)));
      if (!received || !mounted.current || currentScope.current !== scope) return null;
      const fresh = { ...received };
      if (fresh.passNotice && acknowledgedNotices.current.has(fresh.passNotice)) fresh.passNotice = null;
      if (fresh.trialNotice && acknowledgedNotices.current.has(`${fresh.subscriptionId}:${fresh.trialNotice}`)) fresh.trialNotice = null;
      rememberSubscriptionStatus(scope, fresh);
      setSnapshot({ scope, status: fresh });
      setNow(Date.now());
      if (previousAccess.current?.scope === scope && previousAccess.current.allowed !== fresh.accessAllowed) changed.current?.();
      previousAccess.current = { scope, allowed: fresh.accessAllowed };
      setVerification({ scope, error: '', checking: false });
      return fresh;
    } catch (err) {
      if (!mounted.current || currentScope.current !== scope) return null;
      if (err instanceof ApiError && [401, 403, 404].includes(err.status)) {
        clearSubscriptionStatus(scope);
        setSnapshot({ scope, status: null });
      }
      setVerification({ scope, error: err instanceof Error ? err.message : 'Não foi possível atualizar seu acesso. Tente novamente em instantes.', checking: false });
      if (err instanceof ApiError && err.status === 401 && window.location.pathname === '/comecar') window.location.replace('/cadastro');
      return null;
    }
  }, [scope, enxovalId]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    previousAccess.current = null;
    setError('');
    const initialize = async () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('assinatura') === 'sucesso') {
        setVerification(current => ({ scope, error: current.scope === scope ? current.error : '', checking: true }));
        if (!isAppPath(window.location.pathname)) {
          window.location.replace(`/app?${params}`);
          return;
        }
        try {
          const confirmed = await syncBilling(params.get('session_id') ?? undefined, true);
          if (!active) return;
          if (!confirmed.accessAllowed) throw new Error('Aguardando a aprovação do pagamento ou do cadastro do cartão.');
          changed.current?.();
        }
        catch (err) {
          if (active) setVerification({ scope, error: err instanceof Error ? err.message : 'Não foi possível confirmar a assinatura.', checking: false });
          return;
        }
        params.delete('assinatura'); params.delete('plano'); params.delete('session_id');
        window.history.replaceState(null, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
      }
      if (active) await refresh();
    };
    void initialize();
    const focus = () => void (new URLSearchParams(window.location.search).get('assinatura') === 'sucesso' ? initialize() : refresh());
    retryVerification.current = focus;
    const denied = () => {
      clearSubscriptionStatus(scope);
      setSnapshot({ scope, status: null });
      focus();
    };
    const timer = setInterval(focus, 15000);
    window.addEventListener('focus', focus);
    window.addEventListener('casamia:subscription-required', denied);
    return () => { active = false; mounted.current = false; clearInterval(timer); window.removeEventListener('focus', focus); window.removeEventListener('casamia:subscription-required', denied); };
  }, [refresh, scope]);

  // Mantém os prazos locais ativos mesmo se a revalidação ficar sem rede.
  useEffect(() => {
    const deadline = status?.plan === 'monthly' && status.status === 'trialing' ? status.trialEndsAt
      : status?.plan === 'pass' ? status.passExpiresAt : null;
    if (!deadline) return;
    const delay = Date.parse(deadline) - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(delay + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [status, now]);

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
  const allowed = subscriptionAllowsAccess(status, Math.max(now, Date.now()));
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
      const latest = cachedSubscriptionStatus(scope);
      if (!latest || !mounted.current || currentScope.current !== scope) return;
      const fresh = { ...latest, trialNotice: null, passNotice: null };
      rememberSubscriptionStatus(scope, fresh);
      setSnapshot({ scope, status: fresh });
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível continuar. Tente novamente.'); }
    finally { setNoticeBusy(false); }
  };
  const notice = error || verificationError ? <p role="alert">{error || verificationError}</p> : null;
  if (!status) return <WorkspaceLoading error={verificationError} retrying={checking} onRetry={() => retryVerification.current()} onLogout={onLogout} />;
  if (!allowed) return <main className="subscription-page"><section className="subscription-card">
    <div className="subscription-brand-row">
      <a href="/" aria-label="Casa Mia, página inicial"><Brand /></a>
      {onLogout && <Button variant="brand" size="brand" type="button" className="subscription-signout" aria-label="Sair da conta" onClick={onLogout}>Sair</Button>}
    </div>
    <>
      <div className={`subscription-intro${status.isOwner ? ' subscription-promise' : ''}`}>
        <div className="subscription-promise-copy">
          {status.isOwner && <span className="subscription-eyebrow">{status.trialUsed ? 'SEU PLANEJAMENTO CONTINUA AQUI' : 'SEU PLANO ESTÁ SALVO'}</span>}
          <h1>{!status.isOwner ? 'Este enxoval está com o acesso bloqueado' : status.trialUsed ? 'Seu lar merece esse cuidado.' : <>Mais casa.<br />Menos correria.</>}</h1>
          {!status.isOwner && <p>Para liberar o acesso, a pessoa responsável pelo enxoval precisa ativar a assinatura. Sua conta continua ativa e seus dados estão preservados.</p>}
        </div>
        {status.isOwner && <div className="subscription-promise-art" aria-hidden="true"><Nino pose="keys" size={120} /><span><CircleCheck size={12} />Feito para seu lar</span></div>}
      </div>
      {status.isOwner && <>
        <ul className="subscription-benefits" aria-label="O que você libera">
          <li><ListChecks size={20} aria-hidden="true" /><span>Sua lista<br /><strong>personalizada</strong></span></li>
          <li><Wallet size={20} aria-hidden="true" /><span>Seus gastos<br /><strong>sob controle</strong></span></li>
          <li><Users size={20} aria-hidden="true" /><span>Todo mundo<br /><strong>planejando junto</strong></span></li>
        </ul>
        <PlanSelection trialUsed={status.trialUsed} busy={busy} disabled={!status.available} onChoose={plan => void action(plan)} />
        {!status.available && <p>O cadastro do cartão está temporariamente indisponível.</p>}
        {status.fiscalEnabled && <div className="subscription-fiscal-access">
          <Button type="button" variant="outline" onClick={() => setShowFiscal(current => !current)} aria-expanded={showFiscal}>{showFiscal ? 'Fechar notas fiscais' : 'Minhas notas fiscais'}</Button>
          {showFiscal && <FiscalBillingSection />}
        </div>}
      </>}
      {notice}
    </>
  </section></main>;

  return <SubscriptionCheck.Provider value={async () => subscriptionAllowsAccess(await refresh())}>
    {verificationError && <div className="subscription-connection-notice" role="status">
      <span>Não foi possível atualizar seu acesso. Sua lista continua aberta; confira a conexão.</span>
      <Button variant="brand" size="brand" className="button button-outline button-small" disabled={checking} onClick={() => retryVerification.current()}>{checking ? 'Tentando…' : 'Tentar novamente'}</Button>
    </div>}
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
        <Button variant="brand" size="brand" className="button button-dark subscription-trial-continue" disabled={noticeBusy} onClick={() => void dismissNotice()}>{noticeBusy ? 'Continuando…' : 'Continuar para meu enxoval'}</Button>
      </div>
    </Dialog>
    {status?.fiscalNeedsData && <p className="subscription-fiscal-notice" role="status">Sua nota fiscal aguarda os dados de cobrança. Complete em <strong>Meu perfil → Assinatura → Notas fiscais</strong>.</p>}
    {children}
  </SubscriptionCheck.Provider>;
}
