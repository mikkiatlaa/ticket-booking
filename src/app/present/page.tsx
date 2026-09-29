import { connection } from "next/server";
import QRCode from "qrcode";
import { getStats } from "@/lib/booking";
import { EVENT, formatEventDate } from "@/lib/event";
import { getBaseUrl } from "@/lib/url";
import { LiveCount } from "../live-count";

export const metadata = { title: `Scan to join — ${EVENT.name}` };

// Put this on the projector: the class scans the QR and lands on the booking page.
export default async function PresentPage() {
  await connection();
  const url = await getBaseUrl();
  const [stats, qrSvg] = await Promise.all([
    getStats(),
    QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } }),
  ]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-12 px-8 py-10 lg:flex-row lg:gap-20">
      <div className="rounded-3xl bg-white p-6">
        <div className="w-[min(70vw,440px)]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      </div>
      <div className="w-full max-w-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-accent">Scan to get a free ticket</p>
        <h1 className="mt-4 text-5xl font-extrabold leading-[1.02] tracking-tight lg:text-6xl">{EVENT.name}</h1>
        <p className="mt-4 text-xl text-muted">
          {formatEventDate(EVENT.startsAt)} · {EVENT.venue}
        </p>
        <div className="mt-10">
          <LiveCount initial={stats} size="lg" />
        </div>
        <p className="mt-8 font-mono text-lg text-muted">{url.replace(/^https?:\/\//, "")}</p>
      </div>
    </main>
  );
}
