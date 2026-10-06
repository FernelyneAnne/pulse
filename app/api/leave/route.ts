import type { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth";
import { removeSessions } from "@/lib/session";
import { error, json, readJson, safe } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id, token }. Sent via navigator.sendBeacon on tab
// close (body arrives as text/plain). Only the session owner can remove it.
// The partner (if any) is notified server-side, so a closed tab always ends
// the chat for both users.
export const POST = safe(async (request: NextRequest) => {
  const body = await readJson(request, 1024);
  if (!body) return error("invalid body", 400);

  const me = await authenticate(body.id, body.token);
  if (!me) return error("unauthorized", 401);

  await removeSessions([me.id]);
  return json({ ok: true });
});
