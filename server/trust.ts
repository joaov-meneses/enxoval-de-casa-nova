/**
 * Confiança e proteção contra abuso (Fase 9): identificador do aparelho, bloqueios por conta, IP, faixa ou aparelho
 * e bloqueio temporário automático de IPs com rajadas de falhas de login ou de cadastros.
 *
 * Quem decide um bloqueio definitivo é sempre uma pessoa no /admin. O sistema só aplica sozinho bloqueios curtos e
 * restritos à entrada (login, cadastro e aceite de convite), para não derrubar quem já está usando o app numa rede
 * compartilhada.
 */
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request, RequestHandler, Response } from 'express';
import { getPool, type Queryable } from './database.ts';
import { getLogger } from './logger.ts';
import { cookieOptions, getCookie, HttpError } from './security.ts';

export const DEVICE_COOKIE = 'casamia_device';
const DEVICE_TTL_MS = 2 * 365 * 24 * 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BAN_TARGETS = ['user', 'ip', 'cidr', 'device'] as const;
export type BanTarget = (typeof BAN_TARGETS)[number];
export const BAN_REASONS = ['fraud', 'spam', 'abuse', 'scraping', 'impersonation', 'legal', 'other', 'login_failures', 'signup_burst'] as const;
export type BanReason = (typeof BAN_REASONS)[number];
/** `block_all` barra a API inteira; `block_auth` só barra entrar, criar conta e aceitar convite. */
export type BanScope = 'block_all' | 'block_auth';

/** Rajadas que geram bloqueio automático e temporário do IP (só na entrada). */
export const AUTO_BLOCK = {
  loginFailures: 10,
  loginWindowMinutes: 15,
  signups: 10,
  signupWindowMinutes: 60,
  durationMinutes: 60,
};

export interface ClientContext {
  ip: string | null;
  deviceId: string | null;
  userAgent: string | null;
}

export interface ActiveBan {
  id: string;
  target_type: BanTarget;
  scope: BanScope;
  reason_code: BanReason;
  expires_at: Date | null;
}

function readDeviceId(req: Request) {
  const value = getCookie(req, DEVICE_COOKIE);
  return UUID.test(value) ? value.toLowerCase() : null;
}

/** IP do cliente como o Express o entende (respeita `trust proxy`), sem o prefixo IPv4 mapeado em IPv6. */
export function clientIp(req: Request) {
  const raw = (req.ip ?? '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
  return isIP(raw) ? raw : null;
}

/**
 * Identificador aleatório do aparelho, criado pelo servidor e guardado num cookie só dele. Não é impressão digital:
 * a pessoa o apaga junto com os cookies, e ele não serve para seguir ninguém em outros sites.
 */
export function ensureDevice(req: Request, res: Response): ClientContext {
  let deviceId = readDeviceId(req);
  if (!deviceId) {
    deviceId = randomUUID();
    res.cookie(DEVICE_COOKIE, deviceId, { ...cookieOptions(), maxAge: DEVICE_TTL_MS });
  }
  res.locals.deviceId = deviceId;
  return { ip: clientIp(req), deviceId, userAgent: (req.get('user-agent') ?? '').slice(0, 512) || null };
}

export function describeUserAgent(userAgent: string | null | undefined) {
  const ua = userAgent ?? '';
  if (!ua) return { browser: null, os: null, device: null };
  if (/bot|crawler|spider|curl|wget|python|httpclient|headless|^node$|undici/i.test(ua)) {
    return { browser: 'Automatizado', os: null, device: 'robô' };
  }
  const browser = /Edg(?:e|A|iOS)?\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /SamsungBrowser\//.test(ua) ? 'Samsung Internet'
    : /Firefox\/|FxiOS\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) && /Version\//.test(ua) ? 'Safari'
    : 'Outro';
  const os = /Windows NT/.test(ua) ? 'Windows'
    : /iPhone|iPod/.test(ua) ? 'iOS'
    : /iPad/.test(ua) ? 'iPadOS'
    : /Android/.test(ua) ? 'Android'
    : /CrOS/.test(ua) ? 'ChromeOS'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : null;
  const device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet'
    : /Mobi|iPhone|iPod/.test(ua) ? 'celular'
    : 'computador';
  return { browser, os, device };
}

