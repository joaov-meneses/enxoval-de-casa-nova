import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const browser = await chromium.launch({channel:process.platform==='win32'?'msedge':'chromium',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const png = await sharp({create:{width:80,height:80,channels:3,background:'#b5532f'}}).png().toBuffer();
try {
  for (const width of [1920,768,375,320]) {
    const page = await browser.newPage({viewport:{width,height:width===320?568:width===375?667:1080}});
    let account={id:'owner',name:'Ana',email:'ana@example.invalid',avatarUrl:null,createdAt:'2026-10-01T12:00:00Z'};
    let home={id:'home',name:'Nossa casa nova',ownerId:'owner',ownerName:'Ana',role:'owner',discountCents:0,moveDate:null,state:'BA',city:'salvador',spendingTier:'equilibrado'};
    const billing={available:true,plan:'monthly',status:'active',accessAllowed:true,isOwner:true,renewsAt:'2026-11-18T12:00:00Z',trialEndsAt:null,trialNotice:null,trialUsed:true,subscriptionId:'sub_test',canManage:true,cancelAtPeriodEnd:false,passExpiresAt:null};
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      const method=route.request().method();
      if(path==='/api/bootstrap')return route.fulfill({json:{user:{...account,plan:'monthly',isGuest:false,onboardingCompleted:true},enxovais:[home],activeEnxoval:home,members:[{id:'owner',name:account.name,email:account.email,role:'owner'}],items:[],categories:[]}});
      if(path==='/api/profile'){
        if(method==='PATCH')account={...account,name:route.request().postDataJSON().name};
        return route.fulfill({json:account});
      }
      if(path==='/api/profile/avatar'){
        if(method==='GET')return route.fulfill({contentType:'image/png',body:png});
        account={...account,avatarUrl:method==='DELETE'?null:'/api/profile/avatar?v=test'};
        return route.fulfill({json:account});
      }
      if(path==='/api/billing/status')return route.fulfill({json:billing});
      if(path==='/api/enxovais/home'){
        home={...home,...route.request().postDataJSON()};
        return route.fulfill({json:{enxoval:home,members:[],categories:[],items:[]}});
      }
      return route.fulfill({json:{}});
    });
    await page.goto(`${process.env.PROFILE_UI_URL??'http://localhost:3000'}/app`);
    await page.locator('.workspace-app').waitFor();
    if(width>=1024){
      const trigger=page.getByRole('button',{name:'Menu da conta',exact:true});
      await trigger.focus();await page.keyboard.press('ArrowDown');
      await page.getByRole('menu',{name:'Ações do enxoval e da conta'}).waitFor();
      assert.equal(await page.getByRole('menuitem',{name:'Cancelar assinatura',exact:true}).count(),0);
      await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Sair da conta');
      await page.keyboard.press('Escape');assert.equal(await trigger.getAttribute('aria-expanded'),'false');
      assert.equal(await trigger.evaluate(element=>element===document.activeElement),true);
      await trigger.click();
      await page.screenshot({path:'tmp/profile-desktop-menu.png',fullPage:false});
      await page.getByRole('menuitem',{name:'Meu perfil',exact:true}).click();
    }else{
      await page.getByRole('button',{name:'Abrir menu do enxoval'}).click();
      await page.getByRole('button',{name:'Meu perfil',exact:true}).click();
    }
    const dialog=page.getByRole('dialog',{name:'Meu perfil',exact:true});
    await dialog.getByLabel('Seu nome',{exact:true}).waitFor();
    assert.equal(await dialog.locator('.profile-avatar-camera').evaluate(element=>getComputedStyle(element).color),'rgb(255, 253, 248)');
    assert.equal(await dialog.locator('.profile-avatar-camera svg').evaluate(element=>getComputedStyle(element).width),'18px');
    await page.screenshot({path:`tmp/profile-personal-${width}.png`,fullPage:false});
    assert.equal(await dialog.getByLabel('Seu nome',{exact:true}).isDisabled(),true);
    assert.equal(await dialog.locator('input[type=email]').count(),0);
    assert.equal(await dialog.locator('.profile-email-info').innerText(),'ana@example.invalid');
    await dialog.getByRole('button',{name:'Alterar seu nome',exact:true}).click();
    await dialog.getByLabel('Seu nome',{exact:true}).fill('Ana Maria');
    await dialog.getByRole('button',{name:'Salvar perfil',exact:true}).click();
    await dialog.getByText('Seu perfil foi atualizado.',{exact:true}).waitFor();
    assert.equal(account.name,'Ana Maria');
    assert.equal(await dialog.getByLabel('Seu nome',{exact:true}).isDisabled(),true);
    await dialog.getByRole('button',{name:'Alterar foto de perfil',exact:true}).click();
    const photo=page.getByRole('dialog',{name:'Foto de perfil',exact:true});
    await photo.getByRole('button',{name:'Tirar foto',exact:true}).waitFor();
    await photo.getByRole('button',{name:'Enviar foto',exact:true}).waitFor();
    await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)));
    await page.screenshot({path:`tmp/profile-photo-options-${width}.png`,fullPage:false});
    await photo.getByLabel('Escolher foto de perfil').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:png});
    await dialog.getByText('Foto de perfil atualizada.',{exact:true}).waitFor();
    assert.equal(await dialog.locator('.profile-summary img').count(),1);
    await dialog.getByRole('button',{name:'Alterar foto de perfil',exact:true}).click();
    if(width>=768) {
      await photo.getByRole('button',{name:'Tirar foto',exact:true}).click();
      await photo.locator('video').evaluate(video => video.readyState >= 2 ? undefined : new Promise(resolve => video.addEventListener('loadeddata',resolve,{once:true})));
      await photo.getByRole('button',{name:'Capturar foto',exact:true}).click();
      await photo.getByAltText('Prévia da nova foto de perfil').waitFor();
      await photo.getByRole('button',{name:'Usar esta foto',exact:true}).click();
      await photo.waitFor({state:'detached'});
      await dialog.getByRole('button',{name:'Alterar foto de perfil',exact:true}).click();
    }
    await photo.getByRole('button',{name:'Remover foto',exact:true}).click();
    await dialog.getByText('Foto removida.',{exact:true}).waitFor();
    assert.equal(await dialog.locator('.profile-summary img').count(),0);
    await dialog.getByRole('tab',{name:'Meu lar',exact:true}).click();
    assert.equal(await dialog.getByLabel('Nome do lar',{exact:true}).isDisabled(),true);
    await dialog.getByRole('button',{name:'Alterar nome do lar',exact:true}).click();
    await dialog.getByLabel('Nome do lar',{exact:true}).fill('Lar da Ana');
    await dialog.getByLabel('Data da mudança',{exact:true}).fill('2027-03-01');
    await dialog.getByRole('button',{name:'Salvar informações do lar'}).click();
    await dialog.getByText('As informações do seu lar foram atualizadas.',{exact:true}).waitFor();
    assert.equal(home.name,'Lar da Ana');assert.equal(home.moveDate,'2027-03-01');
    await dialog.getByRole('tab',{name:'Assinatura',exact:true}).click();
    await dialog.getByRole('button',{name:'Cancelar assinatura',exact:true}).waitFor();
    assert.equal(await dialog.getByRole('button',{name:'Gerenciar assinatura e cartão'}).count(),1);
    await page.screenshot({path:`tmp/profile-billing-${width}.png`,fullPage:false});
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.close();
  }
  console.log('PASS: desktop dropdown keyboard behavior, mobile profile, edit name/photo/home, billing in profile and responsive layout.');
}finally{await browser.close()}
