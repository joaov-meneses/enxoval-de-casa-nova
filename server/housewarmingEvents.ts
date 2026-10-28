import type { PoolClient } from 'pg';
import type { Request, Response } from 'express';
import { getPool } from './database.ts';
import { HttpError } from './security.ts';

// One PostgreSQL LISTEN connection per process, shared by every guest and household stream.
const watchers = new Map<string, Set<() => void>>();
const streamsByIp = new Map<string, number>();
let streams = 0;
let connection: { client: PoolClient; stop: () => void } | null = null;
let opening: Promise<void> | null = null;

async function listen() {
  if (connection) return;
  if (opening) return opening;
  opening = (async () => {
    const client = await getPool().connect();
    let stopped = false;
    const notify = (event: { channel: string; payload?: string }) => {
      if (event.channel === 'housewarming_changed' && event.payload) watchers.get(event.payload)?.forEach(refresh => refresh());
    };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      client.removeListener('notification', notify);
      client.removeListener('error', failed);
      // Destroy the dedicated session, so a LISTEN never returns to the normal query pool.
      client.release(true);
      if (connection?.client === client) connection = null;
    };
    const failed = () => { stop(); watchers.forEach(listeners => listeners.forEach(refresh => refresh())); };
    client.on('notification', notify);
    client.on('error', failed);
    connection = { client, stop };
    try { await client.query('LISTEN housewarming_changed'); } catch (error) { stop(); throw error; }
  })().finally(() => { opening = null; });
  return opening;
}

/** Events contain no guest or workspace data. Clients refetch through the normal permission checks. */
export async function streamHousewarming(req: Request, res: Response, enxovalId: string) {
  await listen();
  if (req.destroyed || res.destroyed) { if (!watchers.size) connection?.stop(); return; }
  const ip = req.ip ?? 'unknown';
  if ((streamsByIp.get(ip) ?? 0) >= 16 || streams >= 2000) {
    res.set('Retry-After', '15');
    throw new HttpError(429, 'Muitas conexões abertas. A lista continua atualizando periodicamente.');
  }
  streamsByIp.set(ip, (streamsByIp.get(ip) ?? 0) + 1);
  streams++;
  const refresh = () => res.write('event: refresh\ndata: {}\n\n');
  let listeners = watchers.get(enxovalId);
  if (!listeners) { listeners = new Set(); watchers.set(enxovalId, listeners); }
  listeners.add(refresh);
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', 'X-Robots-Tag': 'noindex, nofollow' });
  res.flushHeaders();
  refresh();
  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
    // A lost notification connection is repaired here; the client also has periodic HTTP refresh.
    void listen().catch(() => undefined);
  }, 25_000);
  // Reconnect periodically through the publication, subscription and session checks.
  const expiry = setTimeout(() => res.end(), 10 * 60_000);
  req.once('close', () => {
    clearInterval(heartbeat); clearTimeout(expiry);
    const remaining = (streamsByIp.get(ip) ?? 1) - 1;
    if (remaining) streamsByIp.set(ip, remaining); else streamsByIp.delete(ip);
    streams--;
    listeners.delete(refresh);
    if (!listeners.size) watchers.delete(enxovalId);
    if (!watchers.size) connection?.stop();
  });
}