/** Registra o aparelho da conta (primeira e última vez visto). Não guarda IP: o IP fica só em `user_ip_events`. */
export async function recordDevice(queryable: Queryable, userId: string, context: ClientContext) {
  if (!context.deviceId) return;
  const { browser, os, device } = describeUserAgent(context.userAgent);
  await queryable.query(`
    INSERT INTO user_devices (user_id, device_id, ua_browser, ua_os, ua_device)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, device_id) DO UPDATE SET last_seen_at = now(),
      ua_browser = EXCLUDED.ua_browser, ua_os = EXCLUDED.ua_os, ua_device = EXCLUDED.ua_device
  `, [userId, context.deviceId, browser, os, device]);
}

const ACTIVE_BAN_SQL = `revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`;

/**
 * Bloqueio em vigor para a conta, o IP (exato ou dentro de uma faixa) ou o aparelho. Com `onlyAll`, ignora os
 * bloqueios que valem só para a entrada.
 */
export async function findActiveBan(
  queryable: Queryable,
  target: { userId?: string | null; ip?: string | null; deviceId?: string | null },
  onlyAll = false,
): Promise<ActiveBan | null> {
  const result = await queryable.query<ActiveBan>(`
    SELECT id, target_type, scope, reason_code, expires_at FROM bans
    WHERE ${ACTIVE_BAN_SQL} AND ($4::boolean IS FALSE OR scope = 'block_all')
      AND CASE target_type
        WHEN 'user' THEN target_value = $1::text
        WHEN 'device' THEN target_value = $3::text
        -- CASE garante a ordem: o valor só vira endereço nas linhas que guardam um endereço.
        WHEN 'ip' THEN $2::inet IS NOT NULL AND target_value::inet = $2::inet
        WHEN 'cidr' THEN $2::inet IS NOT NULL AND $2::inet <<= target_value::cidr
        ELSE false END
    ORDER BY (scope = 'block_all') DESC, expires_at DESC NULLS FIRST
    LIMIT 1
  `, [target.userId ?? null, target.ip ?? null, target.deviceId ?? null, onlyAll]);
  return result.rows[0] ?? null;
}

export function blockedError(ban: ActiveBan) {
  if (ban.scope === 'block_auth') {
    return new HttpError(429, 'Muitas tentativas a partir desta rede. Aguarde um pouco e tente novamente.', 'AUTH_TEMPORARILY_BLOCKED');
  }
  return new HttpError(403, 'O acesso ao Casa Mia foi bloqueado para esta conta ou conexão. Se você acha que é um engano, responda a qualquer e-mail do Casa Mia pedindo uma revisão.', 'ACCOUNT_BLOCKED');
}

/** Recusa a entrada (login, cadastro, convite) quando há qualquer bloqueio em vigor. */
export async function assertNotBlocked(queryable: Queryable, target: { userId?: string | null; ip?: string | null; deviceId?: string | null }) {
  const ban = await findActiveBan(queryable, target);
  if (ban) throw blockedError(ban);
}

// Cada requisição da API consulta os bloqueios de IP e aparelho. O resultado fica alguns segundos em memória:
// um bloqueio novo chega às outras instâncias nesse prazo.
const BAN_CACHE_MS = 10_000;
const banCache = new Map<string, { ban: ActiveBan | null; expires: number }>();

export function clearBanCache() {
  banCache.clear();
}

export const enforceBans: RequestHandler = (req, _res, next) => {
  if (/^\/(admin(?:\/|$)|health$)/.test(req.path)) return next();
  const ip = clientIp(req);
  const deviceId = readDeviceId(req);
  if (!ip && !deviceId) return next();
  const key = `${ip ?? ''}|${deviceId ?? ''}`;
  const now = Date.now();
  const cached = banCache.get(key);
  const lookup = cached && cached.expires > now
    ? Promise.resolve(cached.ban)
    : findActiveBan(getPool(), { ip, deviceId }, true).then(ban => {
      if (banCache.size > 10_000) banCache.clear();
      banCache.set(key, { ban, expires: now + BAN_CACHE_MS });
      return ban;
    });
  lookup.then(ban => next(ban ? blockedError(ban) : undefined), next);
};

