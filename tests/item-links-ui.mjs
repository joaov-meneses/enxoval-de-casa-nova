import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const browser = await chromium.launch({channel:process.platform==='win32'?'msedge':'chromium'});
const png = await sharp({create:{width:80,height:80,channels:3,background:'#b5532f'}}).png().toBuffer();
try {
  for (const width of [320,375,476,768,1024,1920]) {
    const page = await browser.newPage({viewport:{width,height:847},reducedMotion:'reduce'});
    page.setDefaultTimeout(10000);
    const errors=[]; page.on('pageerror',error=>{errors.push(error.message);console.error('PAGE ERROR',error.message);});
    const home={id:'home',name:'Nossa casa nova',ownerId:'owner',ownerName:'Ana',role:'owner',discountCents:0,moveDate:'2027-01-01',state:'BA',city:'salvador',spendingTier:'equilibrado'};
    let item={id:'basket',name:'Cestos organizadores',categoryId:'bath',category:'Banheiro',checked:false,status:'researching',link:'',description:'Opcional',priceCents:null,quantity:1,discountCents:0,sortOrder:0,buyWeek:null,priceCategory:null,priority:null,timing:null,updatedAt:'2026-10-18T12:00:00Z',createdAt:'2026-10-18T12:00:00Z',imageUrl:'/fixture.png',priceTracking:null};
    let extractCount=0; let imageImports=0; let saved;
    let previewMode='normal';
    let releaseSlow; let markSlowStarted;
    const slowStarted = new Promise(resolve=>{markSlowStarted=resolve;});
    const billing={available:true,plan:'monthly',status:'active',accessAllowed:true,isOwner:true,trialUsed:true,trialNotice:null,subscriptionId:'sub_test'};
    await page.addInitScript(() => {
      window.copiedLinks=[];
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.copiedLinks.push(text)}});
    });
    await page.route('**/fixture*.png',route=>route.fulfill({contentType:'image/png',body:png}));
    await page.route('**/api/**',async route=>{
      const path=new URL(route.request().url()).pathname;
      if(path==='/api/bootstrap')return route.fulfill({json:{user:{id:'owner',name:'Ana',email:'ana@example.invalid',plan:'monthly',isGuest:false,onboardingCompleted:true},enxovais:[home],activeEnxoval:home,members:[],categories:[{id:'bath',name:'Banheiro',sortOrder:0}],items:[item]}});
      if(path==='/api/billing/status')return route.fulfill({json:billing});
      if(path==='/api/products/extract'){
        extractCount++;
        if(previewMode==='slow') await new Promise(resolve=>{releaseSlow=resolve;markSlowStarted();});
        if(previewMode==='error')return route.fulfill({status:422,json:{error:'A loja não permitiu consultar este produto.'}});
        return route.fulfill({json:{url:route.request().postDataJSON().url,domain:'loja.example',title:'Cesto de bambu da loja',priceCents:12990,currency:'BRL',imageUrl:'/fixture-store.png',inStock:true,partial:previewMode==='partial'}});
      }
      if(path==='/api/item-images/from-url') { imageImports++; return route.fulfill({json:{imageUrl:'/fixture-uploaded.png'}}); }
      if(path==='/api/items/basket') { saved=route.request().postDataJSON(); item={...item,...saved}; return route.fulfill({json:item}); }
      return route.fulfill({json:{}});
    });
    console.log('Testing viewport',width);
    await page.goto(`${process.env.ITEM_LINKS_UI_URL??'http://localhost:3000'}/app`);
    await page.locator('.workspace-app').waitFor({timeout:10000}).catch(async error=>{console.error(await page.locator('body').innerText());throw error;});
    await page.locator(width>=1024 ? '.workspace-sidebar' : '.mobile-bottom-nav').getByRole('button',{name:/^Meu enxoval/}).click();
    const row=page.locator('[data-item-id=basket]'); await row.waitFor();
    const bounds=await row.evaluate(element=>{
      const image=element.querySelector('.item-thumb').getBoundingClientRect();
      const name=element.querySelector('.item-name').getBoundingClientRect();
      const content=element.querySelector('.item-content').getBoundingClientRect();
      return {image:{x:image.x,y:image.y,right:image.right,bottom:image.bottom},name:{x:name.x,y:name.y,right:name.right,bottom:name.bottom},content:{x:content.x,right:content.right}};
    });
    assert.ok(bounds.image.right<=bounds.name.x,`imagem fica antes do nome em ${width}px`);
    assert.ok(bounds.image.y<bounds.name.bottom,`imagem acompanha o título em ${width}px`);
    await row.getByRole('button',{name:'Abrir detalhes de Cestos organizadores',exact:true}).click();
    const form=row.getByRole('form');
    const product=form.getByLabel('Link do produto',{exact:true});
    await product.fill('https://loja.example/cesto'); await product.press('Tab');
    await form.getByRole('heading',{name:'Quer aproveitar os dados deste link?'}).waitFor();
    assert.equal(extractCount,0,'não consulta a loja sem escolha');
    await form.getByRole('button',{name:'Preencher manualmente',exact:true}).click();
    assert.equal(await form.getByLabel('Nome do item').inputValue(),'Cestos organizadores');
    await product.fill('https://loja.example/cesto-novo'); await product.press('Tab');
    await form.getByRole('button',{name:'Buscar dados do produto',exact:true}).click();
    await form.getByRole('heading',{name:'Como prefere chamar este item?'}).waitFor();
    assert.equal(await form.getByLabel('Nome do item').inputValue(),'Cestos organizadores','a busca sozinha não altera o nome');
    await form.getByRole('button',{name:'Definir meu próprio nome',exact:true}).click();
    assert.equal(await form.getByLabel('Nome do item').inputValue(),'Cestos organizadores');
    assert.equal((await form.getByLabel('Preço',{exact:true}).inputValue()).replace(/\s/g,' '),'R$ 129,90');
    await product.fill('https://loja.example/outro-cesto'); await product.press('Tab');
    await form.getByRole('button',{name:'Buscar dados do produto',exact:true}).click();
    await form.getByRole('button',{name:'Usar nome da loja',exact:true}).click();
    assert.equal(await form.getByLabel('Nome do item').inputValue(),'Cesto de bambu da loja');
    await form.getByRole('button',{name:'Copiar link do produto',exact:true}).click();
    assert.equal((await page.evaluate(()=>window.copiedLinks)).at(-1),'https://loja.example/outro-cesto');
    assert.equal(await form.getByRole('button',{name:'Usar link',exact:true}).count(),0);
    const imageInput=form.getByLabel('Link de uma imagem',{exact:true});
    const layout=await imageInput.evaluate(input=>{
      const field=input.closest('.item-image-field').getBoundingClientRect();const rect=input.getBoundingClientRect();
      return {fieldWidth:field.width,width:rect.width,x:rect.x,right:rect.right,fieldRight:field.right};
    });
    assert.ok(layout.width>=layout.fieldWidth-30,'link da imagem usa toda a largura do componente');
    assert.ok(layout.right<=layout.fieldRight);
    await imageInput.fill('https://cdn.example/cesto.png');
    await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname==='/api/item-images/from-url'),form.getByLabel('Observações').click()]).catch(async error=>{console.error('IMAGE DEBUG',await imageInput.inputValue(),await page.evaluate(()=>document.activeElement?.outerHTML),await form.locator('.item-image-field').innerText());await page.screenshot({path:'tmp/item-links-debug.png',fullPage:true});throw error;});
    await form.getByRole('button',{name:'Copiar link da imagem',exact:true}).click();
    assert.equal((await page.evaluate(()=>window.copiedLinks)).at(-1),'https://cdn.example/cesto.png');
    await page.screenshot({path:`tmp/item-links-${width}.png`,fullPage:true});
    await form.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    await form.waitFor({state:'detached'});
    assert.equal(saved.name,'Cesto de bambu da loja');
    assert.equal(saved.trackedProductUrl,'https://loja.example/outro-cesto');
    assert.equal(saved.initialPriceCents,12990);
    assert.equal(saved.priceCents,12990);
    assert.ok(extractCount===2);
    await row.getByRole('button',{name:'Abrir detalhes de Cesto de bambu da loja',exact:true}).click();
    previewMode='error';
    await product.fill('https://loja.example/bloqueado'); await product.press('Tab');
    await form.getByRole('button',{name:'Buscar dados do produto',exact:true}).click();
    await form.getByText('A loja não permitiu consultar este produto.',{exact:true}).waitFor();
    assert.equal(await form.getByLabel('Nome do item').inputValue(),'Cesto de bambu da loja');
    await form.getByRole('button',{name:'Continuar manualmente',exact:true}).click();
    previewMode='slow';
    await product.fill('https://loja.example/lento'); await product.press('Tab');
    await form.getByRole('button',{name:'Buscar dados do produto',exact:true}).click();
    await form.getByText('Buscando informações na loja…',{exact:true}).waitFor();
    await slowStarted;
    await product.fill('https://loja.example/link-mais-novo'); await product.press('Tab');
    const oldResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/products/extract');
    releaseSlow();
    await oldResponse;
    await form.getByRole('heading',{name:'Quer aproveitar os dados deste link?'}).waitFor();
    assert.equal(await form.getByRole('heading',{name:'Como prefere chamar este item?'}).count(),0,'resposta antiga não substitui o link novo');
    await form.getByRole('button',{name:'Preencher manualmente',exact:true}).click();
    assert.deepEqual(errors,[]);
    const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
    if(!fits){console.error(await page.evaluate(()=>[...document.querySelectorAll('body *')].map(element=>({tag:element.tagName,cls:element.className,x:element.getBoundingClientRect().x,right:element.getBoundingClientRect().right})).filter(element=>element.right>innerWidth+1&&element.x>=0).slice(-20)));await page.screenshot({path:'tmp/item-links-overflow.png',fullPage:true});}
    assert.equal(fits,true,`sem overflow em ${width}px`);
    await page.close();
  }
  console.log('PASS: consent before extraction, store/manual name choices, safe saves, copy buttons, error and stale response handling; responsive image layout from 320 to 1920px.');
} finally { await browser.close(); }
