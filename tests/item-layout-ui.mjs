import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':'chromium'});
const png=await sharp({create:{width:80,height:80,channels:3,background:'#b5532f'}}).png().toBuffer();
try {
  for(const width of [320,375,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:width===320?568:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const home={id:'home',name:'Nossa casa nova',ownerId:'owner',ownerName:'Ana',role:'owner',discountCents:0,moveDate:'2027-01-01',state:'BA',city:'salvador',spendingTier:'equilibrado'};
    const categories=[{id:'bedroom',name:'Quarto',sortOrder:0},{id:'bath',name:'Banheiro',sortOrder:1}];
    let items=['Cama (estrutura ou box)','Cestos organizadores'].map((name,index)=>({id:`item-${index}`,name,categoryId:'bedroom',category:'Quarto',checked:false,status:'researching',link:'',description:'Essencial',priceCents:null,quantity:1,discountCents:0,sortOrder:index,buyWeek:-4,priceCategory:null,priority:null,timing:null,updatedAt:'2026-10-18T12:00:00Z',createdAt:'2026-10-18T12:00:00Z',imageUrl:index?'/fixture.png':null,priceTracking:null}));
    let reordered=0;
    await page.route('**/fixture.png',route=>route.fulfill({contentType:'image/png',body:png}));
    await page.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/bootstrap')return route.fulfill({json:{user:{id:'owner',name:'Ana',email:'ana@example.invalid',plan:'monthly',isGuest:false,onboardingCompleted:true},enxovais:[home],activeEnxoval:home,members:[],categories,items}});
      if(path==='/api/billing/status')return route.fulfill({json:{available:true,plan:'monthly',status:'active',accessAllowed:true,isOwner:true,trialUsed:true,trialNotice:null,subscriptionId:'sub_test'}});
      if(path==='/api/items/order'){
        reordered++;
        items=route.request().postDataJSON().itemIds.map((id,index)=>({...items.find(item=>item.id===id),sortOrder:index}));
        return route.fulfill({json:items});
      }
      return route.fulfill({json:{}});
    });
    const url=process.env.ITEM_LAYOUT_UI_URL??'http://localhost:3000';
    await page.goto(`${url}/app`);
    await page.locator('.workspace-app').waitFor();
    const nav=page.locator(width>=1024?'.workspace-sidebar':'.mobile-bottom-nav');
    await nav.getByRole('button',{name:/^Meu enxoval/}).click();
    const measure=async()=>page.locator('.item-row').evaluateAll(rows=>Object.fromEntries(rows.map(row=>{
      const outer=row.getBoundingClientRect();
      const rect=selector=>{const element=row.querySelector(selector);if(!element)return null;const box=element.getBoundingClientRect();return {x:box.x-outer.x,y:box.y-outer.y,width:box.width,height:box.height};};
      return [row.dataset.itemId,{height:outer.height,width:outer.width,title:rect('.item-title-button'),meta:rect('.item-meta'),image:rect('.item-thumb'),check:rect('.item-check')}];
    })));
    await page.locator('[data-item-id=item-1]').waitFor();
    const all=await measure();
    const environments=page.locator(width>=1024?'.workspace-sidebar':'.environment-chips');
    await environments.getByRole('button',{name:/^Quarto/}).click();
    await page.getByRole('list',{name:'Itens de Quarto',exact:true}).waitFor();
    const room=await measure();
    for(const id of ['item-0','item-1']) {
      for(const field of ['height','width'])assert.ok(Math.abs(all[id][field]-room[id][field])<1,`${field} padronizado em ${id}, ${width}px`);
      for(const field of ['title','meta','image','check'])if(all[id][field])for(const axis of ['x','y','width','height'])assert.ok(Math.abs(all[id][field][axis]-room[id][field][axis])<1,`${field}.${axis} padronizado em ${id}, ${width}px`);
    }
    await page.screenshot({path:`tmp/item-layout-room-${width}.png`,fullPage:true});
    const handle=page.getByRole('button',{name:'Reordenar Cama (estrutura ou box)',exact:true});
    await handle.focus();await handle.press('ArrowDown');
    await page.getByText('Ordem salva.',{exact:true}).waitFor();
    assert.equal(reordered,1,'alça mantém reordenação pelo teclado');
    await nav.getByRole('button',{name:'Visão geral',exact:true}).click();
    const toolbar=page.locator('.rooms-toolbar');await toolbar.waitFor();
    if(width<768){
      const layout=await toolbar.evaluate(element=>{
        const rect=element.getBoundingClientRect();
        return {x:rect.x,right:rect.right,titleBottom:element.querySelector('h3').getBoundingClientRect().bottom,buttons:[...element.querySelectorAll('.rooms-toolbar-actions button')].map(button=>{const box=button.getBoundingClientRect();return {x:box.x,right:box.right,y:box.y,height:box.height};})};
      });
      assert.equal(layout.buttons.length,3);
      for(const button of layout.buttons){assert.ok(button.x>=layout.x&&button.right<=layout.right+1);assert.ok(button.height>=44);assert.ok(button.y>=layout.titleBottom);assert.ok(Math.abs(button.y-layout.buttons[0].y)<1);}
    }
    await toolbar.getByRole('button',{name:'Exportar',exact:true}).click();
    const panel=toolbar.locator('.export-menu-panel');await panel.waitFor();
    const panelBounds=await panel.boundingBox();assert.ok(panelBounds.x>=0&&panelBounds.x+panelBounds.width<=width+1,'menu de exportação fica dentro da tela');
    await page.keyboard.press('Escape');
    await toolbar.scrollIntoViewIfNeeded();
    await page.screenshot({path:`tmp/rooms-toolbar-${width}.png`,fullPage:false});
    await toolbar.getByRole('button',{name:'Novo ambiente',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);
    console.log(`PASS: same item footprint with/without image in Todos and Quarto, keyboard reorder and room toolbar at ${width}px.`);
    await page.close();
  }
} finally {await browser.close();}
