"use client";

import { CardsIcon, GlobeIcon, NearbyIcon } from "./icons";

export type View = "globe" | "swipe" | "nearby";

const TABS: { id: View; label: string; Icon: typeof GlobeIcon }[] = [
  { id: "globe", label: "Explore", Icon: GlobeIcon },
  { id: "swipe", label: "Swipe", Icon: CardsIcon },
  { id: "nearby", label: "Nearby", Icon: NearbyIcon },
];

// App-style bottom navigation between the three ways to find someone.
export default function TabBar({
  view,
  onChange,
  nearbyCount,
  swipeCount,
}: {
  view: View;
  onChange: (v: View) => void;
  nearbyCount: number;
  swipeCount: number;
}) {
  const counts: Partial<Record<View, number>> = {
    swipe: swipeCount,
    nearby: nearbyCount,
  };
  return (
    <nav
      aria-label="Views"
      className="absolute inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))]"
    >
      <div className="glass grid w-full max-w-sm grid-cols-3 gap-1 rounded-[1.6rem] p-1.5 shadow-2xl">
        {TABS.map(({ id, label, Icon }) => {
          const on = view === id;
          const n = counts[id];
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={on ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 rounded-[1.2rem] py-2 text-[11px] font-bold transition ${
                on ? "bg-moon/10" : "text-moon/55 hover:text-moon"
              }`}
            >
              <span className={on ? "text-[#ff4f81]" : ""}>
                <Icon className="h-6 w-6" />
              </span>
              <span className={on ? "text-brand" : ""}>{label}</span>
              {n !== undefined && n > 0 && (
                <span className="bg-brand absolute right-[22%] top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-extrabold text-white tabular-nums">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
