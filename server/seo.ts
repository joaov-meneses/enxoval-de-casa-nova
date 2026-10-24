// SEO técnico das páginas públicas. O app é renderizado no navegador, então o servidor entrega o index.html já com
// título, descrição, canonical e Open Graph de cada página pública, e `noindex` nas privadas (app, admin, links de
// e-mail). Também publica robots.txt e sitemap.xml a partir da mesma lista. O endereço canônico vem de APP_URL.
import type { Express } from 'express';
import { appBaseUrl } from './mailer.ts';

interface PublicPage { path: string; title: string; description: string; priority: string; changefreq: string }

/** Páginas que buscadores devem indexar. A ordem é a do sitemap. */
export const PUBLIC_PAGES: PublicPage[] = [
  {
    path: '/',
    title: 'Casa Mia | Enxoval de casa nova',
    description: 'Organize o enxoval da casa nova por ambiente, saiba o que comprar em cada semana até a mudança e acompanhe o quanto já investiu.',
    priority: '1.0', changefreq: 'weekly',
  },
  {
    path: '/como-o-nino-escolhe',
    title: 'Como o Nino escolhe | Casa Mia',
    description: 'Entenda como o Nino, o assistente do Casa Mia, sugere a ordem de compra dos itens do enxoval a partir da data da mudança.',
    priority: '0.7', changefreq: 'monthly',
  },
  {
    path: '/comecar',
    title: 'Monte o plano da sua casa nova | Casa Mia',
    description: 'Responda algumas perguntas e receba a lista do enxoval da sua casa nova, ambiente por ambiente, com a semana certa de comprar cada item.',
    priority: '0.8', changefreq: 'monthly',
  },
  {
    path: '/privacidade',
    title: 'Privacidade | Casa Mia',
    description: 'Como o Casa Mia trata seus dados pessoais, quais ferramentas usa e como mudar suas preferências.',
    priority: '0.3', changefreq: 'yearly',
  },
];

/** Prefixos que nunca devem aparecer em buscadores: conta, gestão e links que chegam por e-mail. */
const PRIVATE_PREFIXES = [
  '/app', '/admin', '/login', '/cadastro', '/convite', '/preferencias', '/pesquisa', '/esqueci-senha', '/redefinir-senha',
  '/verificar-email', '/api',
];

export function isPrivatePath(pathname: string) {
  return PRIVATE_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function setMeta(html: string, pattern: RegExp, tag: string) {
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

/** Dados estruturados da página inicial: o site e o aplicativo, para o resultado da busca mostrar o nome certo. */
function structuredData(baseUrl: string) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', name: 'Casa Mia', url: `${baseUrl}/`, inLanguage: 'pt-BR' },
      {
        '@type': 'WebApplication', name: 'Casa Mia', url: `${baseUrl}/`, applicationCategory: 'LifestyleApplication',
        operatingSystem: 'Web', inLanguage: 'pt-BR',
        description: PUBLIC_PAGES[0].description,
      },
    ],
  }).replaceAll('<', '\\u003c');
}

/** index.html com os metadados da página pedida. Sem APP_URL não há canonical (nunca usa o Host da requisição). */
export function renderPageHtml(html: string, pathname: string, baseUrl = appBaseUrl()) {
  const page = PUBLIC_PAGES.find(entry => entry.path === pathname);
  let out = html;
  if (!page) {
    return isPrivatePath(pathname)
      ? setMeta(out, /<meta name="robots"[^>]*>/, '<meta name="robots" content="noindex, nofollow" />')
      : out;
  }
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttribute(page.title)}</title>`);
  out = setMeta(out, /<meta\s+name="description"[^>]*\/>/, `<meta name="description" content="${escapeAttribute(page.description)}" />`);
  out = setMeta(out, /<meta property="og:title"[^>]*\/>/, `<meta property="og:title" content="${escapeAttribute(page.title)}" />`);
  out = setMeta(out, /<meta\s+property="og:description"[^>]*\/>/, `<meta property="og:description" content="${escapeAttribute(page.description)}" />`);
  if (baseUrl) {
    const url = `${baseUrl}${page.path}`;
    out = setMeta(out, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeAttribute(url)}" />`);
    out = setMeta(out, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escapeAttribute(url)}" />`);
    out = out.replace('content="/images/casamia-home.webp"', `content="${escapeAttribute(`${baseUrl}/images/casamia-home.webp`)}"`);
    if (page.path === '/') {
      out = out.replace('</head>', `    <script type="application/ld+json">${structuredData(baseUrl)}</script>\n  </head>`);
    }
  }
  return out;
}

export function robotsTxt(baseUrl: string | null) {
  const lines = ['User-agent: *', ...PRIVATE_PREFIXES.map(prefix => `Disallow: ${prefix}`), 'Allow: /'];
  if (baseUrl) lines.push('', `Sitemap: ${baseUrl}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

export function sitemapXml(baseUrl: string) {
  const urls = PUBLIC_PAGES.map(page =>
    `  <url><loc>${escapeAttribute(`${baseUrl}${page.path}`)}</loc><changefreq>${page.changefreq}</changefreq><priority>${page.priority}</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

/** robots.txt, sitemap.xml e o cabeçalho X-Robots-Tag das páginas privadas. Vem antes dos arquivos estáticos. */
export function registerSeoRoutes(app: Express) {
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(robotsTxt(appBaseUrl()));
  });
  app.get('/sitemap.xml', (_req, res) => {
    const baseUrl = appBaseUrl();
    if (!baseUrl) {
      res.status(404).end();
      return;
    }
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(sitemapXml(baseUrl));
  });
  app.use((req, res, next) => {
    if (req.method === 'GET' && isPrivatePath(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
}
