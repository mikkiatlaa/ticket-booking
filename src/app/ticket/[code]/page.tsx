import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import QRCode from "qrcode";
import { getTicket } from "@/lib/booking";
import { EVENT, formatEventDate } from "@/lib/event";
import { getBaseUrl } from "@/lib/url";
import { resendEmailAction } from "../../actions";

export default async function TicketPage({ params }: PageProps<"/ticket/[code]">) {
  await connection();
  const { code } = await params;
  const ticket = await getTicket(code);
  if (!ticket) notFound();

  const ticketUrl = `${await getBaseUrl()}/ticket/${ticket.code}`;
  const qrSvg = await QRCode.toString(ticketUrl, { type: "svg", margin: 1 });

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
        {ticket.status === "CONFIRMED" ? "You're in" : "Cancelled"}
      </p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight">See you there, {ticket.name.split(" ")[0]}.</h1>

      <EmailNotice ticket={ticket} />

      <article className="mt-6 overflow-hidden rounded-3xl bg-white text-black">
        <div className="bg-black px-6 pb-5 pt-6 text-white">
          <p className="text-xs uppercase tracking-[0.2em] text-accent">Ticket {ticket.ticket_id}</p>
          <p className="mt-1 text-2xl font-extrabold">{EVENT.name}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {formatEventDate(EVENT.startsAt)} · {EVENT.venue}
          </p>
        </div>
        <div className="flex flex-col items-center px-6 py-6">
          <div className="w-56" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <p className="mt-3 font-mono text-lg font-bold tracking-widest">{ticket.ticket_id}</p>
          <p className="mt-1 text-sm text-zinc-500">{ticket.name}</p>
        </div>
      </article>

      <p className="mt-4 text-center text-xs text-muted">Screenshot this or keep the email — show the QR at the door.</p>
      <Link href="/" className="mt-8 text-center text-sm text-muted underline underline-offset-4">
        Back to event
      </Link>
    </main>
  );
}

function EmailNotice({ ticket }: { ticket: NonNullable<Awaited<ReturnType<typeof getTicket>>> }) {
  const box = "mt-5 rounded-xl border px-4 py-3 text-sm";
  switch (ticket.email_status) {
    case "SENT":
      return (
        <p className={`${box} border-line bg-card text-muted`}>
          Confirmation sent to <span className="font-medium text-foreground">{ticket.email}</span>. Check spam if you
          don&apos;t see it.
        </p>
      );
    case "FAILED":
      return (
        <form action={resendEmailAction} className={`${box} border-danger/40 bg-danger/10 text-danger`}>
          <input type="hidden" name="code" value={ticket.code} />
          Your ticket is booked, but the email didn&apos;t go through.{" "}
          <button className="font-semibold underline underline-offset-4">Send it again</button>
        </form>
      );
    case "SKIPPED":
      return (
        <p className={`${box} border-line bg-card text-muted`}>
          Email sending isn&apos;t set up yet (demo mode).{" "}
          <a href={`/ticket/${ticket.code}/email`} className="font-semibold text-accent underline underline-offset-4">
            Preview the email
          </a>
        </p>
      );
    default:
      return <p className={`${box} border-line bg-card text-muted`}>Sending your confirmation email…</p>;
  }
}
