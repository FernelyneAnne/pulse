"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import type { GeoJSONSource, Map as MapboxMap, Marker } from "mapbox-gl";
import type { Link, PeerDot } from "@/lib/types";
import { vibeById } from "@/lib/vibes";
import { greatCircle } from "@/lib/geodesic";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

type ThemeName = "dark" | "light";

// Night-side Earth vs. dawn sky. Each theme owns its basemap, atmosphere and
// arc colours; switching re-applies them on the new style.
const LOOK: Record<
  ThemeName,
  {
    style: string;
    fog: Record<string, string | number>;
    glow: string;
    core: string;
  }
> = {
  dark: {
    style: "mapbox://styles/mapbox/dark-v11",
    fog: {
      color: "#232a5c",
      "high-color": "#3a3384",
      "horizon-blend": 0.05,
      "space-color": "#090c22",
      "star-intensity": 0.4,
    },
    glow: "#62e3c8",
    core: "#d9fff6",
  },
  light: {
    style: "mapbox://styles/mapbox/light-v11",
    fog: {
      color: "#f6f2ff",
      "high-color": "#b9c6ff",
      "horizon-blend": 0.06,
      "space-color": "#dfe5ff",
      "star-intensity": 0,
    },
    glow: "#14b896",
    core: "#0b6f5c",
  },
};

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

function myLineFor(
  me: { lat: number; lng: number } | null,
  partner: { lat: number; lng: number } | null,
): GeoJSON.FeatureCollection {
  if (!me || !partner) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: greatCircle(me.lng, me.lat, partner.lng, partner.lat),
        },
      },
    ],
  };
}

function linesFor(links: Link[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: links.map(([a, b, c, d]) => ({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: greatCircle(a, b, c, d) },
    })),
  };
}

