import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser=await chromium.launch({channel:process.platform==='win32'?'msedge':'chromium'});
try {
  for(const width of [320,768]) {
    const page=await browser.newPage({viewport:{width,height:width===320?568:900},reducedMotion:'reduce'});
    const home={id:'home',name:'Nossa casa nova',ownerId:'owner',role:'owner',discountCents:0,moveDate:null,state:'BA',city:null,spendingTier:'equilibrado'};
    let items=['Cama','Cesto'].map((name,index)=>({id:`item-${index}`,name,categoryId:'bedroom',category:'Quarto',checked:false,status:'needed',link:'',description:'',priceCents:null,quantity:1,discountCents:0,sortOrder:index,buyWeek:null,priceCategory:null,priority:null,timing:null,updatedAt:'2026-10-18T12:00:00Z',imageUrl:null}));
    await page.route('**/api/**',route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/bootstrap')return route.fulfill({json:{user:{id:'owner',name:'Ana',email:'ana@example.invalid',plan:'monthly',isGuest:false,onboardingCompleted:true},enxovais:[home],activeEnxoval:home,members:[],categories:[{id:'bedroom',name:'Quarto',sortOrder:0}],items}});
      if(path==='/api/billing/status')return route.fulfill({json:{available:true,plan:'monthly',status:'active',accessAllowed:true,isOwner:true,trialUsed:true,trialNotice:null}});
      if(path.startsWith('/api/items/')){
        const id=path.split('/').at(-1);items=items.map(item=>item.id===id?{...item,...route.request().postDataJSON()}:item);
        return route.fulfill({json:items.find(item=>item.id===id)});
      }
      return route.fulfill({json:{}});
    });
    await page.goto(`${process.env.ITEM_EDIT_UI_URL??'http://localhost:3000'}/app`);
    await page.locator('.workspace-app').waitFor();
    await page.locator('.mobile-bottom-nav').getByRole('button',{name:'Meu enxoval',exact:true}).click();
    const fab=page.getByRole('button',{name:'Adicionar item ou ambiente',exact:true});
    const first=page.locator('[data-item-id=item-0]');const second=page.locator('[data-item-id=item-1]');
    assert.equal(await fab.isVisible(),true);
    await first.getByRole('button',{name:'Abrir detalhes de Cama',exact:true}).click();
    assert.equal(await fab.isVisible(),false,'abrir um item oculta o botão flutuante');
    await second.getByRole('button',{name:'Abrir detalhes de Cesto',exact:true}).click();
    await first.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(await fab.isVisible(),false,'continua oculto se ainda há outro item aberto');
    await second.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(await fab.isVisible(),true,'volta ao fechar o último item');
    await first.getByRole('button',{name:'Abrir detalhes de Cama',exact:true}).click();
    await first.getByLabel('Nome do item').fill('Cama nova');
    await first.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    await first.getByRole('form').waitFor({state:'detached'});
    assert.equal(await fab.isVisible(),true,'volta após salvar');
    assert.equal(items[0].name,'Cama nova');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    console.log(`PASS: floating add button hides during editing and returns after closing/canceling/saving at ${width}px.`);
    await page.close();
  }
} finally {await browser.close();}
