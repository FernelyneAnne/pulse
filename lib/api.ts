// Client-side helpers for talking to the coordination API.
// The session credentials (public id + secret token) are minted by the server
// at join and kept only in memory for this tab — never in storage or URLs.
import type { PollResponse, SignalType } from "@/lib/types";

export class AuthError extends Error {}

interface Session {
  id: string;
  token: string;
}

let session: Session | null = null;

export function sessionId(): string | null {
  return session?.id ?? null;
}

export interface JoinResult {
  id: string;
  lat: number; // privacy-offset position others see
  lng: number;
}

export async function join(lat: number, lng: number): Promise<JoinResult> {
  const res = await fetch("/api/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) throw new Error(`join failed: ${res.status}`);
  const data = (await res.json()) as JoinResult & { token: string };
  session = { id: data.id, token: data.token };
  return { id: data.id, lat: data.lat, lng: data.lng };
}

export async function poll(): Promise<PollResponse> {
  if (!session) throw new AuthError("no session");
  const res = await fetch("/api/poll", {
    cache: "no-store",
    headers: { "x-pulse-id": session.id, "x-pulse-token": session.token },
  });
  if (res.status === 401) throw new AuthError("session expired");
  if (!res.ok) throw new Error(`poll failed: ${res.status}`);
  return res.json();
}

export async function sendSignal(
  toId: string,
  type: SignalType,
  payload?: string,
): Promise<boolean> {
  if (!session) return false;
  try {
    const res = await fetch("/api/signal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...session, toId, type, payload }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Fire-and-forget leave that survives the tab closing. The server notifies
// our partner (if any), so the chat ends for both sides.
export function leave(): void {
  if (!session) return;
  const body = JSON.stringify(session);
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon("/api/leave", body);
  } else {
    void fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  }
}
