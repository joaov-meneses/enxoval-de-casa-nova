// Testes do leitor de produtos com HTML de exemplo (sem acessar a internet). Rodar: npm run test:product-scraper
import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUnlockerUrl,
  cleanTitle,
  extractFromHtml,
  findVoltages,
  isBlockedAddress,
  mercadoLivreItemId,
  normalizeProductUrl,
  parseMercadoLivreItem,
  parsePriceToCents,
  readPage,
  scrapeProduct,
  suggestCategory,
  titleFromUrl,
} from "../server/services/productScraper.ts";

test("parsePriceToCents entende os formatos brasileiro e americano", () => {
  assert.equal(parsePriceToCents("R$ 1.899,00"), 189900);
  assert.equal(parsePriceToCents("1899.90"), 189990);
  assert.equal(parsePriceToCents("1.899"), 189900);
  assert.equal(parsePriceToCents("299,9"), 29990);
  assert.equal(parsePriceToCents("R$ 299"), 29900);
  assert.equal(parsePriceToCents("1,299.50"), 129950);
  assert.equal(parsePriceToCents(299.9), 29990);
  assert.equal(parsePriceToCents(19.99), 1999);
  assert.equal(parsePriceToCents("grátis"), null);
  assert.equal(parsePriceToCents(0), null);
  assert.equal(parsePriceToCents(-5), null);
  assert.equal(parsePriceToCents("R$ 99999999999"), null);
});

test("JSON-LD: nome, imagem, menor preço em estoque e moeda", () => {
  const html = `<html><head>
    <script type="application/ld+json">{ quebrado</script>
    <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "Loja" },
        {
          "@type": "Product",
          name: "Fritadeira Air Fryer 4L 220V",
          image: ["/img/fritadeira.jpg"],
          color: "Preto",
          offers: [
            { "@type": "Offer", price: "349.90", priceCurrency: "BRL", availability: "https://schema.org/InStock" },
            { "@type": "Offer", price: "299.90", priceCurrency: "BRL", availability: "https://schema.org/InStock" },
            { "@type": "Offer", price: "199.90", priceCurrency: "BRL", availability: "https://schema.org/OutOfStock" },
          ],
        },
      ],
    })}</script></head><body></body></html>`;
  const found = extractFromHtml(html, "https://www.loja.com.br/p/123");
  assert.equal(found.title, "Fritadeira Air Fryer 4L 220V");
  assert.equal(found.imageUrl, "https://www.loja.com.br/img/fritadeira.jpg");
  assert.equal(found.priceCents, 29990);
  assert.equal(found.currency, "BRL");
  assert.equal(found.inStock, true);
  assert.deepEqual([...new Set(found.voltages)], ["220V"]);
  assert.deepEqual(found.colors, ["Preto"]);
});

