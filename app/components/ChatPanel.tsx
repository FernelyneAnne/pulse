"use client";

import { useEffect, useRef, useState } from "react";
import { PhoneOffIcon, SendIcon, VideoIcon } from "./icons";

export interface ChatMessage {
  id: number;
  mine: boolean;
  text: string;
  kind?: "text" | "system";
}

const MAX_LEN = 1000;

export default function ChatPanel({
  messages,
  connected,
  videoBusy,
  onSend,
  onStartVideo,
  onEnd,
  headerExtra,
  toolbar,
}: {
  messages: ChatMessage[];
  connected: boolean;
  videoBusy: boolean;
  onSend: (text: string) => void;
  onStartVideo: () => void;
  onEnd: () => void;
  headerExtra?: React.ReactNode;
  toolbar?: React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (connected) inputRef.current?.focus();
  }, [connected]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim().slice(0, MAX_LEN);
    if (!text || !connected) return;
    onSend(text);
    setDraft("");
  }

  return (
    <section
      aria-label="Chat with stranger"
      className="glass absolute inset-x-0 bottom-0 z-30 flex h-[72dvh] animate-rise flex-col rounded-t-3xl shadow-2xl sm:inset-x-auto sm:inset-y-4 sm:right-4 sm:h-auto sm:w-[400px] sm:animate-slide-in sm:rounded-3xl"
    >
      <header className="flex items-center gap-3 border-b border-moon/10 px-5 py-4">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            connected
              ? "bg-aurora shadow-[0_0_12px_2px_rgba(98,227,200,0.7)]"
              : "animate-breathe bg-amber"
          }`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold leading-tight">A stranger</p>
          <p className="text-xs text-moon/55" aria-live="polite">
            {connected ? "Connected directly, nothing is stored" : "Opening a direct line…"}
          </p>
        </div>
        {headerExtra}
        <button
          onClick={onStartVideo}
          disabled={!connected || videoBusy}
          aria-label="Ask to start video"
          title="Ask to start video"
          className="grid h-10 w-10 place-items-center rounded-full border border-moon/15 transition hover:bg-moon/10 disabled:opacity-35"
        >
          <VideoIcon />
        </button>
        <button
          onClick={onEnd}
          aria-label="Leave chat"
          title="Leave chat"
          className="grid h-10 w-10 place-items-center rounded-full bg-danger text-night transition hover:brightness-110"
        >
          <PhoneOffIcon />
        </button>
      </header>

      <div className="flex-1 space-y-1.5 overflow-y-auto px-4 py-5" aria-live="polite">
        {messages.length === 0 && (
          <p className="mx-auto mt-10 max-w-[16rem] text-center text-sm leading-relaxed text-moon/55">
            {connected
              ? "You're through. Say hi, ask where it's daytime, or tap Spark for an opener."
              : "Hang on, connecting your browsers directly."}
          </p>
        )}
        {messages.map((m, i) => {
          if (m.kind === "system") {
            return (
              <div key={m.id} className="my-3 flex justify-center animate-rise">
                <p className="max-w-[85%] rounded-2xl border border-amber/30 bg-amber/10 px-4 py-2.5 text-center text-sm text-amber">
                  {m.text}
                </p>
              </div>
            );
          }
          const prev = messages[i - 1];
          const grouped = prev && prev.mine === m.mine && prev.kind !== "system";
          return (
            <div
              key={m.id}
              className={`flex ${m.mine ? "justify-end" : "justify-start"} ${grouped ? "" : "pt-2"}`}
            >
              <p
                className={`max-w-[80%] whitespace-pre-wrap break-words px-4 py-2 text-[15px] leading-snug ${
                  m.mine
                    ? "rounded-2xl rounded-br-md bg-amber text-night"
                    : "rounded-2xl rounded-bl-md bg-moon/10 text-moon"
                }`}
              >
                {m.text}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {toolbar}

      <form
        onSubmit={submit}
        className="flex items-center gap-2 border-t border-moon/10 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <input
          ref={inputRef}
          value={draft}
          maxLength={MAX_LEN}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={connected ? "Write a message" : "Connecting…"}
          aria-label="Message"
          disabled={!connected}
          className="min-w-0 flex-1 rounded-2xl bg-moon/8 px-4 py-3 text-[15px] outline-none placeholder:text-moon/40 focus:ring-2 focus:ring-amber/60 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!connected || !draft.trim()}
          aria-label="Send message"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber text-night transition hover:brightness-110 active:scale-95 disabled:opacity-35"
        >
          <SendIcon />
        </button>
      </form>
    </section>
  );
}
