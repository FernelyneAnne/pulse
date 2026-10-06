"use client";

import { useEffect, useRef, useState } from "react";
import type { NearbyPeer } from "./NearbyPanel";
import { vibeById } from "@/lib/vibes";
import { CloseIcon, HeartWaveIcon, UndoIcon } from "./icons";

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
}: {
  hidden?: boolean;
  people: NearbyPeer[];
  canConnect: boolean;
  onConnect: (id: string) => void;
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
  const hiddenRef = useRef(hidden);
  useEffect(() => {
    hiddenRef.current = hidden;
    decideRef.current = decide;
    undoRef.current = undo;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (hiddenRef.current) return;
      if (e.key === "ArrowRight") decideRef.current("right");
      else if (e.key === "ArrowLeft") decideRef.current("left");
      else if (e.key === "Backspace") undoRef.current();
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
      className={`absolute inset-0 z-30 ${hidden ? "hidden" : "flex"} flex-col items-center bg-night/60 px-4 pb-[calc(6.25rem+env(safe-area-inset-bottom))] pt-[calc(5.5rem+env(safe-area-inset-top))] backdrop-blur-md`}
    >
      <div className="relative w-full max-w-sm flex-1 sm:max-h-[580px]">
        {!top && (
          <div className="glass grid h-full place-items-center rounded-[1.75rem] p-8 text-center">
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
                  className="bg-brand shadow-brand mt-6 rounded-full px-6 py-3 font-extrabold text-white"
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

      <div className="mt-5 flex items-center gap-4">
        <RoundButton
          label="Bring back last skipped"
          size="sm"
          onClick={undo}
          disabled={skipped.length === 0}
          tone="#ffb238"
        >
          <UndoIcon className="h-5 w-5" />
        </RoundButton>
        <RoundButton
          label="Skip"
          size="lg"
          onClick={() => decide("left")}
          disabled={!top}
          tone="#ff5a6e"
        >
          <CloseIcon className="h-8 w-8" />
        </RoundButton>
        <RoundButton
          label="Say hello"
          size="lg"
          onClick={() => decide("right")}
          disabled={!top || !canConnect}
          primary
        >
          <HeartWaveIcon className="h-8 w-8" />
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
      className={`absolute inset-0 select-none overflow-hidden rounded-[1.75rem] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/10 ${
        muted ? "brightness-75" : ""
      }`}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(110% 75% at 50% 18%, ${v.color} 0%, color-mix(in oklab, ${v.color} 40%, #1a1440) 48%, #0c0f26 100%)`,
        }}
      />
      {/* soft light blobs for depth */}
      <div
        className="absolute -left-16 top-10 h-56 w-56 rounded-full opacity-40 blur-3xl"
        style={{ background: v.color }}
        aria-hidden
      />
      <div className="absolute inset-0 grid place-items-center pb-28">
        <span
          className="grid h-44 w-44 place-items-center rounded-full bg-white/12 text-[6.5rem] ring-1 ring-white/25 backdrop-blur-sm"
          aria-hidden
        >
          {v.emoji}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-6 pt-24 text-white">
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1.5 rounded-full bg-[#2fd27a]/20 px-2.5 py-1 text-[#6dffae]">
            <span className="h-2 w-2 rounded-full bg-[#2fd27a] shadow-[0_0_8px_2px_rgba(47,210,122,0.7)]" />
            Online now
          </span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">{distanceLabel(person.km)}</span>
        </div>
        <p className="mt-3 text-[2.1rem] font-extrabold leading-none tracking-tight">A stranger</p>
        <p className="mt-2 flex items-center gap-2 text-lg font-semibold">
          <span aria-hidden>{v.emoji}</span>
          <span>Up for {v.label.toLowerCase()}</span>
        </p>
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
  tone,
  primary,
  children,
}: {
  label: string;
  size: "sm" | "lg";
  onClick: () => void;
  disabled?: boolean;
  tone?: string;
  primary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={
        primary
          ? undefined
          : { color: tone, boxShadow: `0 10px 30px -12px ${tone}, inset 0 0 0 2px ${tone}55` }
      }
      className={`grid place-items-center rounded-full transition hover:scale-110 active:scale-90 disabled:opacity-30 disabled:hover:scale-100 ${
        primary ? "bg-brand shadow-brand text-white" : "glass"
      } ${size === "lg" ? "h-[74px] w-[74px]" : "h-[52px] w-[52px]"}`}
    >
      {children}
    </button>
  );
}
