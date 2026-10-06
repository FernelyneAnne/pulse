"use client";

import { useEffect, useRef } from "react";
import { MicIcon, MicOffIcon, PhoneOffIcon, VideoIcon, VideoOffIcon } from "./icons";

export default function VideoPanel({
  localStream,
  remoteStream,
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  onEnd,
  overlay,
}: {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onEnd: () => void;
  overlay?: React.ReactNode;
}) {
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localRef.current && localRef.current.srcObject !== localStream) {
      localRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteRef.current && remoteRef.current.srcObject !== remoteStream) {
      remoteRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const ctrl =
    "grid h-14 w-14 place-items-center rounded-full transition active:scale-95";

  return (
    <section
      aria-label="Video call"
      className="absolute inset-0 z-50 flex animate-rise flex-col bg-night"
    >
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          data-remote-video
          className="h-full w-full object-cover"
        />
        {!remoteStream && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="flex items-center gap-3 text-moon/60">
              <span className="h-2.5 w-2.5 animate-breathe rounded-full bg-amber" />
              Waiting for their camera
            </p>
          </div>
        )}
        {overlay}
        <video
          ref={localRef}
          autoPlay
          playsInline
          muted
          className={`absolute right-4 top-[max(1rem,env(safe-area-inset-top))] aspect-[3/4] w-28 rounded-2xl border border-moon/20 bg-dusk object-cover shadow-xl sm:w-40 ${
            camOn ? "" : "opacity-30"
          }`}
          style={{ transform: "scaleX(-1)" }}
        />
      </div>
      <div className="flex items-center justify-center gap-4 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <button
          onClick={onToggleMic}
          aria-pressed={!micOn}
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
          className={`${ctrl} ${micOn ? "bg-moon/12 hover:bg-moon/20" : "bg-moon text-night"}`}
        >
          {micOn ? <MicIcon /> : <MicOffIcon />}
        </button>
        <button
          onClick={onToggleCam}
          aria-pressed={!camOn}
          aria-label={camOn ? "Turn camera off" : "Turn camera on"}
          className={`${ctrl} ${camOn ? "bg-moon/12 hover:bg-moon/20" : "bg-moon text-night"}`}
        >
          {camOn ? <VideoIcon /> : <VideoOffIcon />}
        </button>
        <button
          onClick={onEnd}
          aria-label="End video and return to chat"
          className={`${ctrl} w-auto gap-2 bg-danger px-6 font-bold text-night hover:brightness-110`}
        >
          <PhoneOffIcon /> End video
        </button>
      </div>
    </section>
  );
}
