"use client";

import { useEffect, useState } from "react";
import type { Stats } from "@/lib/booking";

// Polls /api/stats so the counter moves while people are booking.
export function useLiveStats(initial: Stats, intervalMs = 3000) {
  const [stats, setStats] = useState(initial);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/stats", { cache: "no-store" });
        if (res.ok && alive) setStats(await res.json());
      } catch {
        // Offline for a moment — keep showing the last known numbers.
      }
    };
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return stats;
}

export function LiveCount({ initial, size = "sm" }: { initial: Stats; size?: "sm" | "lg" }) {
  const stats = useLiveStats(initial);
  const pct = stats.capacity ? Math.min(100, (stats.reserved / stats.capacity) * 100) : 100;
  const big = size === "lg";

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-4">
        <span className={big ? "text-5xl font-extrabold tabular-nums" : "text-sm text-muted"}>
          {big ? stats.reserved : `${stats.remaining} of ${stats.capacity} left`}
          {big && <span className="text-muted text-2xl font-semibold"> / {stats.capacity}</span>}
        </span>
        {big && (
          <span className="text-lg text-muted">
            {stats.remaining > 0 ? `${stats.remaining} left` : "Sold out"}
          </span>
        )}
      </div>
      <div
        className={`${big ? "mt-4 h-4" : "mt-2 h-1.5"} w-full overflow-hidden rounded-full bg-line`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stats.capacity}
        aria-valuenow={stats.reserved}
        aria-label="Tickets reserved"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
