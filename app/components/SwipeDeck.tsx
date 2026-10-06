"use client";

import { useEffect, useRef, useState } from "react";
import type { NearbyPeer } from "./NearbyPanel";
import { vibeById } from "@/lib/vibes";
import { SendIcon } from "./icons";

const SWIPE_PX = 110;

function distanceLabel(km: number): string {
  if (km < 1) return "Under 1 km away";
  if (km < 10) return `About ${Math.round(km)} km away`;
  return `About ${Math.round(km).toLocaleString()} km away`;
}

// One stranger per card, nearest first. Swipe right (or →) to knock,
// left (or ←) to skip, Backspace to bring back the last skipped card.
export default function SwipeDeck({
  hidden = false,
  people,
  canConnect,
  onConnect,
  onClose,
}: {
  hidden?: boolean;
  people: NearbyPeer[];
  canConnect: boolean;
  onConnect: (id: string) => void;
  onClose: () => void;
}) {
  const [skipped, setSkipped] = useState<string[]>([]);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<null | "left" | "right">(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const deck = people.filter((p) => !p.busy && !skipped.includes(p.id));
  const top = deck[0];
  const next = deck[1];

  function decide(dir: "left" | "right") {
    if (!top || leaving) return;
    if (dir === "right" && !canConnect) return;
    setLeaving(dir);
    const id = top.id;
    window.setTimeout(() => {
      setLeaving(null);
      setDrag({ x: 0, y: 0, active: false });
      // Either way the card leaves the deck; undo can bring it back.
      setSkipped((s) => [...s, id]);
      if (dir === "right") onConnect(id);
    }, 220);
  }

  function undo() {
    setSkipped((s) => s.slice(0, -1));
  }

  const decideRef = useRef(decide);
  const undoRef = useRef(undo);
  const onCloseRef = useRef(onClose);
  const hiddenRef = useRef(hidden);
  useEffect(() => {
    hiddenRef.current = hidden;
    decideRef.current = decide;
    undoRef.current = undo;
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hiddenRef.current) return;
      if (e.key === "ArrowRight") decideRef.current("right");
      else if (e.key === "ArrowLeft") decideRef.current("left");
      else if (e.key === "Backspace") undoRef.current();
      else if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    if (leaving) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, active: true });
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    setDrag({
      x: e.clientX - start.current.x,
      y: (e.clientY - start.current.y) * 0.4,
      active: true,
    });
  }
  function onPointerUp() {
    if (!start.current) return;
    start.current = null;
    if (drag.x > SWIPE_PX) decide("right");
    else if (drag.x < -SWIPE_PX) decide("left");
    else setDrag({ x: 0, y: 0, active: false });
  }

  const x = leaving === "right" ? 600 : leaving === "left" ? -600 : drag.x;
  const hello = Math.max(0, Math.min(1, x / SWIPE_PX));
  const skip = Math.max(0, Math.min(1, -x / SWIPE_PX));

  return (
    <section
      aria-label="Swipe through strangers"
      aria-hidden={hidden}
      className={`absolute inset-0 z-30 ${hidden ? "hidden" : "flex"} flex-col items-center justify-center bg-night/55 p-4 pt-20 backdrop-blur-sm`}
    >
      <div className="relative w-full max-w-sm flex-1 sm:max-h-[560px] sm:flex-none sm:basis-[560px]">
        {!top && (
          <div className="glass grid h-full place-items-center rounded-[2rem] p-8 text-center">
            <div>
              <p className="text-5xl" aria-hidden>🌙</p>
              <p className="mt-4 text-xl font-bold">You&rsquo;ve seen everyone free right now</p>
              <p className="mt-2 text-sm text-moon/60">
                New lights turn on all the time. Bring back skipped cards, or
                check again in a minute.
              </p>
              {skipped.length > 0 && (
                <button
                  onClick={() => setSkipped([])}
                  className="mt-6 rounded-full bg-amber px-5 py-2.5 font-bold text-ink"
                >
                  Show skipped again
                </button>
              )}
            </div>
          </div>
        )}

        {next && (
          <Card
            key={next.id}
            person={next}
            style={{
              transform: `scale(${0.94 + 0.06 * Math.min(1, Math.abs(x) / SWIPE_PX)}) translateY(14px)`,
              transition: drag.active ? "none" : "transform 0.25s ease",
            }}
            muted
          />
        )}

        {top && (
          <Card
            key={top.id}
            person={top}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              transform: `translate(${x}px, ${drag.y}px) rotate(${x / 18}deg)`,
              transition: drag.active && !leaving ? "none" : "transform 0.22s ease-out",
              cursor: drag.active ? "grabbing" : "grab",
              touchAction: "none",
            }}
          >
            <span
              className="absolute left-6 top-8 -rotate-12 rounded-xl border-4 border-aurora px-3 py-1 text-3xl font-extrabold tracking-tight text-aurora"
              style={{ opacity: hello }}
              aria-hidden
            >
              HELLO
            </span>
            <span
              className="absolute right-6 top-8 rotate-12 rounded-xl border-4 border-danger px-3 py-1 text-3xl font-extrabold tracking-tight text-danger"
              style={{ opacity: skip }}
              aria-hidden
            >
              SKIP
            </span>
          </Card>
        )}
      </div>

      <div className="mt-5 flex items-center gap-5 pb-[env(safe-area-inset-bottom)]">
        <RoundButton
          label="Bring back last skipped"
          size="sm"
          onClick={undo}
          disabled={skipped.length === 0}
          className="text-amber"
        >
          ↺
        </RoundButton>
        <RoundButton
          label="Skip"
          size="lg"
          onClick={() => decide("left")}
          disabled={!top}
          className="text-danger"
        >
          ✕
        </RoundButton>
        <RoundButton
          label="Say hello"
          size="lg"
          onClick={() => decide("right")}
          disabled={!top || !canConnect}
          className="text-aurora"
        >
          <SendIcon className="h-7 w-7" />
        </RoundButton>
        <RoundButton label="Close swipe view" size="sm" onClick={onClose} className="text-moon/70">
          ⌄
        </RoundButton>
      </div>
      <p className="mt-3 hidden text-xs text-moon/50 sm:block">
        Swipe or use ← → keys. Backspace brings a card back.
      </p>
    </section>
  );
}

