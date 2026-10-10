import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
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
import type { AdminUser } from "../src/types.ts";

const ADMIN_COOKIE = "larume_admin_session";
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

async function requireAdmin(req: Request) {
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
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new HttpError(404, "Usuário não encontrado.");
  return id;
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
        (SELECT COUNT(*)::int FROM enxoval_members m WHERE m.user_id = u.id) AS "workspaceCount"
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
}
