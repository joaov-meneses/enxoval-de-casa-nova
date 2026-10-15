import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import type { Request, RequestHandler, Response } from "express";

const scrypt = promisify(scryptCallback);

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [scheme, salt, storedHash] = passwordHash.split(":");
  if (scheme !== "scrypt" || !salt || !storedHash) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(storedHash, "hex");
  return key.length === storedKey.length && timingSafeEqual(key, storedKey);
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getCookie(req: Request, name: string) {
  const match = req.headers.cookie
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`));
  try {
    return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
  } catch {
    return "";
  }
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure:
      process.env.COOKIE_SECURE === "true" ||
      (process.env.NODE_ENV === "production" &&
        process.env.COOKIE_SECURE !== "false"),
    path: "/",
  };
}

// Each process limits sign-in attempts; entries expire rather than growing indefinitely.
export function loginRateLimit(maxAttempts = 15): RequestHandler {
  const attempts = new Map<string, { count: number; expires: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.expires <= now) attempts.delete(key);
    const key = req.ip ?? "unknown";
    const value = attempts.get(key) ?? { count: 0, expires: now + 15 * 60_000 };
    if (value.count >= maxAttempts) {
      res.set("Retry-After", String(Math.ceil((value.expires - now) / 1000)));
      res
        .status(429)
        .json({
          error:
            "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
        });
      return;
    }
    value.count++;
    attempts.set(key, value);
    next();
  };
}

// Limite de chamadas por IP numa janela de tempo (ex.: leitura de links de lojas, que faz acessos a sites externos).
export function rateLimit(
  maxRequests: number,
  windowMs: number,
  message = "Muitas buscas seguidas. Aguarde um instante e tente de novo.",
): RequestHandler {
  const hits = new Map<string, { count: number; expires: number }>();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, value] of hits)
      if (value.expires <= now) hits.delete(key);
    const key = req.ip ?? "unknown";
    const value = hits.get(key) ?? { count: 0, expires: now + windowMs };
    if (value.count >= maxRequests) {
      res.set("Retry-After", String(Math.ceil((value.expires - now) / 1000)));
      res
        .status(429)
        .json({ error: message });
      return;
    }
    value.count++;
    hits.set(key, value);
    next();
  };
}

export const protectMutationOrigin: RequestHandler = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const origin = req.get("origin");
  let foreignOrigin = false;
  try {
    foreignOrigin = Boolean(origin && new URL(origin).host !== req.get("host"));
  } catch {
    foreignOrigin = true;
  }
  if (foreignOrigin || req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Origem da solicitação não permitida." });
    return;
  }
  if (!req.get("content-type")?.toLowerCase().startsWith("application/json")) {
    res.status(415).json({ error: "Envie os dados no formato JSON." });
    return;
  }
  next();
};
