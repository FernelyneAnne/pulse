import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import { authenticate } from "@/lib/auth";
import { removeSessions } from "@/lib/session";
import { error, json, safe } from "@/lib/http";
import type { Link, PollResponse, SignalType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/poll — credentials in headers (x-pulse-id / x-pulse-token), never
// in the URL, so tokens don't end up in access logs or browser history.
// It (1) heartbeats the caller, (2) reaps stale presence + orphan signals,
// (3) returns the online peers, and (4) drains ONLY the caller's mailbox.
export const GET = safe(async (request: NextRequest) => {
  const me = await authenticate(
    request.headers.get("x-pulse-id"),
    request.headers.get("x-pulse-token"),
  );
  if (!me) return error("unauthorized", 401);
  const id = me.id;

  const now = Date.now();
  const staleCutoff = new Date(now - STALE_MS);
  const signalCutoff = new Date(now - SIGNAL_TTL_MS);

  // 1) Heartbeat — refresh lastSeen for the caller only.
  await prisma.presence.update({
    where: { id },
    data: { lastSeen: new Date(now) },
  });

  // 2) Reap stale sessions (notifying their partners) and orphan signals.
  const stale = await prisma.presence.findMany({
    where: { lastSeen: { lt: staleCutoff } },
    select: { id: true },
    take: 200,
  });
  await removeSessions(stale.map((s) => s.id));
  await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });

  // 3) Online peers (excluding self) + live conversation arcs. Only public,
  // offset data leaves the server; pairings are returned as coordinates only.
  const online = await prisma.presence.findMany({
    where: { lastSeen: { gte: staleCutoff } },
    select: { id: true, lat: true, lng: true, busy: true, vibe: true, peerId: true },
    take: 2000,
  });
  const byId = new Map<string, (typeof online)[number]>(
    online.map((p) => [p.id, p]),
  );
  const links: Link[] = [];
  for (const p of online) {
    if (!p.peerId || p.id > p.peerId) continue; // each pair once
    const q = byId.get(p.peerId);
    if (q && q.peerId === p.id) links.push([p.lng, p.lat, q.lng, q.lat]);
  }
  const peers = online
    .filter((p) => p.id !== id)
    .map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, busy: p.busy, vibe: p.vibe }));

  // 4) Drain this user's mailbox: read, then delete exactly what we read so a
  // concurrently-inserted signal is never lost.
  const inbox = await prisma.signal.findMany({
    where: { toId: id },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  if (inbox.length > 0) {
    await prisma.signal.deleteMany({
      where: { id: { in: inbox.map((s) => s.id) } },
    });
  }

  const response: PollResponse = {
    peers,
    links,
    signals: inbox.map((s) => ({
      id: s.id,
      fromId: s.fromId,
      toId: s.toId,
      type: s.type as SignalType,
      payload: s.payload,
      createdAt: s.createdAt.toISOString(),
    })),
  };

  return json(response);
});
