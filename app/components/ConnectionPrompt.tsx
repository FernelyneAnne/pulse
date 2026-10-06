"use client";

import { useEffect, useRef } from "react";

// A non-blocking card that rises from the bottom: incoming connection and
// incoming video requests. Optional countdown ring shows how long is left.
export default function ConnectionPrompt({
  title,
  subtitle,
  acceptLabel,
  declineLabel,
  onAccept,
  onDecline,
  timeoutMs,
  badge,
}: {
  title: string;
  subtitle?: string;
  acceptLabel: string;
  declineLabel: string;
  onAccept: () => void;
  onDecline: () => void;
  timeoutMs?: number;
  badge?: React.ReactNode;
}) {
  const acceptRef = useRef<HTMLButtonElement>(null);
  const onDeclineRef = useRef(onDecline);
  useEffect(() => {
    onDeclineRef.current = onDecline;
  });

  // Focus the primary action once, and let Esc decline.
  useEffect(() => {
    acceptRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDeclineRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const R = 22;
  const len = 2 * Math.PI * R;

  return (
    <div
      role="alertdialog"
      aria-label={title}
      className="absolute inset-x-0 bottom-0 z-40 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="glass w-full max-w-sm animate-rise rounded-3xl p-5 shadow-2xl">
        <div className="flex items-center gap-4">
          <div className="relative grid h-14 w-14 shrink-0 place-items-center">
            {timeoutMs ? (
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r={R} fill="none" stroke="rgba(236,238,251,0.12)" strokeWidth="3" />
                <circle
                  cx="28"
                  cy="28"
                  r={R}
                  fill="none"
                  stroke="var(--amber)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={len}
                  style={
                    {
                      "--len": len,
                      animation: `countdown ${timeoutMs}ms linear forwards`,
                    } as React.CSSProperties
                  }
                />
              </svg>
            ) : null}
            <span className="text-2xl" aria-hidden>
              {badge ?? (
                <span className="block h-3 w-3 animate-breathe rounded-full bg-amber shadow-[0_0_16px_4px_rgba(255,178,56,0.6)]" />
              )}
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-moon/65">{subtitle}</p>}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            onClick={onDecline}
            className="rounded-2xl border border-moon/15 px-4 py-3 font-semibold text-moon/80 transition hover:bg-moon/5"
          >
            {declineLabel}
          </button>
          <button
            ref={acceptRef}
            onClick={onAccept}
            className="rounded-2xl bg-amber px-4 py-3 font-bold text-ink transition hover:brightness-110 active:scale-[0.98]"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
