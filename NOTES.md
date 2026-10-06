# NOTES

Pulse take-home. One section per phase: what I found, what I changed, and why.
Git history is split into small commits that follow the same order.

## Setup decisions

- **Database:** Supabase Postgres instead of Neon (both are plain Postgres; Prisma connects the same way). Locally `DATABASE_URL` is the session pooler (port 5432), which works for `prisma db push` and the app. On Vercel it is the transaction pooler (port 6543), which suits short-lived serverless connections. Prisma 7 talks to Postgres through the `pg` driver adapter, which uses unnamed prepared statements, so no `pgbouncer` flag is needed. The code already avoids interactive transactions, so it is safe behind PgBouncer.
- **Schema changes** ship as migrations in `prisma/migrations` and also work with `npx prisma db push` as the README describes.

---

## Phase 1: Make it run

Found by reading each request path end to end (join, poll, signal, leave, the WebRTC class) and checking it against `docs/requirements.md`, then confirming with two browser windows.

| Symptom | Cause | Fix |
|---|---|---|
| Dots stay on the map long after users close the app (the README example) | `/api/poll` heartbeat ran `updateMany({ where: {} })`, refreshing **every** row on every poll, so nothing ever went stale | Heartbeat only the caller |
| Chat messages never arrive | Sender wrote `{ t: "msg" }`, receiver only accepts `{ t: "chat" }` | Use the same message type |
| Connections fail intermittently | ICE candidates that arrived before the SDP were flushed *before* `setRemoteDescription`, so `addIceCandidate` threw and they were lost | Flush queued candidates after the remote description is set |
| After one chat, both users stay dimmed and every request is auto-declined | `busy` was reset on `decline` but never on `end` | Reset `busy` on `end` |
| Blank map with no explanation when the token is missing | Hardcoded fake Mapbox token fallback hid the "set your token" message | Removed the fallback |
| Closing the tab mid-chat leaves the partner stuck in a dead chat (and busy) | Leaving only deleted the presence row; nobody told the partner | Partner is notified (moved fully server-side in Phase 3) |

Also: a failed WebRTC link now frees both users server-side, and a leftover ngrok host was removed from `next.config.ts`.

---

## Phase 2: Make it good

Concept: **people are city lights on a night-side Earth.** Every visual choice comes from that.

- **The globe is the hero.** Mapbox globe projection with atmosphere and stars. It turns slowly behind the entry screen; entering flies the camera down to your light. That flight is the single big motion moment; everything else stays calm.
- **Palette:** night indigo, dusk violet, sodium-lamp amber for people, moonlight for text, aurora teal for live connections. I moved away from the original black + emerald on purpose.
- **Type:** one family, Bricolage Grotesque, with a heavy lowercase wordmark.
- **Lights, not dots:** glowing markers with a soft ring that pulses on a staggered rhythm so the map feels alive rather than blinking in unison. Busy people dim. The person you are knocking on pulses faster.
- **Flow:** non-blocking cards instead of full-screen modals. Incoming requests show a 30-second countdown ring, focus the primary action and decline on Esc. Chat is a side sheet on desktop and a bottom sheet on mobile.
- **Video:** full-bleed remote, mirrored self view, mic and camera toggles.
- **Copy:** every outcome says what happened in plain words ("They're not free right now", "No answer this time", "The stranger left").
- **Quality floor:** responsive to mobile with safe-area insets, visible focus rings, `prefers-reduced-motion` respected (no spin, no pulsing), aria labels and live regions.
- Your own pin now shows the **offset** spot others see, not your real location.

---

## Phase 3: Make it secure

Ranked by impact. All Critical and High items are fixed.

**Critical**
1. **The session id was the only credential, and `/api/poll` broadcast everyone's id.** Ids were client-chosen. With any id from the map, anyone could poll that user's mailbox (stealing requests and SDP), send signals as them (`fromId` spoofing), or kick them with `/api/leave`.
   *Fixed:* `/api/join` now mints a public id plus a secret token. Only a sha256 hash is stored, comparison is constant-time, and every other endpoint requires id + token. The sender identity comes from the token, never from the body. Poll credentials moved from the query string to headers so they don't land in logs. The client keeps them in memory only.
