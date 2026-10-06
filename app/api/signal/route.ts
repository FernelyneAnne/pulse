import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, isSessionId } from "@/lib/auth";
import { error, json, readJson, safe } from "@/lib/http";
import type { SignalType } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: SignalType[] = [
  "request",
  "accept",
  "decline",
  "offer",
  "answer",
  "ice",
  "end",
];

// Per-type payload limits. Control messages carry no payload at all.
const PAYLOAD_LIMIT: Partial<Record<SignalType, number>> = {
  offer: 32 * 1024,
  answer: 32 * 1024,
  ice: 2 * 1024,
};

const REQUEST_COOLDOWN_MS = 3_000; // one connection request per 3 s per user
const MAILBOX_CAP = 150; // max undelivered signals per recipient

// POST /api/signal — body { id, token, toId, type, payload? }
// The sender is whoever the token proves them to be (no client-supplied
// fromId). The server enforces the connection state machine:
//   request → accept/decline → offer/answer/ice → end
// so a stranger can only signal someone they are actually paired with.
export const POST = safe(async (request: NextRequest) => {
  const body = await readJson(request);
  if (!body) return error("invalid body", 400);

  const me = await authenticate(body.id, body.token);
  if (!me) return error("unauthorized", 401);

  const { toId, type, payload } = body;
  if (!isSessionId(toId) || toId === me.id) return error("invalid target", 400);
  if (typeof type !== "string" || !VALID_TYPES.includes(type as SignalType)) {
    return error("invalid type", 400);
  }
  const signalType = type as SignalType;

  // Payload validation.
  const limit = PAYLOAD_LIMIT[signalType];
  let payloadStr: string | null = null;
  if (limit) {
    if (typeof payload !== "string" || payload.length > limit) {
      return error("invalid payload", 400);
    }
    try {
      const parsed = JSON.parse(payload);
      if (!parsed || typeof parsed !== "object") throw new Error();
    } catch {
      return error("invalid payload", 400);
    }
    payloadStr = payload;
  } else if (payload !== undefined && payload !== null) {
    return error("unexpected payload", 400);
  }

  const backlog = await prisma.signal.count({ where: { toId } });
  if (backlog >= MAILBOX_CAP) return error("recipient mailbox full", 429);

  const target = await prisma.presence.findUnique({
    where: { id: toId },
    select: { id: true, busy: true, peerId: true, pendingTo: true },
  });

  const deliver = async () => {
    await prisma.signal.create({
      data: { fromId: me.id, toId, type: signalType, payload: payloadStr },
    });
    return json({ ok: true });
  };

  switch (signalType) {
    case "request": {
      if (me.peerId) return error("already connected", 409);
      if (me.pendingTo) return error("request already pending", 409);
      if (
        me.lastRequestAt &&
        Date.now() - me.lastRequestAt.getTime() < REQUEST_COOLDOWN_MS
      ) {
        return error("slow down", 429);
      }
      await prisma.presence.update({
        where: { id: me.id },
        data: { lastRequestAt: new Date() },
      });
      // Target offline, in a call, or already ringing someone → auto-decline.
      if (!target || target.peerId || target.pendingTo) {
        await prisma.signal.create({
          data: { fromId: toId, toId: me.id, type: "decline", payload: null },
        });
        return json({ ok: true, autoDeclined: true });
      }
      await prisma.presence.update({
        where: { id: me.id },
        data: { pendingTo: toId },
      });
      return deliver();
    }

    case "accept": {
      // Only valid if the target really requested me and both are free.
      if (me.peerId) return error("already connected", 409);
      const claimed = await prisma.presence.updateMany({
        where: { id: toId, pendingTo: me.id, peerId: null },
        data: { pendingTo: null, peerId: me.id, busy: true },
      });
      if (claimed.count !== 1) return error("no pending request", 409);
      const mine = await prisma.presence.updateMany({
        where: { id: me.id, peerId: null },
        data: { peerId: toId, busy: true, pendingTo: null },
      });
      if (mine.count !== 1) {
        await prisma.presence.updateMany({
          where: { id: toId, peerId: me.id },
          data: { peerId: null, busy: false },
        });
        return error("already connected", 409);
      }
      return deliver();
    }

    case "decline": {
      const cleared = await prisma.presence.updateMany({
        where: { id: toId, pendingTo: me.id },
        data: { pendingTo: null },
      });
      if (cleared.count !== 1) return error("no pending request", 409);
      return deliver();
    }

    case "end": {
      if (me.peerId === toId) {
        await prisma.presence.updateMany({
          where: {
            OR: [
              { id: me.id, peerId: toId },
              { id: toId, peerId: me.id },
            ],
          },
          data: { peerId: null, busy: false },
        });
        return deliver();
      }
      if (me.pendingTo === toId) {
        // Initiator cancelled (or timed out) before an answer.
        await prisma.presence.update({
          where: { id: me.id },
          data: { pendingTo: null },
        });
        return deliver();
      }
      return error("not connected", 409);
    }

    case "offer":
    case "answer":
    case "ice": {
      if (me.peerId !== toId || target?.peerId !== me.id) {
        return error("not connected", 403);
      }
      return deliver();
    }
  }
});
