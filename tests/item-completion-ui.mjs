import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { withStatusUpdate } from '../src/itemStatus.ts';

const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':'chromium'});
try {
  for(const width of [320,375,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:width===320?568:900},reducedMotion:'reduce'});
    const home={id:'home',name:'Nossa casa nova',ownerId:'owner',role:'owner',discountCents:0,moveDate:null,state:'BA',city:null,spendingTier:'equilibrado'};
    let item={id:'bed',name:'Cama de casal com cabeceira',categoryId:'bedroom',category:'Quarto',checked:false,status:'researching',link:'',description:'',priceCents:150000,quantity:1,discountCents:5000,sortOrder:0,buyWeek:null,priceCategory:null,priority:null,timing:null,updatedAt:'2026-10-18T12:00:00Z',imageUrl:null};
    const requests=[];let fail=false;
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/bootstrap')return route.fulfill({json:{user:{id:'owner',name:'Ana',email:'ana@example.invalid',plan:'monthly',isGuest:false,onboardingCompleted:true},enxovais:[home],activeEnxoval:home,members:[],categories:[{id:'bedroom',name:'Quarto',sortOrder:0}],items:[item]}});
      if(path==='/api/billing/status')return route.fulfill({json:{available:true,plan:'monthly',status:'active',accessAllowed:true,isOwner:true,trialUsed:true,trialNotice:null}});
      if(path==='/api/items/bed'){
        const updates=route.request().postDataJSON();requests.push(updates);
        if(fail)return route.fulfill({status:500,json:{error:'Não foi possível salvar a situação.'}});
        item=withStatusUpdate(item,updates);
        if(['received','owned'].includes(item.status))item.discountCents=0;
        return route.fulfill({json:item});
      }
      return route.fulfill({json:{}});
    });
    await page.goto(`${process.env.ITEM_COMPLETION_UI_URL??'http://localhost:3000'}/app`);
    await page.locator('.workspace-app').waitFor();
    await page.locator(width>=1024?'.workspace-sidebar':'.mobile-bottom-nav').getByRole('button',{name:/^Meu enxoval/}).click();
    const row=page.locator('[data-item-id=bed]');
    const check=row.getByRole('checkbox',{includeHidden:true});
    await check.click();
    const dialog=page.getByRole('dialog',{name:'Como você conseguiu?',exact:true});
    await dialog.waitFor();
    assert.equal(requests.length,0,'abrir o modal não marca nem salva o item');
    assert.equal(await check.getAttribute('aria-checked'),'false');
    assert.equal(await dialog.getByRole('radio',{checked:true}).count(),0,'não presume que foi uma compra');
    assert.equal(await dialog.getByRole('button',{name:'Confirmar situação'}).isDisabled(),true);
    const confirmBounds=await dialog.getByRole('button',{name:'Confirmar situação'}).boundingBox();
    assert.ok(confirmBounds.y>=0&&confirmBounds.y+confirmBounds.height<=page.viewportSize().height,'confirmação fica visível em telas baixas');
    // O cartão inteiro funciona: título, descrição, ícone e área vazia.
    const cards=dialog.locator('.item-completion-option');
    await cards.nth(0).locator('strong').click();
    assert.equal(await dialog.getByRole('radio',{name:/^Comprado/}).isChecked(),true);
    await cards.nth(1).locator('small').click();
    assert.equal(await dialog.getByRole('radio',{name:/^Recebido/}).isChecked(),true);
    await cards.nth(2).locator('svg').click();
    assert.equal(await dialog.getByRole('radio',{name:/^Já tenho/}).isChecked(),true);
    await cards.nth(0).click({position:{x:5,y:5}});
    assert.equal(await dialog.getByRole('radio',{name:/^Comprado/}).isChecked(),true);
    const decoration=await cards.nth(0).evaluate(element=>({outline:getComputedStyle(element).outlineStyle,shadow:getComputedStyle(element).boxShadow}));
    assert.equal(decoration.outline,'none');assert.equal(decoration.shadow,'none','seleção tem apenas uma borda');
    await dialog.getByRole('radio',{name:/^Comprado/}).focus();
    await page.keyboard.press('ArrowDown',{delay:50});
    await page.waitForFunction(()=>document.querySelector('[data-slot=radio-group-item][value=received]')?.getAttribute('aria-checked')==='true');
    assert.equal(await dialog.getByRole('radio',{name:/^Recebido/}).isChecked(),true,'setas do teclado continuam funcionando');
    assert.equal(await cards.nth(1).evaluate(element=>getComputedStyle(element).borderColor),'rgb(111, 52, 31)','foco de teclado usa a mesma borda');
    await page.screenshot({path:`tmp/item-completion-${width}.png`,fullPage:false});
    await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(requests.length,0);
    await check.click();await page.keyboard.press('Escape');
    assert.equal(await dialog.count(),0);
    for(const [label,status] of [['Comprado','bought'],['Recebido','received'],['Já tenho','owned']]) {
      await check.click();
      await dialog.getByRole('radio',{name:new RegExp(`^${label}`)}).click();
      assert.equal(await check.getAttribute('aria-checked'),'false');
      await dialog.getByRole('button',{name:'Confirmar situação'}).click();
      await dialog.waitFor({state:'detached'});
      assert.deepEqual(requests.at(-1),{status});
      assert.equal(await check.getAttribute('aria-checked'),'true');
      assert.equal(item.status,status);
      assert.ok((await row.getAttribute('class')).includes('checked'));
      await check.click();
      await page.waitForFunction(()=>document.querySelector('[data-item-id=bed] [role=checkbox]')?.getAttribute('aria-checked')==='false');
      assert.equal(await dialog.count(),0,'desmarcar continua direto');
    }
    fail=true;await check.click();
    await dialog.getByRole('radio',{name:/^Recebido/}).click();
    await dialog.getByRole('button',{name:'Confirmar situação'}).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(await check.getAttribute('aria-checked'),'false','erro de gravação mantém o item pendente');
    assert.equal(await dialog.getByRole('radio',{name:/^Recebido/}).isChecked(),true);
    fail=false;await dialog.getByRole('button',{name:'Confirmar situação'}).click();
    await dialog.waitFor({state:'detached'});
    assert.equal(item.status,'received');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}px: cancel/Escape, explicit status choice, all three statuses, uncheck, server error and retry; responsive modal.`);
    await page.close();
  }
}finally{await browser.close();}
