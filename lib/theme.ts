"use client";

import { useSyncExternalStore } from "react";

// Theme lives on <html data-theme="dark|light">. A tiny inline script in the
// layout sets it before first paint (no flash). Default follows the OS; an
// explicit choice is remembered in localStorage.
export type Theme = "dark" | "light";
import { THEME_KEY as KEY } from "@/lib/theme-script";
const listeners = new Set<() => void>();

function read(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {}
  listeners.forEach((l) => l());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "dark",
  );
}
