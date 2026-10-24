import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "@/src/components/ui/label";
import { Button } from "@/src/components/ui/button";
import { Disclosure, DisclosureTrigger } from "@/src/components/ui/disclosure";
import { useEffect, useState } from 'react';
import { fetchBillingOffers, formatBillingAmount, type BillingOffer, type PaidPlanId } from '../api';
import { PASS_MONTHS } from '../plans';
import { ArrowRight, Bell, Check, ChevronDown, CircleHelp, CreditCard, ListChecks, LockKeyhole, Sparkles } from "@/src/components/icons";
import { Dialog } from './Dialog';
import { capture } from '../analytics';
import { readPlanChoice } from '../planChoice';

export function PlanSelection({ trialUsed, busy, disabled, onChoose }: {
  trialUsed: boolean; busy: boolean; disabled?: boolean; onChoose: (plan: PaidPlanId) => void;
}) {
  const [offers, setOffers] = useState<BillingOffer[]>([]);
  // Abre com o plano clicado nos preços da home, quando houver; senão, o Passe.
  const [selected, setSelected] = useState<PaidPlanId>(() => readPlanChoice() ?? 'pass');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [showTrialHelp, setShowTrialHelp] = useState(false);
  useEffect(() => {
    let active = true;
    setError(''); setOffers([]);
    fetchBillingOffers().then(result => {
      if (!active) return;
      setOffers(result.offers);
      if (result.offers.length) capture('plans_viewed', { source: 'subscription', reason: trialUsed ? 'trial_used' : 'initial' });
      if (!result.offers.length) setError('Nenhum plano está disponível agora.');
      else setSelected(current => result.offers.some(offer => offer.id === current) ? current : result.offers[0].id);
    }).catch(() => { if (active) setError('Não foi possível carregar os planos. Tente novamente.'); });
    return () => { active = false; };
  }, [attempt]);
  const monthly = selected === 'monthly';
  const selectedOffer = offers.find(offer => offer.id === selected);
  const orderedOffers = [...offers].sort((a, b) => Number(b.id === 'pass') - Number(a.id === 'pass'));
  const passOffer = offers.find(offer => offer.id === 'pass');
  const monthlyOffer = offers.find(offer => offer.id === 'monthly');
  const annualMonthlyCost = monthlyOffer ? monthlyOffer.amount * PASS_MONTHS : 0;
  const savings = passOffer && monthlyOffer && passOffer.currency.toLowerCase() === monthlyOffer.currency.toLowerCase() && passOffer.amount > 0 && annualMonthlyCost > passOffer.amount
    ? Math.floor((1 - passOffer.amount / annualMonthlyCost) * 100)
    : 0;
  return <div className="subscription-plan-selection">
    <RadioGroup asChild value={selected} onValueChange={value => setSelected(value as PaidPlanId)} disabled={busy || disabled} aria-label="Escolha seu plano"><fieldset className="subscription-plan-options" disabled={busy || disabled}>
      <legend className="sr-only">Escolha seu plano</legend>
      {orderedOffers.map(offer => <Label key={offer.id} htmlFor={`subscription-plan-${offer.id}`} className={`subscription-plan-option subscription-plan-${offer.id}${selected === offer.id ? ' is-selected' : ''}${offer.id === 'pass' && selected === 'pass' && !busy && !disabled ? ' subscription-pass-pulse' : ''}`}>
        <RadioGroupItem id={`subscription-plan-${offer.id}`} value={offer.id} className="choice-control" />
        {offer.id === 'pass' && <span className="subscription-plan-badge"><Sparkles size={12} aria-hidden="true" />Recomendado</span>}
        <span className="subscription-plan-content"><strong>{offer.name}</strong>
          <span className="subscription-plan-price-row">
            <span className="subscription-plan-price">{formatBillingAmount(offer)}{offer.id === 'monthly' && <small>/mês</small>}</span>
            {offer.id === 'pass' && savings > 0 && <span className="subscription-plan-savings">{savings}% menos</span>}
          </span>
          <span className="subscription-plan-term">{offer.id === 'monthly' ? trialUsed ? 'Renovação mensal' : '2 dias grátis' : <><span>{PASS_MONTHS} meses de acesso</span><span>Pagamento único</span></>}</span>
          {offer.id === 'pass' && <span className="subscription-plan-equivalent"><span>Equivale a</span><span>{formatBillingAmount({ amount: offer.amount / PASS_MONTHS, currency: offer.currency })}/mês</span></span>}
        </span>
      </Label>)}
    </fieldset></RadioGroup>
    {error ? <><p role="alert">{error}</p><Button variant="brand" size="brand" className="button button-outline" onClick={() => setAttempt(value => value + 1)}>Carregar planos novamente</Button></> : !offers.length ? <p role="status">Carregando planos…</p> : <>
      <div className="subscription-plan-help">
      <Disclosure className="subscription-included">
        <DisclosureTrigger aria-label="Recursos incluídos nos dois planos">
          <ListChecks size={16} aria-hidden="true" />
          <span>O que está incluído</span>
          <ChevronDown size={15} aria-hidden="true" className="subscription-included-chevron" />
        </DisclosureTrigger>
        <ul>
          {['Ambientes e itens sem limite', 'Controle de gastos, links e prioridades', 'Convide quem organiza a casa com você', 'Importação e exportação da sua lista'].map(text => <li key={text}><Check size={15} aria-hidden="true" />{text}</li>)}
        </ul>
        {savings > 0 && <p className="subscription-savings-explanation">A economia do Passe compara {PASS_MONTHS} meses de acesso com {PASS_MONTHS} mensalidades de {formatBillingAmount(monthlyOffer)} ({formatBillingAmount({ amount: annualMonthlyCost, currency: monthlyOffer!.currency })} no total).</p>}
      </Disclosure>
      {monthly && !trialUsed && monthlyOffer && <Button variant="brand" size="brand" type="button" className="subscription-trial-help" aria-haspopup="dialog" disabled={busy} onClick={() => setShowTrialHelp(true)}><CircleHelp size={16} aria-hidden="true" /><span>Como funcionam os 2 dias grátis?</span></Button>}
      </div>
      <div className="subscription-plan-checkout">
        <p className="subscription-plan-summary" aria-live="polite">
          {monthly
            ? trialUsed
              ? `${formatBillingAmount(selectedOffer)} agora, com renovação automática mensal. Cancele quando quiser.`
              : `2 dias grátis; depois, ${formatBillingAmount(selectedOffer)}/mês automaticamente. Cancele no teste para não pagar.`
            : `Cobrança única agora, sem teste grátis. ${PASS_MONTHS} meses de acesso, sem renovação automática.`}
        </p>
        <Button variant="brand" size="brand" className={`button button-dark${!monthly && !busy && !disabled ? ' subscription-pass-cta-pulse' : ''}`} disabled={busy || disabled} onClick={() => onChoose(selected)}>{busy ? 'Abrindo…' : monthly ? trialUsed ? 'Ativar plano Mensal' : 'Começar teste de 2 dias' : 'Continuar com o Passe'}{!busy && <ArrowRight size={18} aria-hidden="true" />}</Button>
        <p className="subscription-plan-note"><LockKeyhole size={13} aria-hidden="true" />{selectedOffer?.paymentMethods?.includes('pix') ? 'Pix ou cartão · Checkout seguro pela Stripe' : 'Cartão · Checkout seguro pela Stripe'}</p>
      </div>
    </>}
    <Dialog title="Como funcionam os 2 dias grátis?" isOpen={showTrialHelp} onClose={() => setShowTrialHelp(false)} className="subscription-trial-explanation">
      <div className="subscription-trial-explanation-body">
        <p className="subscription-trial-intro">48 horas com tudo liberado no Mensal. O teste começa ao confirmar o cartão.</p>
        <ol className="subscription-trial-timeline">
          <li><span className="subscription-timeline-icon"><LockKeyhole size={19} aria-hidden="true" /></span><div><span className="subscription-timeline-time">AO ATIVAR</span><strong>Acesso completo, sem cobrança</strong><p>Confirme o cartão e use todos os recursos grátis.</p></div></li>
          <li><span className="subscription-timeline-icon"><Bell size={19} aria-hidden="true" /></span><div><span className="subscription-timeline-time">EM 24 HORAS</span><strong>A gente te lembra</strong><p>Lembrete por e-mail, 24 horas antes da cobrança.</p></div></li>
          <li><span className="subscription-timeline-icon"><CreditCard size={19} aria-hidden="true" /></span><div><span className="subscription-timeline-time">APÓS 48 HORAS</span><strong>{formatBillingAmount(monthlyOffer)}/mês, com cobrança automática</strong><p>Após o teste, a cobrança é mensal no cartão cadastrado.</p></div></li>
        </ol>
        <div className="subscription-trial-cancel"><strong>Não quer continuar?</strong><p>Cancele antes do fim das 48 horas em “Meu perfil” → “Assinatura” e você não paga.</p></div>
        <p className="subscription-trial-scope">O teste é exclusivo do Mensal. O Passe da Casa Nova tem pagamento único na contratação, sem teste grátis.</p>
      </div>
      <div className="subscription-trial-explanation-footer"><Button variant="brand" size="brand" type="button" className="button button-dark" onClick={() => setShowTrialHelp(false)}>Entendi</Button></div>
    </Dialog>
  </div>;
}
