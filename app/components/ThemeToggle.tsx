"use client";

import { setTheme, useTheme } from "@/lib/theme";
import { MoonIcon, SunIcon } from "./icons";

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`glass grid h-10 w-10 place-items-center rounded-full transition hover:brightness-110 ${className}`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
