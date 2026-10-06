// Server-only helpers for ending sessions cleanly.
import { prisma } from "@/lib/prisma";

type NewSignal = { fromId: string; toId: string; type: string; payload: null };

// Remove sessions (explicit leave or stale reaping) and make sure nobody is
// left hanging:
//  - their chat partner gets "end" and is freed
//  - anyone they had sent a request to gets "end" (closes the prompt)
//  - anyone who had requested them gets "decline"
export async function removeSessions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const leaving = await prisma.presence.findMany({
    where: { id: { in: ids } },
    select: { id: true, pendingTo: true },
  });
  const partners = await prisma.presence.findMany({
    where: { peerId: { in: ids }, id: { notIn: ids } },
    select: { id: true, peerId: true },
  });
  const initiators = await prisma.presence.findMany({
    where: { pendingTo: { in: ids }, id: { notIn: ids } },
    select: { id: true, pendingTo: true },
  });

  const notify: NewSignal[] = [
    ...partners.map((p) => ({
      fromId: p.peerId as string,
      toId: p.id,
      type: "end",
      payload: null,
    })),
    ...initiators.map((p) => ({
      fromId: p.pendingTo as string,
      toId: p.id,
      type: "decline",
      payload: null,
    })),
    ...leaving
      .filter((l) => l.pendingTo && !ids.includes(l.pendingTo))
      .map((l) => ({
        fromId: l.id,
        toId: l.pendingTo as string,
        type: "end",
        payload: null,
      })),
  ];

  if (partners.length > 0) {
    await prisma.presence.updateMany({
      where: { id: { in: partners.map((p) => p.id) } },
      data: { peerId: null, busy: false },
    });
  }
  if (initiators.length > 0) {
    await prisma.presence.updateMany({
      where: { id: { in: initiators.map((p) => p.id) } },
      data: { pendingTo: null },
    });
  }

  await prisma.signal.deleteMany({
    where: { OR: [{ toId: { in: ids } }, { fromId: { in: ids } }] },
  });
  await prisma.presence.deleteMany({ where: { id: { in: ids } } });

  if (notify.length > 0) {
    await prisma.signal.createMany({ data: notify });
  }
}
