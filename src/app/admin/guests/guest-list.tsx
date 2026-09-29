"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { Guest, listGuests } from "@/lib/checkin";

type Data = Awaited<ReturnType<typeof listGuests>>;

// Bare guest list: who's inside, who hasn't arrived, manual check-in.
// Refreshes every 5 seconds so several door admins see the same picture.
export function GuestList() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<"notArrived" | "inside">("notArrived");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/guests", { cache: "no-store" });
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    if (res.ok) setData(await res.json());
  }, [router]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  async function post(path: string, code: string) {
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    load();
  }

  if (!data) return <p className="p-4">Loading…</p>;

  const q = search.trim().toLowerCase();
  const rows = data[tab].filter(
    (g) => !q || [g.name, g.email, g.ticket_id].some((v) => v.toLowerCase().includes(q)),
  );

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-4">
      <p className="text-lg">
        <b>{data.counts.inside}</b> inside · <b>{data.counts.notArrived}</b> not arrived · {data.counts.total} tickets
      </p>

      <div className="flex gap-2">
        <button onClick={() => setTab("notArrived")} className={`border border-line px-3 py-1 ${tab === "notArrived" ? "bg-card font-bold" : ""}`}>
          Not arrived ({data.counts.notArrived})
        </button>
        <button onClick={() => setTab("inside")} className={`border border-line px-3 py-1 ${tab === "inside" ? "bg-card font-bold" : ""}`}>
          Inside ({data.counts.inside})
        </button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, email or DD-001"
        className="w-full border border-line bg-card p-2"
      />

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className="py-2">Ticket</th>
            <th>Name</th>
            <th>{tab === "inside" ? "In since" : "Email"}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <GuestRow key={g.code} guest={g} onCheckIn={() => post("/api/admin/checkin", g.code)} onUndo={() => post("/api/admin/undo", g.code)} />
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="text-muted">Nobody here.</p>}
    </main>
  );
}

function GuestRow({ guest, onCheckIn, onUndo }: { guest: Guest; onCheckIn: () => void; onUndo: () => void }) {
  const inside = guest.status === "CHECKED_IN";
  const time = guest.checked_in_at
    ? new Date(guest.checked_in_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "";
  return (
    <tr className="border-b border-line">
      <td className="py-2 font-mono">{guest.ticket_id}</td>
      <td>{guest.name}</td>
      <td className="text-muted">{inside ? `${time} · ${guest.checked_in_by}` : guest.email}</td>
      <td className="text-right">
        {inside ? (
          <button onClick={onUndo} className="underline">Undo</button>
        ) : (
          <button onClick={() => confirm(`Check in ${guest.name} without scanning?`) && onCheckIn()} className="underline">
            Check in
          </button>
        )}
      </td>
    </tr>
  );
}
