"use client";

import { useEffect, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap from "./components/WorldMap";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import { AuthError, join, leave, poll, sendSignal } from "@/lib/api";
import { PeerSession, type DescType, type PeerControl } from "@/lib/webrtc";
import { POLL_INTERVAL_MS } from "@/lib/presence";
import { type Link, type PeerDot, type SignalMsg } from "@/lib/types";
import { DEFAULT_VIBE, SPARKS, VIBES, pickSpark, vibeById } from "@/lib/vibes";
import { EyeIcon, ShieldIcon, SparkIcon } from "./components/icons";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string }
  | { kind: "incoming"; peerId: string }
  | { kind: "connecting"; peerId: string }
  | { kind: "connected"; peerId: string };

type VideoState = "none" | "requesting" | "incoming" | "active";

const REQUEST_TIMEOUT_MS = 30_000;

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [peers, setPeers] = useState<PeerDot[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [vibeFilter, setVibeFilter] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<ReadonlySet<string>>(new Set());
  const blockedRef = useRef(blocked);
  const [peerVibe, setPeerVibe] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const peerRef = useRef<PeerSession | null>(null);
  // Raw location stays in memory only, used to re-join if the session expires.
  const rawLocation = useRef<{ lat: number; lng: number } | null>(null);
  const myVibe = useRef(DEFAULT_VIBE);
  const peersRef = useRef<PeerDot[]>([]);
  const usedSparks = useRef<Set<number>>(new Set());
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotice(text: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), 3800);
  }

  function addMessage(mine: boolean, text: string, kind: ChatMessage["kind"] = "text") {
    setMessages((prev) => [...prev, { id: msgId.current++, mine, text, kind }]);
  }

  function resetVideoState() {
    setLocalStream(null);
    setRemoteStream(null);
    setMicOn(true);
    setCamOn(true);
    setRevealed(false);
    setVideo("none");
  }

  function teardown(message?: string) {
    if (requestTimer.current) clearTimeout(requestTimer.current);
    peerRef.current?.close();
    peerRef.current = null;
    resetVideoState();
    setMessages([]);
    setPeerVibe(null);
    usedSparks.current.clear();
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  function startPeer(peerId: string, initiator: boolean) {
    const ps: PeerSession = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void sendSignal(peerId, type, payload);
      },
      onChat: (text) => addMessage(false, text),
      // Only known prompts render as a spark card, so a stranger can't fake
      // "system" messages.
      onSpark: (text) => {
        if (SPARKS.includes(text)) addMessage(false, text, "system");
      },
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "failed" || state === "closed") {
          if (peerRef.current === ps) teardown("The connection dropped.");
        }
      },
      onChannelOpen: () => {
        setConn({ kind: "connected", peerId });
      },
    });
    peerRef.current = ps;
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        break;
      case "video-accept":
        if (videoRef.current === "requesting" && ps) {
          ps.startVideo()
            .then((stream) => {
              setLocalStream(stream);
              setVideo("active");
            })
            .catch(() => {
              setVideo("none");
              ps.sendControl("video-end");
              showNotice("Your camera isn't available. Check browser permissions.");
            });
        }
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("They'd rather keep it to text.");
        }
        break;
      case "video-end":
        ps?.stopVideo();
        resetVideoState();
        break;
    }
  }

  function vibeOf(peerId: string): string | null {
    return peersRef.current.find((p) => p.id === peerId)?.vibe ?? null;
  }

  function sendSpark() {
    const ps = peerRef.current;
    if (!ps) return;
    const i = pickSpark(usedSparks.current);
    ps.sendSpark(SPARKS[i]);
    addMessage(true, SPARKS[i], "system");
  }

  function blockPeer() {
    const c = connRef.current;
    if (c.kind === "idle") return;
    const next = new Set(blockedRef.current);
    next.add(c.peerId);
    blockedRef.current = next;
    setBlocked(next);
    if (c.kind === "incoming") {
      void sendSignal(c.peerId, "decline");
      setConn({ kind: "idle" });
      showNotice("Blocked. Their light is hidden for this visit.");
      return;
    }
    endConnection();
    showNotice("Blocked. Their light is hidden for this visit.");
  }

  function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle") return;
    setPeerVibe(vibeOf(peerId));
    setConn({ kind: "requesting", peerId });
    void sendSignal(peerId, "request").then((ok) => {
      if (!ok && connRef.current.kind === "requesting") {
        teardown("Slow down a little, then try again.");
      }
    });
    requestTimer.current = setTimeout(() => {
      if (
        connRef.current.kind === "requesting" &&
        connRef.current.peerId === peerId
      ) {
        void sendSignal(peerId, "end");
        teardown("No answer this time.");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function cancelRequest() {
    if (connRef.current.kind === "requesting") {
      void sendSignal(connRef.current.peerId, "end");
    }
    teardown();
  }

  function acceptIncoming() {
    if (connRef.current.kind !== "incoming") return;
    const peerId = connRef.current.peerId;
    setPeerVibe(vibeOf(peerId));
    startPeer(peerId, false);
    void sendSignal(peerId, "accept").then((ok) => {
      if (!ok) teardown("That request expired.");
    });
    setConn({ kind: "connecting", peerId });
  }

  function declineIncoming() {
    if (connRef.current.kind !== "incoming") return;
    void sendSignal(connRef.current.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void sendSignal(c.peerId, "end");
    }
    teardown();
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        ps.sendControl("video-accept");
        setVideo("active");
      })
      .catch(() => {
        ps.sendControl("video-decline");
        setVideo("none");
        showNotice("Your camera isn't available. Check browser permissions.");
      });
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    const ps = peerRef.current;
    ps?.stopVideo();
    ps?.sendControl("video-end");
    resetVideoState();
  }

  function toggleMic() {
    const next = !micOn;
    peerRef.current?.setTrackEnabled("audio", next);
    setMicOn(next);
  }

  function toggleCam() {
    const next = !camOn;
    peerRef.current?.setTrackEnabled("video", next);
    setCamOn(next);
  }

  function processSignal(sig: SignalMsg) {
    switch (sig.type) {
      case "request": {
        if (blockedRef.current.has(sig.fromId)) {
          void sendSignal(sig.fromId, "decline");
        } else if (connRef.current.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId });
        } else {
          void sendSignal(sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true);
          setConn({ kind: "connecting", peerId: sig.fromId });
        }
        break;
      }
      case "decline": {
        const c = connRef.current;
        if (c.kind === "requesting" && c.peerId === sig.fromId) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          teardown("They're not free right now.");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        const c = connRef.current;
        const peerId =
          c.kind === "connecting" || c.kind === "connected" ? c.peerId : null;
        if (peerRef.current && peerId === sig.fromId) {
          void peerRef.current.handleSignal(
            sig.type as DescType,
            sig.payload ?? "",
          );
        }
        break;
      }
      case "end": {
        const c = connRef.current;
        if (
          (c.kind === "incoming" ||
            c.kind === "connecting" ||
            c.kind === "connected") &&
          c.peerId === sig.fromId
        ) {
          if (c.kind === "incoming") setConn({ kind: "idle" });
          else teardown("The stranger left.");
        }
        break;
      }
    }
  }

  const processSignalRef = useRef(processSignal);
  const teardownRef = useRef(teardown);
  useEffect(() => {
    processSignalRef.current = processSignal;
    teardownRef.current = teardown;
  });

  useEffect(() => {
    if (phase !== "live") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const data = await poll();
        if (!active) return;
        peersRef.current = data.peers;
        setPeers(data.peers);
        setLinks(data.links);
        for (const s of data.signals) processSignalRef.current(s);
      } catch (err) {
        // Session reaped (e.g. tab was asleep): start a fresh one.
        if (err instanceof AuthError && active && rawLocation.current) {
          teardownRef.current();
          try {
            const r = await join(
              rawLocation.current.lat,
              rawLocation.current.lng,
              myVibe.current,
            );
            setMyLocation({ lat: r.lat, lng: r.lng });
          } catch {}
        }
      }
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const onLeave = () => leave();
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [phase]);

  async function handleReady(lat: number, lng: number, vibe: string) {
    rawLocation.current = { lat, lng };
    myVibe.current = vibe;
    const r = await join(lat, lng, vibe);
    // Show the user where OTHERS see them (the offset position).
    setMyLocation({ lat: r.lat, lng: r.lng });
    setPhase("live");
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";
  const visiblePeers = peers.filter((p) => !blocked.has(p.id));
  const freeCount = visiblePeers.filter((p) => !p.busy).length;
  const incomingVibe =
    conn.kind === "incoming"
      ? vibeById(peers.find((p) => p.id === conn.peerId)?.vibe)
      : null;
  const partnerVibe = peerVibe ? vibeById(peerVibe) : null;
  const vibeCounts = new Map<string, number>();
  for (const p of visiblePeers) {
    if (!p.busy) vibeCounts.set(p.vibe, (vibeCounts.get(p.vibe) ?? 0) + 1);
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-night text-moon">
      <WorldMap
        peers={peers}
        me={myLocation}
        onPeerClick={requestConnection}
        canConnect={conn.kind === "idle"}
        spinning={phase === "gate"}
        ringingId={conn.kind === "requesting" ? conn.peerId : null}
        links={links}
        vibeFilter={vibeFilter}
        hiddenIds={blocked}
      />

      {phase === "gate" && <EntryGate onReady={handleReady} />}

      {phase === "live" && (
        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <p className="text-2xl font-extrabold tracking-[-0.04em]">
            pulse
            <span className="ml-1.5 inline-block h-2 w-2 animate-breathe rounded-full bg-amber align-middle" />
          </p>
          <p className="glass rounded-full px-4 py-2 text-sm" aria-live="polite">
            <span className="font-bold text-amber">{visiblePeers.length}</span>{" "}
            {visiblePeers.length === 1 ? "light" : "lights"} on
            {links.length > 0 && (
              <span className="text-moon/55">
                , {links.length} {links.length === 1 ? "conversation" : "conversations"}
              </span>
            )}
            {visiblePeers.length > 0 && (
              <span className="text-moon/55">, {freeCount} free to talk</span>
            )}
          </p>
        </header>
      )}

      {phase === "live" && conn.kind === "idle" && visiblePeers.length === 0 && (
        <p className="glass pointer-events-none absolute bottom-6 left-1/2 z-10 w-[min(92vw,26rem)] -translate-x-1/2 animate-rise rounded-2xl px-5 py-3 text-center text-sm text-moon/75">
          You&rsquo;re the only light right now. Share the link, or keep this
          tab open and someone will show up.
        </p>
      )}

      {phase === "live" && conn.kind === "idle" && visiblePeers.length > 0 && (
        <nav
          aria-label="Filter lights by vibe"
          className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        >
          <p className="pointer-events-none text-sm text-moon/60">
            {vibeFilter
              ? `Showing people up for ${vibeById(vibeFilter).label.toLowerCase()}`
              : "Tap a glowing light to say hello"}
          </p>
          <div className="glass flex max-w-full gap-1 overflow-x-auto rounded-full p-1.5">
            <button
              onClick={() => setVibeFilter(null)}
              aria-pressed={vibeFilter === null}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                vibeFilter === null ? "bg-moon text-night" : "text-moon/75 hover:bg-moon/10"
              }`}
            >
              Everyone
            </button>
            {VIBES.map((v) => {
              const on = vibeFilter === v.id;
              const n = vibeCounts.get(v.id) ?? 0;
              return (
                <button
                  key={v.id}
                  onClick={() => setVibeFilter(on ? null : v.id)}
                  aria-pressed={on}
                  title={v.label}
                  aria-label={`${v.label}, ${n} free`}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm transition ${
                    on ? "text-night" : "text-moon/75 hover:bg-moon/10"
                  }`}
                  style={on ? { background: v.color } : undefined}
                >
                  <span aria-hidden>{v.emoji}</span>
                  <span className="tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {notice && (
        <div
          role="status"
          className="glass absolute left-1/2 top-20 z-[60] -translate-x-1/2 animate-rise rounded-full px-5 py-2.5 text-sm"
        >
          {notice}
        </div>
      )}

      {conn.kind === "requesting" && (
        <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="glass flex w-full max-w-sm animate-rise items-center gap-4 rounded-3xl p-4">
            <span className="ml-1 h-3 w-3 shrink-0 animate-breathe rounded-full bg-amber shadow-[0_0_16px_4px_rgba(255,178,56,0.6)]" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">Knocking…</p>
              <p className="text-sm text-moon/60">Waiting for them to answer</p>
            </div>
            <button
              onClick={cancelRequest}
              className="rounded-2xl border border-moon/15 px-4 py-2.5 text-sm font-semibold hover:bg-moon/5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {conn.kind === "incoming" && (
        <ConnectionPrompt
          title="Someone wants to talk"
          subtitle={`They're up for ${incomingVibe?.label.toLowerCase() ?? "a chat"}.`}
          badge={incomingVibe?.emoji}
          acceptLabel="Say hello"
          declineLabel="Not now"
          onAccept={acceptIncoming}
          onDecline={declineIncoming}
          timeoutMs={REQUEST_TIMEOUT_MS}
        />
      )}

      {inChat && (
        <ChatPanel
          messages={messages}
          connected={conn.kind === "connected"}
          videoBusy={video !== "none"}
          onSend={(text) => {
            peerRef.current?.sendChat(text);
            addMessage(true, text);
          }}
          onStartVideo={startVideoRequest}
          onEnd={endConnection}
          headerExtra={
            partnerVibe ? (
              <span
                title={partnerVibe.label}
                className="rounded-full px-2.5 py-1 text-sm"
                style={{ background: `${partnerVibe.color}26`, color: partnerVibe.color }}
              >
                {partnerVibe.emoji}
              </span>
            ) : null
          }
          toolbar={
            conn.kind === "connected" ? (
              <div className="flex gap-2 px-3 pt-2">
                <button
                  onClick={sendSpark}
                  className="flex items-center gap-1.5 rounded-full border border-amber/35 px-3.5 py-1.5 text-sm font-semibold text-amber transition hover:bg-amber/10"
                >
                  <SparkIcon className="h-4 w-4" /> Spark
                </button>
                <button
                  onClick={blockPeer}
                  className="ml-auto flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-moon/55 transition hover:bg-danger/15 hover:text-danger"
                >
                  <ShieldIcon className="h-4 w-4" /> Block and leave
                </button>
              </div>
            ) : null
          }
        />
      )}

      {video === "requesting" && (
        <div
          role="status"
          className="glass absolute left-1/2 top-20 z-40 -translate-x-1/2 animate-rise rounded-full px-5 py-2.5 text-sm"
        >
          Asking to turn on video…
        </div>
      )}

      {video === "incoming" && (
        <ConnectionPrompt
          title="Turn on video?"
          subtitle="They'd like to see each other. Your camera and mic will turn on."
          acceptLabel="Start video"
          declineLabel="Keep to text"
          onAccept={acceptVideo}
          onDecline={declineVideo}
        />
      )}

      {video === "active" && (
        <VideoPanel
          localStream={localStream}
          remoteStream={remoteStream}
          micOn={micOn}
          camOn={camOn}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onEnd={endVideo}
          overlay={
            remoteStream && !revealed ? (
              <div className="absolute inset-0 grid place-items-center bg-night/30 p-6 backdrop-blur-[48px]">
                <div className="max-w-xs text-center">
                  <ShieldIcon className="mx-auto h-9 w-9 text-aurora" />
                  <p className="mt-3 text-lg font-bold">Their video is blurred</p>
                  <p className="mt-1 text-sm text-moon/70">
                    You can already hear each other. Reveal the picture when
                    you&rsquo;re comfortable.
                  </p>
                  <button
                    onClick={() => setRevealed(true)}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-moon px-5 py-3 font-bold text-night transition hover:brightness-95"
                  >
                    <EyeIcon /> Show their video
                  </button>
                </div>
              </div>
            ) : null
          }
        />
      )}
    </main>
  );
}