/** Endereços da própria máquina (testes, health check) nunca recebem bloqueio automático. */
function isLoopback(ip: string) {
  return ip === '::1' || ip.startsWith('127.');
}

async function autoBlock(queryable: Queryable, ip: string, reason: Extract<BanReason, 'login_failures' | 'signup_burst'>, count: number) {
  // IPv6: bloqueia o /64, que costuma ser uma casa ou um aparelho; um endereço sozinho troca a cada conexão.
  const isV6 = isIP(ip) === 6;
  const inserted = await queryable.query(`
    INSERT INTO bans (id, target_type, target_value, scope, reason_code, notes, created_by, expires_at)
    SELECT $1, $2, CASE WHEN $2 = 'cidr' THEN network(set_masklen($3::inet, 64))::text ELSE host($3::inet) END,
      'block_auth', $4, $5, 'sistema', now() + make_interval(mins => $6)
    WHERE NOT EXISTS (
      SELECT 1 FROM bans WHERE ${ACTIVE_BAN_SQL}
        AND CASE target_type WHEN 'ip' THEN target_value::inet = $3::inet WHEN 'cidr' THEN $3::inet <<= target_value::cidr ELSE false END
    )
  `, [randomUUID(), isV6 ? 'cidr' : 'ip', ip, reason, `${count} ocorrências na janela de verificação.`, AUTO_BLOCK.durationMinutes]);
  if (inserted.rowCount) {
    clearBanCache();
    getLogger().warn({ event: 'security.ip_auto_blocked', reason, count }, 'IP bloqueado temporariamente na entrada.');
  }
}

/** Registra uma falha de login e bloqueia o IP por um tempo se as falhas passarem do limite. */
export async function recordLoginFailure(ip: string | null) {
  if (!ip) return;
  const pool = getPool();
  await pool.query('INSERT INTO auth_failures (ip) VALUES ($1::inet)', [ip]);
  if (isLoopback(ip)) return;
  const result = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM auth_failures WHERE ip = $1::inet AND occurred_at > now() - make_interval(mins => $2)`,
    [ip, AUTO_BLOCK.loginWindowMinutes]);
  const total = result.rows[0]?.total ?? 0;
  if (total >= AUTO_BLOCK.loginFailures) await autoBlock(pool, ip, 'login_failures', total);
}

/** Depois de um cadastro: muitas contas novas do mesmo IP em pouco tempo bloqueiam novos cadastros por um tempo. */
export async function checkSignupBurst(ip: string | null) {
  if (!ip || isLoopback(ip)) return;
  const pool = getPool();
  const result = await pool.query<{ total: number }>(`
    SELECT COUNT(*)::int AS total FROM user_ip_events
    WHERE ip = $1::inet AND event IN ('signup', 'invitation_signup') AND occurred_at > now() - make_interval(mins => $2)
  `, [ip, AUTO_BLOCK.signupWindowMinutes]);
  const total = result.rows[0]?.total ?? 0;
  if (total >= AUTO_BLOCK.signups) await autoBlock(pool, ip, 'signup_burst', total);
}

/**
 * Verificação de e-mail obrigatória: ligada em produção (desligue com EMAIL_VERIFICATION_REQUIRED=false) e
 * desligada fora dela (ligue com EMAIL_VERIFICATION_REQUIRED=true).
 */
export function emailVerificationRequired(env = process.env) {
  if (env.EMAIL_VERIFICATION_REQUIRED === 'true') return true;
  if (env.EMAIL_VERIFICATION_REQUIRED === 'false') return false;
  return env.NODE_ENV === 'production' || process.argv.includes('--production');
}
