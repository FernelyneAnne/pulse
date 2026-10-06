import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPrivacyOffset, isValidLatLng } from "@/lib/geo";
import { newCredentials } from "@/lib/auth";
import { error, json, readJson, safe } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/join — body { lat, lng } (raw coords).
// The SERVER mints the session: a public id + a secret token (returned once,
// stored only as a hash). Applies a 1–3 km privacy offset; raw coordinates
// are never stored.
export const POST = safe(async (request: NextRequest) => {
  const body = await readJson(request, 1024);
  if (!body) return error("invalid body", 400);

  const { lat, lng } = body;
  if (!isValidLatLng(lat, lng)) return error("invalid coordinates", 400);

  const offset = applyPrivacyOffset(lat as number, lng as number);
  const { id, token, tokenHash } = newCredentials();

  await prisma.presence.create({
    data: {
      id,
      tokenHash,
      lat: offset.lat,
      lng: offset.lng,
      busy: false,
      lastSeen: new Date(),
    },
  });

  return json({ id, token, lat: offset.lat, lng: offset.lng });
});
