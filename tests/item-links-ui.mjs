import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch({channel:process.platform==='win32'?'msedge':'chromium'});
try {
  for (const width of [320,375,425,768,1024,1920]) {
    const page = await browser.newPage({viewport:{width,height:847},reducedMotion:'reduce'});
    page.setDefaultTimeout(10000);
    const errors=[]; page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE ERROR',error.message);});
    const home={id:'home',name:'Nossa casa nova',ownerId:'owner',ownerName:'Ana',role:'owner',discountCents:0,moveDate:'2027-01-01',state:'BA',city:'salvador',spendingTier:'equilibrado'};
    let item={id:'basket',name:'Cestos organizadores',categoryId:'bath',category:'Banheiro',checked:false,status:'researching',link:'',description:'Opcional',priceCents:null,quantity:1,discountCents:0,sortOrder:0,buyWeek:null,priceCategory:null,priority:null,timing:null,updatedAt:'2026-10-18T12:00:00Z',createdAt:'2026-10-18T12:00:00Z',priceTracking:null,offers:[]};
    let extractCount=0; let saved; let offerPosts=[];
    const billing={available:true,plan:'monthly',status:'active',accessAllowed:true,isOwner:true,trialUsed:true,trialNotice:null,subscriptionId:'sub_test'};
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/bootstrap')return route.fulfill({json:{user:{id:'owner',name:'Ana',email:'ana@example.invalid',plan:'monthly',isGuest:false,onboardingCompleted:true},enxovais:[home],activeEnxoval:home,members:[],categories:[{id:'bath',name:'Banheiro',sortOrder:0}],items:[item]}});
      if(path==='/api/billing/status')return route.fulfill({json:billing});
      if(path==='/api/products/extract'){
        extractCount++;
        return route.fulfill({json:{url:route.request().postDataJSON().url,domain:'loja.example',title:'Cesto de bambu da loja',priceCents:12990,currency:'BRL',imageUrl:null,inStock:true,partial:false}});
      }
      if(path==='/api/items/basket/offers'){
        const url=route.request().postDataJSON().url; offerPosts.push(url);
        const first=item.offers.length===0;
        const offer={id:`offer-${item.offers.length+1}`,url,domain:'loja.example',isPrimary:first,currentPriceCents:12990,pixPriceCents:null,inStock:true,lastCheckedAt:null};
        item={...item,offers:[...item.offers,offer],...(first?{link:url}:{})};
        return route.fulfill({status:201,json:item});
      }
      if(path==='/api/items/basket') { saved=route.request().postDataJSON(); item={...item,...saved}; return route.fulfill({json:item}); }
      return route.fulfill({json:{}});
    });
    console.log('Testing viewport',width);
    await page.goto(`${process.env.ITEM_LINKS_UI_URL??'http://localhost:3000'}/app`);
    await page.locator('.workspace-app').waitFor({timeout:10000}).catch(async error=>{console.error(await page.locator('body').innerText());throw error;});
    await page.locator(width>=1024 ? '.workspace-sidebar' : '.mobile-bottom-nav').getByRole('button',{name:/^Meu enxoval/}).click();
    const row=page.locator('[data-item-id=basket]'); await row.waitFor();
    await row.getByRole('button',{name:'Abrir detalhes de Cestos organizadores',exact:true}).click();
    const form=page.getByRole('dialog').getByRole('form');
    assert.equal(await form.getByRole('button',{name:/^Copiar link/}).count(),0,'sem botão de copiar');
    const product=form.getByLabel('Link do produto',{exact:true});
    const add=form.getByRole('button',{name:'Adicionar link do produto',exact:true});
    assert.equal(await add.isDisabled(),true,'"+" desligado com o campo vazio');
    await product.fill('https://loja.example/cesto'); await product.press('Tab');
    assert.equal(extractCount+offerPosts.length,0,'sair do campo não usa o link');
    await add.click();
    await form.getByRole('heading',{name:'Como prefere chamar este item?'}).waitFor();
    assert.deepEqual(offerPosts,['https://loja.example/cesto'],'o "+" guarda a primeira loja');
    assert.equal(await product.count(),0,'com uma loja, o rótulo muda para outra loja');
    await form.getByRole('button',{name:'Usar nome da loja',exact:true}).click();
    assert.equal(await form.getByLabel('Nome do item').inputValue(),'Cesto de bambu da loja');
    assert.equal((await form.getByLabel('Preço',{exact:true}).inputValue()).replace(/\s/g,' '),'R$ 129,90');
    const other=form.getByLabel('Link de outra loja',{exact:true});
    for (const url of ['https://loja.example/cesto-2','https://loja.example/cesto-3']) {
      await other.fill(url); await other.press('Enter');
      await form.getByText('Loja adicionada. Compare os preços em Lojas e escolha a principal.',{exact:true}).waitFor();
    }
    assert.equal(offerPosts.length,3);
    assert.equal(await form.locator('.add-link-control').count(),0,'no limite de 3 lojas o campo some');
    await page.screenshot({path:`tmp/item-links-${width}.png`,fullPage:true});
    const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
    assert.equal(fits,true,`sem overflow em ${width}px`);
    await form.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    await form.waitFor({state:'detached'});
    assert.equal(saved.name,'Cesto de bambu da loja');
    assert.equal(saved.priceCents,12990);
    assert.equal('link' in saved,false,'salvar não mexe no link: as lojas já foram gravadas');
    assert.deepEqual(errors,[]);
    await page.close();
  }
  console.log('PASS: link only used on "+", first store suggests name/price, other stores up to 3, field hidden at the limit, no overflow from 320 to 1920px.');
} finally { await browser.close(); }
