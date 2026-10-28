// Proxy próprio do PostHog em /ingest: o navegador fala com o domínio do app (cookies de primeira parte e menos
// bloqueio por extensões). Ligado quando o build usa VITE_POSTHOG_HOST=/ingest. O IP do visitante não é repassado
// (o projeto já descarta IP), e há limite de tamanho e de taxa para a rota não virar porta aberta.
import express, { type Express } from 'express';
import { rateLimit } from './security.ts';

const FORWARDED_REQUEST_HEADERS = ['content-type', 'content-encoding', 'user-agent', 'accept', 'accept-language'];
const FORWARDED_RESPONSE_HEADERS = ['content-type', 'cache-control', 'access-control-allow-origin'];

export function ingestTargets(env = process.env) {
  const api = (env.POSTHOG_PROXY_HOST || 'https://us.i.posthog.com').replace(/\/+$/, '');
  const assets = (env.POSTHOG_PROXY_ASSETS_HOST || api.replace(/^https:\/\/(us|eu)\.i\.posthog\.com$/, 'https://$1-assets.i.posthog.com')).replace(/\/+$/, '');
  return { api, assets };
}

/** Endereço de destino de um caminho recebido em /ingest (só PostHog; nunca um host vindo da requisição). */
export function ingestTarget(pathWithQuery: string, env = process.env) {
  const { api, assets } = ingestTargets(env);
  const clean = pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`;
  return new URL(`${clean.startsWith('/static/') ? assets : api}${clean}`);
}

export function registerIngestProxy(app: Express) {
  if (process.env.POSTHOG_PROXY === 'off') return;
  app.use('/ingest',
    rateLimit(1200, 60_000, 'Muitas requisições.'),
    express.raw({ type: () => true, limit: '1mb' }),
    async (req, res) => {
      const target = ingestTarget(req.url);
      const headers = new Headers();
      for (const name of FORWARDED_REQUEST_HEADERS) {
        const value = req.get(name);
        if (value) headers.set(name, value);
      }
      try {
        const upstream = await fetch(target, {
          method: req.method,
          headers,
          body: ['GET', 'HEAD'].includes(req.method) || !Buffer.isBuffer(req.body) || !req.body.length ? undefined : req.body,
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        });
        res.status(upstream.status);
        for (const name of FORWARDED_RESPONSE_HEADERS) {
          const value = upstream.headers.get(name);
          if (value) res.set(name, value);
        }
        res.send(Buffer.from(await upstream.arrayBuffer()));
      } catch {
        res.status(502).json({ error: 'Análise indisponível.' });
      }
    });
}
