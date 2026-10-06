// Small server-side response helpers.
export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function error(message: string, status: number): Response {
  return json({ error: message }, status);
}

// Wrap a handler so unexpected failures (DB down, etc.) never leak stack
// traces or internals to the client.
export function safe<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error("[pulse] api error", err);
      return error("internal error", 500);
    }
  };
}

// Reads a JSON object body (also works for sendBeacon's text/plain bodies).
export async function readJson(
  request: Request,
  maxBytes = 70 * 1024,
): Promise<Record<string, unknown> | null> {
  const len = Number(request.headers.get("content-length") ?? "0");
  if (len > maxBytes) return null;
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