2. **No authorization on signaling.** Anyone could send `offer`/`ice` to anyone, or forge `accept` to mark arbitrary users busy (a cheap way to lock everyone out).
   *Fixed:* the server enforces the state machine `request → accept/decline → offer/answer/ice → end`. Pairing (`peerId`, `pendingTo`) is stored server-side, and accept uses conditional updates so it can't race.

**High**
3. **No abuse limits.** *Fixed:* one connection request per 3 s per session, a cap on undelivered signals per recipient, and capped result sizes on poll.
4. **Heartbeat touched every row** (Phase 1), which also let one client keep the whole table "alive".

**Medium**
5. **Payload validation:** any type could carry 64 KB of arbitrary text. *Fixed:* per-type limits, JSON validated for offer/answer/ice, no payload allowed on control messages, request bodies size-capped before parsing.
6. **Errors:** unhandled DB errors surfaced as raw 500s. *Fixed:* generic error responses, details logged server-side only.
7. **Headers:** *Added* nosniff, `X-Frame-Options: DENY` (prevents clickjacking the Accept button), `no-referrer`, HSTS, and a Permissions-Policy limiting camera, mic and geolocation to this origin.
8. **Leaving and stale reaping now notify partners server-side**, so a closed or crashed tab always ends the chat for both people.

**Known, not fixed (with reasons)**
- **IP-level rate limiting** needs a shared store across serverless instances (e.g. Upstash). The requirements say no external services, so limits are per session. Someone can still create many sessions.
- **Peer IP addresses are visible to each other through WebRTC ICE.** That's inherent to peer-to-peer; a TURN relay with relay-only candidates would hide them.
- **Location averaging:** each session's offset is random, so one person who rejoins many times could be roughly triangulated. Snapping to a coarse grid first would fix it, but that breaks the strict "1–3 km from the real location" rule, so I left it as a product decision.
- **Mapbox token** is public by design; it should be URL-restricted in the Mapbox dashboard.
- **No CSP yet.** Mapbox needs workers and blob URLs, so it needs a tested policy rather than a guessed one.

---

## Phase 4: Make it better

**Vibes, Sparks, live arcs, Safe Reveal.** The original app makes you pick a stranger blind and then puts their camera in your face. I wanted the globe to say what's happening on it, and the riskiest moment (video) to be in the viewer's control.

**Alive**
- **Vibes:** one tap on entry (☕ chilling, 🎧 music, 🌙 deep talk, 😂 make me laugh, 🗣️ practice a language). Your light glows in that colour, the request card says what the stranger is up for, and you can filter the globe by vibe with live counts. It's a profile-free way to set expectations, consistent with "no accounts".
- **Live conversation arcs:** glowing great-circle arcs connect people who are talking right now, so you can watch the world chatting. The server sends only the two offset endpoints, never ids.
- **Spark:** one tap drops a shared icebreaker into both chats. The receiver only renders prompts from the known list, so it can't be abused to fake system messages.

**Safe**
- **Safe Reveal:** the stranger's video starts heavily blurred. Audio flows, so you can talk first and show the picture when you're comfortable.
- **Block and leave:** ends the chat, hides their light, and auto-declines them for the rest of the visit.

**Trade-offs:** arcs reveal *that* two lights are talking (not who). Blocks last only for the visit, because nothing is stored by design.

**Next with more time:** a mutual reveal (both sides tap before either picture unblurs), a typing indicator over the data channel, a short "how was it?" signal that lowers a session's visibility after repeated blocks, and a TURN relay for strict networks and IP privacy.

---

## Assumptions and blockers

- STUN-only connectivity is accepted as a known limitation (per README).
- The vibe list and spark prompts are hardcoded; they would live in config in a real product.
