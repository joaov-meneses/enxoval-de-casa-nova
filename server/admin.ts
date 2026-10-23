import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import type { Request, Router } from "express";
import { getPool, withTransaction } from "./database.ts";
import {
  asyncHandler,
  cookieOptions,
  getCookie,
  hashPassword,
  hashSessionToken,
  HttpError,
  loginRateLimit,
} from "./security.ts";
import { BAN_REASONS, BAN_TARGETS, clearBanCache, type BanTarget } from "./trust.ts";
import type { AdminBan, AdminUser } from "../src/types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Motivos que a equipe escolhe; os demais são do bloqueio automático. */
const ADMIN_BAN_REASONS: readonly string[] = BAN_REASONS.filter((reason) => !["login_failures", "signup_burst"].includes(reason));
const MAX_BAN_HOURS = 5 * 365 * 24;

const ADMIN_COOKIE = "casamia_admin_session";
const ADMIN_SESSION_TTL = 8 * 60 * 60_000;

function adminConfig() {
  const login = process.env.ADMIN_LOGIN?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!login || !password || password.length < 12) return null;
  const version = createHash("sha256")
    .update(JSON.stringify([login, password]))
    .digest("hex");
  return { login, password, version };
}

export async function requireAdmin(req: Request) {
  const config = adminConfig();
  if (!config)
    throw new HttpError(
      503,
      "Configure ADMIN_LOGIN e ADMIN_PASSWORD (mínimo de 12 caracteres) no servidor para habilitar a gestão.",
    );
  const token = getCookie(req, ADMIN_COOKIE);
  if (!token) throw new HttpError(401, "Entre com seu acesso administrativo.");
  const result = await getPool().query(
    "SELECT id FROM admin_sessions WHERE token_hash = $1 AND credential_version = $2 AND expires_at > now()",
    [hashSessionToken(token), config.version],
  );
  if (!result.rowCount)
    throw new HttpError(
      401,
      "Sua sessão administrativa expirou. Entre novamente.",
    );
  return config;
}

function userId(req: Request) {
  const id = String(req.params.id);
  if (!UUID.test(id)) throw new HttpError(404, "Usuário não encontrado.");
  return id;
}

/** Valida e normaliza o alvo de um bloqueio (endereço sem zeros à esquerda, faixa sem bits de host). */
async function normalizeBanTarget(type: BanTarget, raw: unknown) {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (type === "user" || type === "device") {
    if (!UUID.test(value)) throw new HttpError(400, type === "user" ? "Conta inválida." : "Aparelho inválido.");
    if (type === "user") {
      const found = await getPool().query("SELECT 1 FROM users WHERE id = $1", [value]);
      if (!found.rowCount) throw new HttpError(404, "Usuário não encontrado.");
    }
    return value.toLowerCase();
  }
  if (type === "ip") {
    if (!isIP(value)) throw new HttpError(400, "Informe um IP válido, como 203.0.113.7.");
    const result = await getPool().query<{ value: string }>("SELECT host($1::inet) AS value", [value]);
    return result.rows[0].value;
  }
  const [address, prefix] = value.split("/");
  const version = isIP(address ?? "");
  const bits = Number(prefix);
  if (!version || !/^\d+$/.test(prefix ?? "") || bits > (version === 4 ? 32 : 128))
    throw new HttpError(400, "Informe uma faixa válida, como 203.0.113.0/24.");
  // Faixas largas demais pegam operadoras inteiras.
  if (bits < (version === 4 ? 16 : 32))
    throw new HttpError(400, version === 4 ? "Use uma faixa de /16 ou menor." : "Use uma faixa de /32 ou menor.");
  const result = await getPool().query<{ value: string }>("SELECT network($1::inet)::text AS value", [value]);
  return result.rows[0].value;
}

