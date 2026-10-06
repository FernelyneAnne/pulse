"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Map as MapboxMap, Marker } from "mapbox-gl";
import type { PeerDot } from "@/lib/types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Stable per-session stagger so the lights don't all pulse in unison.
function delayFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `${(Math.abs(h) % 2800) / 1000}s`;
}

export default function WorldMap({
  peers,
  me,
  onPeerClick,
  canConnect,
  spinning,
  ringingId,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
  spinning: boolean;
  ringingId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);

  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  const spinningRef = useRef(spinning);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
    spinningRef.current = spinning;
  });

  // Initialise the globe once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;
    let cancelled = false;
    let raf = 0;
    const markers = markersRef.current;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        projection: "globe",
        center: [40, 18],
        zoom: 1.6,
        attributionControl: false,
      });
      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-right",
      );
      map.on("style.load", () => {
        map.setFog({
          color: "#232a5c",
          "high-color": "#3a3384",
          "horizon-blend": 0.05,
          "space-color": "#090c22",
          "star-intensity": 0.4,
        });
      });
      map.on("load", () => {
        if (!cancelled) setReady(true);
      });
      mapRef.current = map;

      // Slow idle rotation behind the entry screen.
      if (!prefersReducedMotion()) {
        let last = performance.now();
        const spin = (t: number) => {
          const dt = t - last;
          last = t;
          if (spinningRef.current && mapRef.current) {
            const c = map.getCenter();
            c.lng -= dt * 0.004;
            map.setCenter(c);
          }
          raf = requestAnimationFrame(spin);
        };
        raf = requestAnimationFrame(spin);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      markers.forEach((m) => m.remove());
      markers.clear();
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Place "you" and fly down to it — the one big motion moment.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !me) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You (others see you here)";
        meMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
        map.flyTo({
          center: [me.lng, me.lat],
          zoom: 3.4,
          speed: 0.9,
          curve: 1.6,
          essential: false,
          duration: prefersReducedMotion() ? 0 : 3200,
        });
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  // Reconcile peer lights.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      const markers = markersRef.current;
      const seen = new Set<string>();

      for (const peer of peers) {
        seen.add(peer.id);
        let marker = markers.get(peer.id);
        if (!marker) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "pulse-dot";
          el.style.setProperty("--delay", delayFor(peer.id));
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (el.dataset.busy === "true") return;
            if (canConnectRef.current) onPeerClickRef.current(peer.id);
          });
          marker = new mapboxgl.Marker({ element: el })
            .setLngLat([peer.lng, peer.lat])
            .addTo(map);
          markers.set(peer.id, marker);
        }
        const el = marker.getElement();
        el.dataset.busy = String(peer.busy);
        el.dataset.ringing = String(peer.id === ringingId);
        el.setAttribute(
          "aria-label",
          peer.busy ? "Stranger, already talking" : "Connect with this stranger",
        );
        el.title = peer.busy ? "Already talking" : "Say hello";
      }

      for (const [id, marker] of markers) {
        if (!seen.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [peers, ready, ringingId]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="h-full w-full bg-night" />
      {!TOKEN && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="glass max-w-md rounded-2xl p-5 text-sm">
            The map needs a Mapbox token. Set{" "}
            <code className="text-amber">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
            <code>.env</code> and restart.
          </p>
        </div>
      )}
    </div>
  );
}
