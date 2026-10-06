"use client";

import { useEffect, useRef } from "react";
import type { PeerDot } from "@/lib/types";
import { vibeById } from "@/lib/vibes";
import { NearbyIcon } from "./icons";

export interface NearbyPeer extends PeerDot {
  km: number;
}

export const NEARBY_KM = 3;

// Distances are between privacy-offset positions (each light is 1–3 km from
// the real spot), so they are deliberately rounded and always "about".
function aboutKm(km: number): string {
  if (km < 1) return "under 1 km away";
  return `about ${Math.round(km)} km away`;
}

export default function NearbyPanel({
  people,
  canConnect,
  onConnect,
  onClose,
}: {
  people: NearbyPeer[];
  canConnect: boolean;
  onConnect: (id: string) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const free = people.filter((p) => !p.busy).length;

  return (
    <section
      aria-label="People nearby"
      className="glass absolute inset-x-0 bottom-0 z-30 flex max-h-[70dvh] animate-rise flex-col rounded-t-3xl shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-4 sm:top-20 sm:max-h-[calc(100dvh-7rem)] sm:w-[360px] sm:animate-slide-in sm:rounded-3xl"
    >
      <header className="flex items-start gap-3 border-b border-moon/10 px-5 py-4">
        <NearbyIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
        <div className="min-w-0 flex-1">
          <h2 className="font-bold leading-tight">Nearby, within {NEARBY_KM} km</h2>
          <p className="mt-0.5 text-xs text-moon/55" aria-live="polite">
            {people.length === 0
              ? "No one close by right now"
              : `${people.length} online, ${free} free to talk`}
          </p>
        </div>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close nearby list"
          className="grid h-8 w-8 place-items-center rounded-full text-moon/70 transition hover:bg-moon/10"
        >
          ✕
        </button>
      </header>

      <ul className="flex-1 space-y-2 overflow-y-auto p-3">
        {people.length === 0 && (
          <li className="px-3 py-8 text-center text-sm leading-relaxed text-moon/60">
            Nobody&rsquo;s light is this close yet. People further away are
            still on the globe, so zoom out and tap any light.
          </li>
        )}
        {people.map((p) => {
          const v = vibeById(p.vibe);
          return (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-2xl bg-moon/5 px-3 py-3"
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg"
                style={{ background: `${v.color}2e` }}
                aria-hidden
              >
                {v.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">
                  Stranger, {v.label.toLowerCase()}
                </p>
                <p className="mt-0.5 text-xs text-moon/55">
                  {aboutKm(p.km)}
                  {p.busy ? ", talking now" : ""}
                </p>
              </div>
              <button
                onClick={() => onConnect(p.id)}
                disabled={p.busy || !canConnect}
                className="shrink-0 rounded-full bg-amber px-4 py-2 text-sm font-bold text-ink transition hover:brightness-110 active:scale-95 disabled:opacity-35"
              >
                Connect
              </button>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-moon/10 px-5 py-3 text-xs leading-relaxed text-moon/50">
        Everyone stays anonymous. Distances are approximate because every
        light is placed 1–3 km from its real spot.
      </p>
    </section>
  );
}
