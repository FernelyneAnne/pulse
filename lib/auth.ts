// Server-only session credentials.
//
// Every session gets two values at join:
//   - a PUBLIC id: shown to other users (map dots, signal sender/recipient)
//   - a SECRET token: returned once to the joining client only; the server
//     stores just its sha256 hash.
// Every mutating / mailbox-reading call must present id + token, so knowing a
// stranger's public id (which every client sees) no longer lets you read their
// mailbox, impersonate them, or kick them offline.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Presence } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

export function isSessionId(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newCredentials(): { id: string; token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { id: randomUUID(), token, tokenHash: hashToken(token) };
}

// Returns the caller's presence row if (id, token) match, else null.
export async function authenticate(
  id: unknown,
  token: unknown,
): Promise<Presence | null> {
  if (!isSessionId(id) || typeof token !== "string" || !TOKEN_RE.test(token)) {
    return null;
  }
  const row = await prisma.presence.findUnique({ where: { id } });
  if (!row) return null;
  const a = Buffer.from(row.tokenHash, "hex");
  const b = Buffer.from(hashToken(token), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return row;
}
