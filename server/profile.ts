import express, { type Request, type Router } from "express";
import { getPool } from "./database.ts";
import { asyncHandler, HttpError, rateLimit } from "./security.ts";
import { processImage } from "./services/imageProcessing.ts";
import { MAX_IMAGE_UPLOAD_BYTES } from "../src/imageUploadLimits.ts";
import type { AuthUser } from "../src/types.ts";

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