function Card({
  person,
  style,
  muted,
  children,
  ...handlers
}: {
  person: NearbyPeer;
  style: React.CSSProperties;
  muted?: boolean;
  children?: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const v = vibeById(person.vibe);
  return (
    <div
      {...handlers}
      style={style}
      className={`absolute inset-0 select-none overflow-hidden rounded-[2rem] shadow-2xl ${
        muted ? "opacity-70" : ""
      }`}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 80% at 30% 15%, ${v.color} 0%, color-mix(in oklab, ${v.color} 45%, #14183a) 45%, #14183a 100%)`,
        }}
      />
      <div className="absolute inset-0 grid place-items-center pb-24">
        <span className="text-[7.5rem] drop-shadow-[0_10px_30px_rgba(0,0,0,0.35)]" aria-hidden>
          {v.emoji}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0c0f26] via-[#0c0f26]/80 to-transparent p-6 pt-20 text-white">
        <p className="text-3xl font-extrabold leading-none tracking-tight">A stranger</p>
        <p className="mt-2 text-lg font-semibold" style={{ color: v.color }}>
          {v.label}
        </p>
        <p className="mt-1 text-sm text-white/70">{distanceLabel(person.km)}</p>
      </div>
      {children}
    </div>
  );
}

function RoundButton({
  label,
  size,
  onClick,
  disabled,
  className = "",
  children,
}: {
  label: string;
  size: "sm" | "lg";
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`glass grid place-items-center rounded-full font-bold shadow-xl transition hover:scale-110 active:scale-95 disabled:opacity-30 disabled:hover:scale-100 ${
        size === "lg" ? "h-[72px] w-[72px] text-3xl" : "h-12 w-12 text-xl"
      } ${className}`}
    >
      {children}
    </button>
  );
}