export function registerAdminRoutes(router: Router) {
  router.use("/admin", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post(
    "/admin/login",
    loginRateLimit(10),
    asyncHandler(async (req, res) => {
      const config = adminConfig();
      if (!config)
        throw new HttpError(
          503,
          "Configure ADMIN_LOGIN e ADMIN_PASSWORD (mínimo de 12 caracteres) no servidor para habilitar a gestão.",
        );
      const login =
        typeof req.body?.login === "string" ? req.body.login.trim() : "";
      const password =
        typeof req.body?.password === "string" ? req.body.password : "";
      if (login.length > 200 || password.length > 512)
        throw new HttpError(401, "Login ou senha inválidos.");
      const provided = createHash("sha256")
        .update(JSON.stringify([login, password]))
        .digest();
      if (!timingSafeEqual(provided, Buffer.from(config.version, "hex")))
        throw new HttpError(401, "Login ou senha inválidos.");
      const token = randomBytes(32).toString("base64url");
      await getPool().query(
        "DELETE FROM admin_sessions WHERE expires_at <= now() OR credential_version <> $1 OR token_hash = $2",
        [config.version, hashSessionToken(getCookie(req, ADMIN_COOKIE))],
      );
      await getPool().query(
        "INSERT INTO admin_sessions (id, token_hash, credential_version, expires_at) VALUES ($1, $2, $3, $4)",
        [
          randomUUID(),
          hashSessionToken(token),
          config.version,
          new Date(Date.now() + ADMIN_SESSION_TTL),
        ],
      );
      res.cookie(ADMIN_COOKIE, token, {
        ...cookieOptions(),
        maxAge: ADMIN_SESSION_TTL,
      });
      res.json({ login: config.login });
    }),
  );

  router.get(
    "/admin/session",
    asyncHandler(async (req, res) => {
      const config = await requireAdmin(req);
      res.json({ login: config.login });
    }),
  );

  router.post(
    "/admin/logout",
    asyncHandler(async (req, res) => {
      await getPool().query(
        "DELETE FROM admin_sessions WHERE token_hash = $1",
        [hashSessionToken(getCookie(req, ADMIN_COOKIE))],
      );
      res.clearCookie(ADMIN_COOKIE, cookieOptions());
      res.status(204).end();
    }),
  );

  router.get(
    "/admin/users",
    asyncHandler(async (req, res) => {
      await requireAdmin(req);
      const result = await getPool().query<AdminUser>(`
      SELECT u.id, u.name, u.email, u.is_active AS "isActive",
        u.must_change_password AS "mustChangePassword",
        u.password_reset_expires_at AS "passwordResetExpiresAt",
        u.created_at AS "createdAt", u.last_login_at AS "lastLoginAt",
        COALESCE((
          SELECT array_agg(DISTINCT host(e.ip) ORDER BY host(e.ip))
          FROM user_ip_events e
          WHERE e.user_id = u.id AND e.occurred_at >= now() - interval '6 months'
        ), ARRAY[]::text[]) AS "ipAddresses",
        (SELECT COUNT(*)::int FROM enxoval_members m WHERE m.user_id = u.id) AS "workspaceCount",
        u.email_verified_at AS "emailVerifiedAt",
        COALESCE((
          SELECT json_agg(json_build_object('deviceId', d.device_id, 'browser', d.ua_browser, 'os', d.ua_os,
            'device', d.ua_device, 'firstSeenAt', d.first_seen_at, 'lastSeenAt', d.last_seen_at) ORDER BY d.last_seen_at DESC)
          FROM user_devices d WHERE d.user_id = u.id
        ), '[]'::json) AS devices,
        (
          SELECT json_build_object('id', b.id, 'reasonCode', b.reason_code, 'expiresAt', b.expires_at)
          FROM bans b
          WHERE b.target_type = 'user' AND b.target_value = u.id::text AND b.revoked_at IS NULL
            AND (b.expires_at IS NULL OR b.expires_at > now())
          ORDER BY b.created_at DESC LIMIT 1
        ) AS "activeBan"
      FROM users u ORDER BY u.created_at DESC, u.id
    `);
      res.json({ users: result.rows });
    }),
  );

  router.post(
    "/admin/users/:id/reset-password",
    asyncHandler(async (req, res) => {
      await requireAdmin(req);
      const id = userId(req);
      const temporaryPassword = randomBytes(12).toString("base64url");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60_000);
      await withTransaction(async (client) => {
        const result = await client.query(
          "SELECT id, is_active FROM users WHERE id = $1 FOR UPDATE",
          [id],
        );
        if (!result.rowCount)
          throw new HttpError(404, "Usuário não encontrado.");
        if (!result.rows[0].is_active)
          throw new HttpError(
            409,
            "Reative a conta antes de redefinir a senha.",
          );
        await client.query(
          "UPDATE users SET password_hash = $2, must_change_password = true, password_reset_expires_at = $3, updated_at = now() WHERE id = $1",
          [id, await hashPassword(temporaryPassword), expiresAt],
        );
        await client.query("DELETE FROM sessions WHERE user_id = $1", [id]);
        // Links de redefinição enviados por e-mail antes deste reset deixam de valer.
        await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [id]);
      });
      // Only the hash is persisted. The plaintext is returned once, to this admin session.
      res.json({ temporaryPassword, expiresAt: expiresAt.toISOString() });
    }),
  );

  router.patch(
    "/admin/users/:id/status",
    asyncHandler(async (req, res) => {
      await requireAdmin(req);
      const id = userId(req);
      if (typeof req.body?.isActive !== "boolean")
        throw new HttpError(400, "Informe o status da conta.");
      await withTransaction(async (client) => {
        const result = await client.query(
          "UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING id",
          [id, req.body.isActive],
        );
        if (!result.rowCount)
          throw new HttpError(404, "Usuário não encontrado.");
        if (!req.body.isActive)
          await client.query("DELETE FROM sessions WHERE user_id = $1", [id]);
      });
      res.status(204).end();
    }),
  );

  router.post(
    "/admin/users/:id/verify-email",
    asyncHandler(async (req, res) => {
      await requireAdmin(req);
      const result = await getPool().query(
        "UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1 RETURNING email_verified_at",
        [userId(req)],
      );
      if (!result.rowCount) throw new HttpError(404, "Usuário não encontrado.");
      res.json({ emailVerifiedAt: result.rows[0].email_verified_at });
    }),
  );

  router.get(
    "/admin/bans",
    asyncHandler(async (req, res) => {
      await requireAdmin(req);
      // Em vigor primeiro; os encerrados aparecem por 30 dias para conferência.
      const result = await getPool().query<AdminBan>(`
      SELECT b.id, b.target_type AS "targetType", b.target_value AS "targetValue",
        CASE WHEN b.target_type = 'user' THEN (SELECT u.name || ' · ' || u.email FROM users u WHERE u.id::text = b.target_value) END AS "targetLabel",
        b.scope, b.reason_code AS "reasonCode", b.notes, b.created_by AS "createdBy", b.created_at AS "createdAt",
        b.expires_at AS "expiresAt", b.revoked_at AS "revokedAt", b.revoked_by AS "revokedBy",
        (b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now())) AS active
      FROM bans b
      WHERE (b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > now()))
        OR COALESCE(b.revoked_at, b.expires_at) > now() - interval '30 days'
      ORDER BY active DESC, b.created_at DESC
      LIMIT 500
    `);
      res.json({ bans: result.rows });
    }),
  );

  router.post(
    "/admin/bans",
    asyncHandler(async (req, res) => {
      const config = await requireAdmin(req);
      const targetType = req.body?.targetType;
      if (!(BAN_TARGETS as readonly string[]).includes(targetType))
        throw new HttpError(400, "Escolha o que bloquear.");
      const targetValue = await normalizeBanTarget(targetType, req.body?.targetValue);
      const reasonCode = req.body?.reasonCode;
      if (!ADMIN_BAN_REASONS.includes(reasonCode)) throw new HttpError(400, "Escolha o motivo do bloqueio.");
      const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 500) : "";
      const hours = req.body?.durationHours;
      if (hours !== null && (!Number.isInteger(hours) || hours < 1 || hours > MAX_BAN_HOURS))
        throw new HttpError(400, "Prazo inválido.");
      const id = randomUUID();
      await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO bans (id, target_type, target_value, scope, reason_code, notes, created_by, expires_at)
           VALUES ($1, $2, $3, 'block_all', $4, $5, $6, CASE WHEN $7::int IS NULL THEN NULL ELSE now() + make_interval(hours => $7::int) END)`,
          [id, targetType, targetValue, reasonCode, notes || null, config.login, hours],
        );
        // Quem já estava dentro sai na hora. Bloqueio de IP pega as sessões na próxima requisição.
        if (targetType === "user") await client.query("DELETE FROM sessions WHERE user_id = $1", [targetValue]);
        if (targetType === "device") await client.query("DELETE FROM sessions WHERE device_id = $1", [targetValue]);
      });
      clearBanCache();
      res.status(201).json({ id });
    }),
  );

  router.post(
    "/admin/bans/:id/revoke",
    asyncHandler(async (req, res) => {
      const config = await requireAdmin(req);
      const id = String(req.params.id);
      if (!UUID.test(id)) throw new HttpError(404, "Bloqueio não encontrado.");
      const result = await getPool().query(
        "UPDATE bans SET revoked_at = now(), revoked_by = $2 WHERE id = $1 AND revoked_at IS NULL RETURNING id",
        [id, config.login],
      );
      if (!result.rowCount) throw new HttpError(404, "Bloqueio não encontrado ou já revogado.");
      clearBanCache();
      res.status(204).end();
    }),
  );
}