test("JSON-LD: produto sem estoque e oferta agregada", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name: "Sofá",
    offers: { "@type": "AggregateOffer", lowPrice: 1899, priceCurrency: "BRL", availability: "OutOfStock" },
  })}</script>`;
  const found = extractFromHtml(html, "https://loja.com.br/sofa");
  assert.equal(found.priceCents, 189900);
  assert.equal(found.inStock, false);
});

test("OpenGraph: título, imagem e preço quando não há JSON-LD", () => {
  const html = `<head>
    <meta property="og:title" content="Jogo de Taças 6 peças | Magazine Luiza">
    <meta property="og:image" content="https://img.loja.com.br/tacas.jpg">
    <meta property="product:price:amount" content="89,90">
    <meta property="product:price:currency" content="BRL">
    <link rel="canonical" href="/tacas">
  </head>`;
  const found = extractFromHtml(html, "https://www.magazineluiza.com.br/tacas/p/1");
  assert.equal(found.title, "Jogo de Taças 6 peças | Magazine Luiza");
  assert.equal(found.imageUrl, "https://img.loja.com.br/tacas.jpg");
  assert.equal(found.priceCents, 8990);
  assert.equal(found.canonicalUrl, "https://www.magazineluiza.com.br/tacas");
});

test("Heurística: preço em 'R$' no HTML, preço no Pix e voltagem", () => {
  const html = `<html><head><title>Liquidificador Turbo</title></head><body>
    <h1>Liquidificador Turbo 1200W</h1>
    <div class="voltagem">Voltagem: 110V ou 220V</div>
    <div class="product-price"><span>R$ 1.899,00</span> em até 10x</div>
    <p>ou R$ 1.709,10 no Pix</p>
    <script>var preco = "R$ 1,00";</script>
  </body></html>`;
  const found = extractFromHtml(html, "https://loja.com.br/liquidificador");
  assert.equal(found.title, "Liquidificador Turbo 1200W");
  assert.equal(found.priceCents, 189900);
  assert.equal(found.pixPriceCents, 170910);
  assert.deepEqual([...new Set(found.voltages)].sort(), ["110V", "220V"]);
});

test("findVoltages reconhece 110V, 127V, 220V e Bivolt", () => {
  assert.deepEqual(findVoltages("Ferro 110/220V"), ["110V", "220V"]);
  assert.deepEqual(findVoltages("Voltagem: 127 Volts"), ["127V"]);
  assert.deepEqual(findVoltages("Aspirador Bivolt"), ["Bivolt"]);
  assert.deepEqual(findVoltages("Capa de colchão 2200 fios"), []);
});

test("Mercado Livre: ID do anúncio e leitura da API", () => {
  assert.equal(mercadoLivreItemId("https://produto.mercadolivre.com.br/MLB-3456789012-air-fryer-_JM"), "MLB3456789012");
  assert.equal(mercadoLivreItemId("https://www.mercadolivre.com.br/air-fryer/p/MLB12345678"), null);
  assert.equal(mercadoLivreItemId("https://www.mercadolivre.com.br/air-fryer/p/MLB12345678?wid=MLB3456789012"), "MLB3456789012");
  assert.equal(mercadoLivreItemId("https://www.amazon.com.br/dp/B000000000"), null);

  const found = parseMercadoLivreItem({
    id: "MLB3456789012",
    title: "Air Fryer Mondial 4L",
    price: 329.9,
    currency_id: "BRL",
    status: "active",
    available_quantity: 12,
    permalink: "https://produto.mercadolivre.com.br/MLB-3456789012-air-fryer",
    pictures: [{ secure_url: "https://http2.mlstatic.com/D_NQ_NP_123-O.webp" }],
    attributes: [
      { id: "VOLTAGE", value_name: "220V" },
      { id: "COLOR", value_name: "Preto" },
    ],
  });
  assert.equal(found.title, "Air Fryer Mondial 4L");
  assert.equal(found.priceCents, 32990);
  assert.equal(found.inStock, true);
  assert.equal(found.imageUrl, "https://http2.mlstatic.com/D_NQ_NP_123-O.webp");
  assert.deepEqual(found.voltages, ["220V"]);
  assert.deepEqual(found.colors, ["Preto"]);
  assert.equal(parseMercadoLivreItem({ title: "sem preço" }), null);
});

test("normalizeProductUrl remove rastreio e fragmento", () => {
  assert.equal(
    normalizeProductUrl("www.loja.com.br/produto?utm_source=x&id=7&fbclid=abc#avaliacoes"),
    "https://www.loja.com.br/produto?id=7",
  );
  assert.equal(
    normalizeProductUrl("https://loja.com.br/p?b=2&a=1"),
    normalizeProductUrl("https://loja.com.br/p?a=1&b=2"),
  );
});

test("Proteção SSRF: endereços locais e privados são recusados antes de qualquer acesso", async () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "169.254.169.254", "172.16.5.5", "100.64.0.1", "::1", "fe80::1", "fd00::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "0.0.0.0"])
    assert.equal(isBlockedAddress(address), true, address);
  for (const address of ["8.8.8.8", "177.12.34.56", "2606:4700:4700::1111"])
    assert.equal(isBlockedAddress(address), false, address);

  for (const url of [
    "http://localhost/produto",
    "http://127.0.0.1:3000/api/health",
    "http://[::1]/",
    "http://10.0.0.5/admin",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://intranet/produto",
    "http://servidor.local/produto",
    "ftp://loja.com.br/arquivo",
    "file:///etc/passwd",
    "http://usuario:senha@loja.com.br/",
    "http://loja.com.br:22/",
  ]) {
    await assert.rejects(() => scrapeProduct(url), error => error.code === "invalid_url", url);
  }
});

test("cleanTitle e suggestCategory", () => {
  assert.equal(cleanTitle("Amazon.com.br: Fritadeira Elétrica Air Fryer 4L", "amazon.com.br"), "Fritadeira Elétrica Air Fryer 4L");
  assert.equal(cleanTitle("Fritadeira Air Fryer 4L | Mercado Livre", "mercadolivre.com.br"), "Fritadeira Air Fryer 4L");
  assert.equal(cleanTitle("  Jogo   de   Panelas  ", "loja.com.br"), "Jogo de Panelas");
  assert.equal(suggestCategory("Air Fryer Mondial 4L"), "Cozinha");
  assert.equal(suggestCategory("Máquina de Lavar 12kg"), "Área de Serviço");
  assert.equal(suggestCategory("Jogo de Lençol Queen"), "Quarto");
  assert.equal(suggestCategory("Toalha de Banho"), "Banheiro");
  assert.equal(suggestCategory("Sofá 3 Lugares"), "Sala");
  assert.equal(suggestCategory("Item misterioso"), undefined);
});

test("titleFromUrl tira um nome legível do endereço da loja", () => {
  assert.equal(
    titleFromUrl("https://www.magazineluiza.com.br/fritadeira-airfryer-mondial-4l/p/237177900/ep/afr/"),
    "Fritadeira Airfryer Mondial 4L",
  );
  assert.equal(
    titleFromUrl("https://www.amazon.com.br/Fryer-Philco-Revestimento-Redstone-PAF40A/dp/B0DY2FPRJD"),
    "Fryer Philco Revestimento Redstone Paf40a",
  );
  assert.equal(
    titleFromUrl("https://produto.mercadolivre.com.br/MLB-3456789012-jogo-de-panelas-antiaderente-_JM"),
    "Jogo de Panelas Antiaderente",
  );
  assert.equal(
    titleFromUrl("https://shopee.com.br/Jogo-de-Toalhas-Banho-i.123456.7890123"),
    "Jogo de Toalhas Banho",
  );
  assert.equal(titleFromUrl("https://www.loja.com.br/"), undefined);
  assert.equal(titleFromUrl("https://www.loja.com.br/p/123456789"), undefined);
  assert.equal(titleFromUrl("https://www.loja.com.br/produto/B0DY2FPRJD"), undefined);
});

test("readPage: tela de desafio vira 'blocked'; produto com nome e foto passa mesmo sem preço", () => {
  const url = new URL("https://www.magazineluiza.com.br/produto/p/1/");
  const akamai = `<html><body><script src="/x.js"></script><div id="sec-if-cpt-container"></div></body></html>`;
  assert.equal(readPage({ status: 200, body: akamai, url }).error?.code, "blocked");
  assert.equal(readPage({ status: 403, body: "", url }).error?.code, "blocked");
  assert.equal(readPage({ status: 404, body: "", url }).error?.code, "not_found");

  const spa = `<html><head><title>Loja</title></head><body>${"<div>x</div>".repeat(2000)}</body></html>`;
  assert.equal(readPage({ status: 200, body: spa, url }).error?.code, "no_data");

  const semPreco = `<head><meta property="og:title" content="Liquidificador"><meta property="og:image" content="https://img.loja.com.br/a.jpg"><link href="https://static.akamaized.net/a.css"></head>`;
  const result = readPage({ status: 200, body: semPreco, url });
  assert.equal(result.error, null);
  assert.equal(result.page?.title, "Liquidificador");
  assert.equal(result.page?.priceCents ?? null, null);
});

test("buildUnlockerUrl monta a chamada de cada serviço e não deixa o ajuste trocar a chave nem o alvo", () => {
  const zen = buildUnlockerUrl("zenrows", "CHAVE", "https://loja.com.br/p?id=1");
  assert.equal(zen.origin + zen.pathname, "https://api.zenrows.com/v1/");
  assert.equal(zen.searchParams.get("apikey"), "CHAVE");
  assert.equal(zen.searchParams.get("url"), "https://loja.com.br/p?id=1");
  assert.equal(zen.searchParams.get("proxy_country"), "br");
  assert.equal(zen.searchParams.get("js_render"), "true");

  const scraper = buildUnlockerUrl("scraperapi", "CHAVE", "https://loja.com.br/p", "premium=false&api_key=OUTRA&url=http://127.0.0.1");
  assert.equal(scraper.searchParams.get("api_key"), "CHAVE");
  assert.equal(scraper.searchParams.get("url"), "https://loja.com.br/p");
  assert.equal(scraper.searchParams.get("premium"), "false");
  assert.equal(scraper.searchParams.get("render"), "true");
});

test("readPage: shell do Mercado Livre (só o nome da loja e o logo) é tratado como bloqueio", () => {
  const url = new URL("https://produto.mercadolivre.com.br/MLB-1-air-fryer-_JM");
  const shell = `<html><head><title>Mercado Livre</title><meta property="og:title" content="Mercado Livre"><meta property="og:image" content="https://http2.mlstatic.com/logo.png"></head><body></body></html>`;
  assert.equal(readPage({ status: 200, body: shell, url }).error?.code, "blocked");
  const amazon = new URL("https://www.amazon.com.br/dp/B0DY2FPRJD");
  const real = `<head><meta property="og:title" content="Amazon.com.br: Air Fryer Philco 4L"><meta property="og:image" content="https://m.media-amazon.com/a.jpg"></head>`;
  assert.equal(readPage({ status: 200, body: real, url: amazon }).error, null);
});
