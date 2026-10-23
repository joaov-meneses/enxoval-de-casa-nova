import express, { type Request, type Router } from "express";
import { getPool } from "./database.ts";
import { asyncHandler, HttpError, rateLimit } from "./security.ts";
import { processImage } from "./services/imageProcessing.ts";
import { MAX_IMAGE_UPLOAD_BYTES } from "../src/imageUploadLimits.ts";
import type { AuthUser } from "../src/types.ts";
import { MARKETING_CONSENT_VERSION } from "./acquisition.ts";

async function profileOf(userId: string) {
  const result = await getPool().query<{
    id: string;
    name: string;
    email: string;
    avatar_version: string | null;
    created_at: Date;
  }>(
    "SELECT id, name, email, avatar_version, created_at FROM users WHERE id = $1",
    [userId],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(401, "Faça login para continuar.");
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_version
      ? `/api/profile/avatar?v=${row.avatar_version}`
      : null,
    createdAt: row.created_at.toISOString(),
  };
}

async function marketingOf(userId: string) {
  const row = (
    await getPool().query<{ marketing_consent_at: Date | null; marketing_unsubscribed_at: Date | null }>(
      "SELECT marketing_consent_at, marketing_unsubscribed_at FROM users WHERE id = $1",
      [userId],
    )
  ).rows[0];
  return { subscribed: Boolean(row?.marketing_consent_at) && !row?.marketing_unsubscribed_at };
}

export function registerProfileRoutes(
  router: Router,
  requireUser: (req: Request) => Promise<AuthUser>,
) {
  router.get(
    "/profile",
    asyncHandler(async (req, res) => {
      const user = await requireUser(req);
      res.json(await profileOf(user.id));
    }),
  );
  router.patch(
    "/profile",
    asyncHandler(async (req, res) => {
      const user = await requireUser(req);
      const name =
        typeof req.body?.name === "string"
          ? req.body.name.trim().replace(/\s+/g, " ")
          : "";
      if (name.length < 2 || name.length > 80)
        throw new HttpError(400, "Seu nome deve ter de 2 a 80 caracteres.");
      await getPool().query(
        "UPDATE users SET name = $2, updated_at = now() WHERE id = $1",
        [user.id, name],
      );
      res.json(await profileOf(user.id));
    }),
  );
  // Aviso antes de a garantia de um item vencer (Fase 11.4): ligado por padrão, desliga no perfil.
  router.get(
    "/profile/warranty-reminders",
    asyncHandler(async (req, res) => {
      const user = await requireUser(req);
      const row = (await getPool().query<{ warranty_reminders: boolean }>("SELECT warranty_reminders FROM users WHERE id = $1", [user.id])).rows[0];
      res.json({ enabled: row?.warranty_reminders ?? true });
    }),
  );
  router.put(
    "/profile/warranty-reminders",
    asyncHandler(async (req, res) => {
      const user = await requireUser(req);
      if (typeof req.body?.enabled !== "boolean") throw new HttpError(400, "Preferência inválida.");
      await getPool().query("UPDATE users SET warranty_reminders = $2, updated_at = now() WHERE id = $1", [user.id, req.body.enabled]);
      res.json({ enabled: req.body.enabled });
    }),
  );
  // E-mails de lembretes e dicas: quem já tinha conta antes da caixa do cadastro liga ou desliga por aqui.
  router.get(
    "/profile/marketing",
    asyncHandler(async (req, res) => {
      const user = await requireUser(req);
      res.json(await marketingOf(user.id));
    }),
  );
  router.patch(
    "/profile/marketing",
    asyncHandler(async (req, res) => {
      const user = await requireUser(req);
      if (typeof req.body?.subscribed !== "boolean")
        throw new HttpError(400, "Informe se você quer receber os e-mails.");
      if (req.body.subscribed) {
        await getPool().query(
          `UPDATE users SET marketing_consent_at = now(), marketing_consent_source = 'perfil',
             marketing_consent_version = $2, marketing_unsubscribed_at = NULL, marketing_paused_until = NULL
           WHERE id = $1`,
          [user.id, MARKETING_CONSENT_VERSION],
        );
      } else {
        await getPool().query(
          "UPDATE users SET marketing_unsubscribed_at = COALESCE(marketing_unsubscribed_at, now()) WHERE id = $1",
          [user.id],
        );
      }
      res.json(await marketingOf(user.id));
    }),
  );
  router.post(
    "/profile/avatar",
    rateLimit(20, 600000),
    express.raw({ type: "image/*", limit: MAX_IMAGE_UPLOAD_BYTES }),
    asyncHandler(async (req, res) => {
      const user = await requireUser(req);
      if (!Buffer.isBuffer(req.body))
        throw new HttpError(
          415,
          "Envie uma imagem JPG, PNG, WebP, GIF ou AVIF.",
        );
      const image = await processImage(req.body);
      await getPool().query(
        "UPDATE users SET avatar_data = $2, avatar_version = $3, updated_at = now() WHERE id = $1",
        [user.id, image.data, image.sha256],
      );
      res.json(await profileOf(user.id));
    }),
  );
  router.delete(
    "/profile/avatar",
    asyncHandler(async (req, res) => {
      const user = await requireUser(req);
      await getPool().query(
        "UPDATE users SET avatar_data = NULL, avatar_version = NULL, updated_at = now() WHERE id = $1",
        [user.id],
      );
      res.json(await profileOf(user.id));
    }),
  );
  router.get(
    "/profile/avatar",
    asyncHandler(async (req, res) => {
      const user = await requireUser(req);
      const row = (
        await getPool().query<{ avatar_data: Buffer | null }>(
          "SELECT avatar_data FROM users WHERE id = $1",
          [user.id],
        )
      ).rows[0];
      if (!row?.avatar_data) throw new HttpError(404, "Foto não encontrada.");
      res.set({
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.send(row.avatar_data);
    }),
  );
}