export default function WorldMap({
  peers,
  me,
  onPeerClick,
  canConnect,
  spinning,
  ringingId,
  links,
  vibeFilter,
  hiddenIds,
  theme,
  recenterKey,
  partner,
}: {
  peers: PeerDot[];
  me: { lat: number; lng: number } | null;
  onPeerClick: (id: string) => void;
  canConnect: boolean;
  spinning: boolean;
  ringingId: string | null;
  links: Link[];
  vibeFilter: string | null;
  hiddenIds: ReadonlySet<string>;
  theme: ThemeName;
  recenterKey: number;
  // The person you're connected to (offset position), if any.
  partner: { id: string; lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const meMarkerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const themeRef = useRef<ThemeName>(theme);
  const appliedThemeRef = useRef<ThemeName>(theme);
  const linksRef = useRef<Link[]>(links);
  const meRef = useRef(me);
  const partnerRef = useRef(partner);

  const onPeerClickRef = useRef(onPeerClick);
  const canConnectRef = useRef(canConnect);
  const spinningRef = useRef(spinning);
  useEffect(() => {
    onPeerClickRef.current = onPeerClick;
    canConnectRef.current = canConnect;
    spinningRef.current = spinning;
    themeRef.current = theme;
    linksRef.current = links;
    meRef.current = me;
    partnerRef.current = partner;
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
      // Start in whatever theme is actually on <html> right now.
      appliedThemeRef.current =
        document.documentElement.dataset.theme === "light" ? "light" : "dark";
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: LOOK[appliedThemeRef.current].style,
        projection: "globe",
        center: [40, 18],
        zoom: 1.6,
        attributionControl: false,
      });
      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-right",
      );
      // Re-applies fog + arc layers for the current theme. Idempotent; runs
      // for the first style and after every theme switch, since swapping the
      // basemap drops custom sources/layers.
      const ensureLayers = () => {
        if (!map.isStyleLoaded()) return;
        const look = LOOK[appliedThemeRef.current];
        if (!map.getSource("links")) {
          map.addSource("links", { type: "geojson", data: linesFor(linksRef.current) });
        }
        if (!map.getLayer("links-glow")) {
          map.addLayer({
            id: "links-glow",
            type: "line",
            source: "links",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": look.glow,
              "line-width": 8,
              "line-blur": 6,
              "line-opacity": 0.45,
            },
          });
        }
        if (!map.getLayer("links-core")) {
          map.addLayer({
            id: "links-core",
            type: "line",
            source: "links",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": look.core,
              "line-width": 1.6,
              "line-opacity": 0.95,
            },
          });
        }
        // Your own connection: a bold brand-pink line between you and them.
        if (!map.getSource("mylink")) {
          map.addSource("mylink", {
            type: "geojson",
            data: myLineFor(meRef.current, partnerRef.current),
          });
        }
        if (!map.getLayer("mylink-glow")) {
          map.addLayer({
            id: "mylink-glow",
            type: "line",
            source: "mylink",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#ff4f81", "line-width": 14, "line-blur": 10, "line-opacity": 0.55 },
          });
        }
        if (!map.getLayer("mylink-core")) {
          map.addLayer({
            id: "mylink-core",
            type: "line",
            source: "mylink",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              "line-color": "#ff8a5c",
              "line-width": 3.5,
              "line-dasharray": [1.5, 1.2],
            },
          });
        }
      };
      map.on("style.load", () => {
        map.setFog(LOOK[appliedThemeRef.current].fog);
        ensureLayers();
      });
      // Safety net: if anything else swaps the style, put the arcs back.
      map.on("styledata", ensureLayers);
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
          if (map.getLayer("links-glow")) {
            map.setPaintProperty(
              "links-glow",
              "line-opacity",
              0.3 + 0.25 * Math.sin(t / 700),
            );
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

  // Place "you" and fly down to it — the one big motion moment. Runs again
  // after going back and re-entering (new session, new spot).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!me) {
      meMarkerRef.current?.remove();
      meMarkerRef.current = null;
      return;
    }
    let cancelled = false;

    (async () => {
      const mapboxgl = (await import("mapbox-gl")).default;
      if (cancelled) return;
      if (!meMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "pulse-me";
        el.title = "You (others see you here)";
        el.innerHTML = '<span class="pulse-me-label">You</span>';
        meMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([me.lng, me.lat])
          .addTo(map);
      } else {
        meMarkerRef.current.setLngLat([me.lng, me.lat]);
      }
      map.flyTo({
        center: [me.lng, me.lat],
        zoom: 3.4,
        speed: 0.9,
        curve: 1.6,
        duration: prefersReducedMotion() ? 0 : 3200,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [me, ready]);

  // "Reset view": fly back to your own light at a neighbourhood zoom.
  useEffect(() => {
    const map = mapRef.current;
    const pos = meRef.current;
    if (!map || !ready || !pos || recenterKey === 0) return;
    map.flyTo({
      center: [pos.lng, pos.lat],
      zoom: 11,
      duration: prefersReducedMotion() ? 0 : 1600,
    });
  }, [recenterKey, ready]);

  // Theme switch → swap basemap; style.load re-applies fog + arc layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || appliedThemeRef.current === theme) return;
    appliedThemeRef.current = theme;
    // diff:false forces a full reload; a diffed swap silently deletes our
    // custom arc layers and never fires style.load.
    map.setStyle(LOOK[theme].style, { diff: false } as unknown as Parameters<
      MapboxMap["setStyle"]
    >[1]);
  }, [theme, ready]);

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
        const vibe = vibeById(peer.vibe);
        el.style.setProperty("--c", vibe.color);
        el.dataset.busy = String(peer.busy);
        el.dataset.hidden = String(
          hiddenIds.has(peer.id) ||
            (vibeFilter !== null && peer.vibe !== vibeFilter),
        );
        el.dataset.ringing = String(peer.id === ringingId);
        el.dataset.partner = String(peer.id === partner?.id);
        el.setAttribute(
          "aria-label",
          peer.busy
            ? "Stranger, already talking"
            : `Connect with a stranger up for ${vibe.label.toLowerCase()}`,
        );
        el.title = peer.busy ? "Already talking" : `${vibe.emoji} ${vibe.label}`;
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
  }, [peers, ready, ringingId, vibeFilter, hiddenIds, partner?.id]);

  // Draw your own connection and frame both of you on screen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("mylink") as GeoJSONSource | undefined;
    src?.setData(myLineFor(me, partner));
    if (!me || !partner) return;
    const mobile = window.innerWidth < 640;
    map.fitBounds(
      [
        [Math.min(me.lng, partner.lng), Math.min(me.lat, partner.lat)],
        [Math.max(me.lng, partner.lng), Math.max(me.lat, partner.lat)],
      ],
      {
        // keep the pair clear of the chat panel (right on desktop, bottom on mobile)
        padding: mobile
          ? { top: 110, bottom: Math.round(window.innerHeight * 0.72) + 24, left: 50, right: 50 }
          : { top: 120, bottom: 80, left: 80, right: 460 },
        maxZoom: 12.5,
        duration: prefersReducedMotion() ? 0 : 1800,
      },
    );
    // Only re-frame when the partner changes, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partner?.id, ready]);

  // Push conversation arcs to the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = map.getSource("links") as GeoJSONSource | undefined;
    src?.setData(linesFor(links)); // if the style is mid-swap, style.load applies it
  }, [links, ready]);

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
