import { randomUUID } from "node:crypto";
import { connection } from "next/server";
import { getStats } from "@/lib/booking";
import { EVENT, formatEventDate } from "@/lib/event";
import { LiveCount } from "./live-count";
import { ReserveForm } from "./reserve-form";

export default async function Home() {
  await connection();
  const stats = await getStats();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Free event · RSVP</p>
      <h1 className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight">{EVENT.name}</h1>
      <p className="mt-3 text-muted">{EVENT.tagline}</p>

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-line bg-card p-3">
          <dt className="text-muted">When</dt>
          <dd className="mt-0.5 font-medium">{formatEventDate(EVENT.startsAt)}</dd>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <dt className="text-muted">Where</dt>
          <dd className="mt-0.5 font-medium">{EVENT.venue}</dd>
        </div>
      </dl>

      <div className="mt-6">
        <LiveCount initial={stats} />
      </div>

      <div className="mt-8">
        <ReserveForm idempotencyKey={randomUUID()} soldOut={stats.remaining <= 0} />
      </div>
    </main>
  );
}
