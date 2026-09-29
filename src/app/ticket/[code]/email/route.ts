import QRCode from "qrcode";
import { getTicket } from "@/lib/booking";
import { renderTicketEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/url";

// Shows the confirmation email in the browser — handy for demos without SMTP.
export async function GET(_req: Request, ctx: RouteContext<"/ticket/[code]/email">) {
  const { code } = await ctx.params;
  const ticket = await getTicket(code);
  if (!ticket) return new Response("Not found", { status: 404 });

  const ticketUrl = `${await getBaseUrl()}/ticket/${ticket.code}`;
  const qr = await QRCode.toDataURL(ticketUrl, { width: 480, margin: 1 });
  return new Response(renderTicketEmail(ticket, ticketUrl, qr), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
