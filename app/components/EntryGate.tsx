"use client";

import { useState } from "react";
import { DEFAULT_VIBE, VIBES } from "@/lib/vibes";

// Floats over the slowly turning globe. One job: get location, then enter.
export default function EntryGate({
  onReady,
}: {
  onReady: (lat: number, lng: number, vibe: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<"idle" | "locating" | "error">("idle");
  const [error, setError] = useState("");
  const [vibe, setVibe] = useState(DEFAULT_VIBE);

  function enter() {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("This browser can't share a location, so Pulse can't place you.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onReady(pos.coords.latitude, pos.coords.longitude, vibe).catch(() => {
          setStatus("error");
          setError("Couldn't reach Pulse. Check your connection and try again.");
        });
      },
      (err) => {
        setStatus("error");
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location is blocked. Allow it in your browser's site settings, then try again."
            : "Couldn't find your location. Try again in a moment.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-end overflow-y-auto justify-center bg-gradient-to-t from-night via-night/40 to-transparent p-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:items-center sm:bg-none">
      <div className="pointer-events-auto w-full max-w-md animate-rise">
        <h1 className="text-[clamp(3.5rem,12vw,6.5rem)] font-extrabold leading-[0.85] tracking-[-0.05em] text-moon">
          pulse
          <span className="ml-2 inline-block h-3.5 w-3.5 animate-breathe rounded-full bg-amber align-middle shadow-[0_0_24px_6px_rgba(255,178,56,0.6)]" />
        </h1>
        <p className="mt-5 max-w-sm text-lg leading-snug text-moon/80">
          Everyone awake right now is a light on this globe. Tap one and say
          hello. No names, no history.
        </p>

        <fieldset className="mt-7">
          <legend className="text-sm font-semibold text-moon/70">
            What are you up for?
          </legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {VIBES.map((v) => {
              const on = v.id === vibe;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVibe(v.id)}
                  aria-pressed={on}
                  className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                    on
                      ? "border-transparent text-night"
                      : "border-moon/15 bg-night/40 text-moon/85 hover:border-moon/35"
                  }`}
                  style={on ? { background: v.color } : undefined}
                >
                  <span aria-hidden>{v.emoji}</span>
                  {v.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <button
          onClick={enter}
          disabled={status === "locating"}
          className="mt-7 w-full rounded-2xl bg-amber px-6 py-4 text-lg font-bold text-night shadow-[0_10px_40px_-10px_rgba(255,178,56,0.8)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-70 sm:w-auto"
        >
          {status === "locating" ? "Finding you…" : "Turn on my light"}
        </button>

        {status === "error" && (
          <p role="alert" className="mt-4 max-w-sm text-sm text-danger">
            {error}
          </p>
        )}

        <p className="mt-6 max-w-sm text-sm leading-relaxed text-moon/55">
          Your light lands 1–3 km from where you are, in a new spot every visit.
          Chat and video go straight between browsers and are never stored.
          Close the tab and you&rsquo;re gone.
        </p>
      </div>
    </div>
  );
}
