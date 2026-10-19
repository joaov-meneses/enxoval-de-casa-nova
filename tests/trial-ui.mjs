import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({channel: process.platform === 'win32' ? 'msedge' : 'chromium'});
try {
  const page = await browser.newPage({viewport: {width: 320, height: 568}});
  let status = {available:true, plan:'free', status:null, renewsAt:null, cancelAtPeriodEnd:false, passExpiresAt:null, canManage:false, accessAllowed:false, isOwner:true, trialEndsAt:null, trialUsed:false,trialNotice:null,subscriptionId:'sub_trial'};
  const offers = [{id:'monthly',name:'Mensal',amount:3990,currency:'brl'},{id:'pass',name:'Passe da Casa Nova',amount:9900,currency:'brl'}];
  let chosenPlan;
  let returnedWorkspace = null;
  let onboardingCompleted = false;
  const bootstrapTargets = [];
  const completionRequests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/onboarding/complete') {
      completionRequests.push(path);
      assert.ok(route.request().postDataJSON().plan.categories.length > 2);
      onboardingCompleted = true;
      return route.fulfill({json:{completed:true}});
    }
    if (path === '/api/billing/plans') return route.fulfill({json:{offers}});
    if (path === '/api/billing/checkout') {
      chosenPlan = route.request().postDataJSON().plan;
      completionRequests.push(path);
      return route.fulfill({json:{url:'https://checkout.stripe.com/c/pay/cs_test_onboarding'}});
    }
    if (path === '/api/enxovais') throw new Error('O onboarding não deve tentar liberar o enxoval antes da aprovação.');
    if (path === '/api/billing/sync') {
      returnedWorkspace = {id:'default-enxoval',name:'Enxoval de Casa Nova',ownerId:'owner',ownerName:'Cliente',role:'owner',discountCents:0,moveDate:null,state:null,city:null,spendingTier:'equilibrado'};
      return route.fulfill({json:{plan:status.plan,status:status.status,accessAllowed:true,enxovalId:returnedWorkspace.id}});
    }
    if (path === '/api/bootstrap') bootstrapTargets.push(new URL(route.request().url()).searchParams.get('enxovalId'));
    if (path === '/api/bootstrap') return route.fulfill({json:{user:{id:'owner',name:'Cliente',email:'trial@example.invalid',isGuest:false,plan:status.plan,onboardingCompleted,trialUsed:status.trialUsed},enxovais:returnedWorkspace ? [returnedWorkspace] : [],activeEnxoval:returnedWorkspace,members:[],categories:[],items:[]}});
    if (path === '/api/billing/pass-notice') {
      assert.equal(route.request().postDataJSON().sessionId, 'cs_pass_paid');
      status = {...status,passNotice:null}; return route.fulfill({status:204,body:''});
    }
    if (path === '/api/billing/trial-notice') {
      assert.equal(route.request().postDataJSON().subscriptionId,'sub_trial');
      status = {...status,trialNotice:null};
      return route.fulfill({status:204,body:''});
    }
    if (path === '/api/profile') return route.fulfill({json:{id:'owner',name:'Cliente',email:'trial@example.invalid',avatarUrl:null,createdAt:new Date().toISOString()}});
    if (path === '/api/billing/status') return route.fulfill({json:status});
    if (path === '/api/billing/cancel') { status = {...status,plan:'free',status:'canceled',accessAllowed:false}; return route.fulfill({json:{canceled:true}}); }
    return route.fulfill({json:{}});
  });
  await page.goto(`${process.env.TRIAL_UI_URL ?? 'http://127.0.0.1:4173'}/app`);
  await page.waitForURL('**/comecar');
  await page.locator('.ob[data-step="welcome"]').waitFor({timeout:10000});
  assert.equal(await page.locator('.subscription-card').count(),0,'conta nova faz onboarding antes do cartão');
  await page.evaluate(() => localStorage.setItem('casamia.onboarding.v1',JSON.stringify({v:2,step:'save',completed:false,answers:{name:'Cliente',moment:'casal',moveDate:'2027-01-12',moveDateAnswered:true,state:'BA',housing:'apartamento',people:3,rooms:['cozinha','banheiro','sala','quarto','servico'],owned:'algumas',style:'full',budget:'10-25',worries:['waste'],usage:['buy'],source:'instagram'}})));
  await page.reload();
  await page.getByRole('button',{name:'Continuar de onde parei',exact:true}).click();
  await page.route('https://checkout.stripe.com/**',route=>route.fulfill({contentType:'text/html',body:'<h1>Checkout</h1>'}));
  await page.getByRole('button',{name:'Criar meu plano',exact:true}).click();
  await page.waitForURL('**/app');
  await page.getByRole('heading',{name:/Mais casa/}).waitFor();
  assert.deepEqual(completionRequests,['/api/onboarding/complete'],'salva o plano antes de escolher a cobrança');
  await page.getByRole('radio',{name:/Passe da Casa Nova/}).check();
  await page.getByRole('button',{name:'Continuar com o Passe'}).click();
  await page.waitForURL('https://checkout.stripe.com/**');
  assert.equal(chosenPlan,'pass');
  assert.deepEqual(completionRequests,['/api/onboarding/complete','/api/billing/checkout'],'salva e abre o pagamento sem antecipar acesso');
  await page.goto(`${process.env.TRIAL_UI_URL ?? 'http://127.0.0.1:4173'}/app`);
  await page.getByRole('heading', {name:/Mais casa/}).waitFor();
  assert.equal(await page.getByRole('radio', {name:/Passe da Casa Nova/}).isChecked(), true);
  await page.getByRole('radio', {name:/Mensal/}).check();
  assert.equal(await page.getByRole('button', {name:'Começar teste de 2 dias'}).count(), 1);
  assert.equal(await page.getByRole('button', {name:'Exportar'}).count(), 0);
  assert.ok(await page.getByText('R$ 39,90/mês',{exact:true}).count());
  await page.screenshot({path:'tmp/trial-start-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Começar teste de 2 dias'}).click();
  await page.waitForURL('https://checkout.stripe.com/**');
  assert.equal(chosenPlan,'monthly');
  await page.goto(`${process.env.TRIAL_UI_URL ?? 'http://127.0.0.1:4173'}/app`);
  status = {...status,plan:'monthly',monthlyPrice:{amount:3990,currency:'brl'},status:'trialing',accessAllowed:true,trialUsed:true,canManage:true,trialNotice:'started',trialEndsAt:new Date(Date.now()+47*3600000).toISOString()};
  await page.reload();
  await page.getByRole('dialog',{name:'Seu teste de 2 dias começou'}).waitFor();
  assert.equal(await page.locator('.subscription-trial-dialog').evaluate(element => element.scrollTop),0,'abre o aviso no começo, com o título visível');
  const continueBounds = await page.getByRole('button',{name:'Continuar para meu enxoval'}).boundingBox();
  assert.ok(continueBounds.y >= 0 && continueBounds.y + continueBounds.height <= 568,'continuar fica visível sem precisar rolar');
  assert.ok(await page.getByText('Mensal: R$ 39,90 por mês',{exact:true}).count());
  assert.equal(await page.getByText('Depois, R$ 29,90 por mês',{exact:true}).count(),0);
  assert.equal(await page.locator('.subscription-banner').count(),0);
  await page.screenshot({path:'tmp/trial-welcome-mobile.png',fullPage:false});
  await page.getByRole('button',{name:'Continuar para meu enxoval'}).click();
  await page.getByRole('dialog',{name:'Seu teste de 2 dias começou'}).waitFor({state:'detached'});
  await page.reload();
  await page.locator('.workspace-app').waitFor();
  assert.equal(await page.getByRole('dialog',{name:'Seu teste de 2 dias começou'}).count(),0,'não repete o aviso confirmado');
  status = {...status,trialNotice:'ending',trialEndsAt:new Date(Date.now()+23*3600000).toISOString()};
  await page.reload();
  await page.getByRole('dialog',{name:'Seu teste termina em breve'}).waitFor();
  await page.getByRole('button',{name:'Continuar para meu enxoval'}).click();
  await page.getByRole('dialog',{name:'Seu teste termina em breve'}).waitFor({state:'detached'});
  await page.setViewportSize({width:1280,height:900});
  await page.reload();
  await page.getByRole('button',{name:'Menu da conta',exact:true}).click();
  await page.getByRole('menuitem',{name:'Meu perfil',exact:true}).click();
  await page.getByRole('dialog',{name:'Meu perfil',exact:true}).getByRole('tab',{name:'Assinatura',exact:true}).click();
  await page.getByRole('dialog',{name:'Meu perfil',exact:true}).getByRole('button',{name:'Cancelar assinatura',exact:true}).waitFor();
  await page.screenshot({path:'tmp/trial-desktop-top.png',fullPage:false});
  await page.getByRole('dialog',{name:'Meu perfil',exact:true}).getByRole('button',{name:'Fechar janela'}).click();
  await page.setViewportSize({width:320,height:568});
  await page.reload();
  await page.locator('.workspace-app').waitFor();
  assert.equal(await page.getByRole('button',{name:'Cancelar assinatura',exact:true}).count(),0,'no celular fica dentro do menu');
  await page.getByRole('button',{name:'Abrir menu do enxoval'}).click();
  await page.getByRole('dialog',{name:'Menu do enxoval'}).getByRole('button',{name:'Meu perfil',exact:true}).waitFor();
  await page.locator('.workspace-menu-panel').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  await page.screenshot({path:'tmp/trial-mobile-menu.png',fullPage:false});
  await page.getByRole('dialog',{name:'Menu do enxoval'}).getByRole('button',{name:'Meu perfil',exact:true}).click();
  await page.getByRole('dialog',{name:'Meu perfil',exact:true}).getByRole('tab',{name:'Assinatura',exact:true}).click();
  await page.getByRole('dialog',{name:'Meu perfil',exact:true}).getByRole('button',{name:'Cancelar assinatura',exact:true}).click();
  await page.getByRole('button', {name:'Confirmar cancelamento'}).click();
  await page.getByText('Assinatura cancelada. Sua conta e seus dados estão preservados.',{exact:true}).waitFor();
  await page.getByRole('dialog',{name:'Meu perfil',exact:true}).getByRole('button',{name:'Fechar janela'}).click();
  await page.getByRole('heading', {name:'Seu lar merece esse cuidado.'}).waitFor();
  await page.screenshot({path:'tmp/trial-canceled-mobile.png',fullPage:true});
  status = {...status,plan:'monthly',status:'trialing',accessAllowed:true};
  await page.goto(`${process.env.TRIAL_UI_URL ?? 'http://127.0.0.1:4173'}/app?assinatura=sucesso&plano=monthly&session_id=cs_test_return`);
  await page.locator('.workspace-app').waitFor({timeout:10000});
  assert.ok(await page.getByText('Enxoval de Casa Nova', {exact:true}).count() > 0);
  assert.ok(bootstrapTargets.includes('default-enxoval'),'carrega o enxoval padrão confirmado');
  assert.equal(new URL(page.url()).search,'','retorno concluído abre o app diretamente');
  await page.goto(`${process.env.TRIAL_UI_URL ?? 'http://127.0.0.1:4173'}/comecar?assinatura=sucesso&plano=monthly&session_id=cs_test_return`);
  await page.locator('.workspace-app').waitFor({timeout:10000});
  assert.equal(new URL(page.url()).pathname,'/app','checkout antigo também retorna ao enxoval');
  status = {...status,plan:'pass',passNotice:'cs_pass_paid',passPayment:{sessionId:'cs_pass_paid',amount:8900,currency:'brl'},passExpiresAt:'2027-10-18T12:00:00Z'};
  await page.reload();
  await page.getByRole('dialog',{name:'Seu Passe da Casa Nova está ativo'}).waitFor();
  assert.ok(await page.getByText('Pagamento único de R$ 89,00',{exact:true}).count());
  assert.equal(await page.getByText(/Mensal:/).count(),0,'Passe nunca mostra cobrança mensal');
  await page.getByRole('button',{name:'Continuar para meu enxoval'}).click();
  await page.reload();
  assert.equal(await page.getByRole('dialog',{name:'Seu Passe da Casa Nova está ativo'}).count(),0);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log('PASS: mobile trial activation, ending notice, cancellation and paywall; no page errors or overflow.');
} finally { await browser.close(); }
