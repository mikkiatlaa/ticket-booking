import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { setEmailStatus, type Ticket } from "./booking";
import { formatEventDay, formatTime, type Event } from "./event";

export function emailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function ticketQr(ticketUrl: string) {
  return QRCode.toBuffer(ticketUrl, { width: 480, margin: 1 });
}

// Brand colours, written out because email clients ignore CSS variables.
const BLACK = "#000000";
const PINK = "#f3a8ff";
const GREEN = "#18e730";

/** The confirmation email. Inline styles and tables only: that is what email apps understand. */
export function renderTicketEmail(ticket: Ticket, event: Event, ticketUrl: string, qrSrc: string) {
  const where = [event.venue, event.area].filter(Boolean).join(", ");
  const doors = `Doors ${formatTime(event.startsAt)}`;
  return `<!doctype html>
<html lang="en"><body style="margin:0;background:${BLACK};font-family:Helvetica,Arial,sans-serif;color:${PINK}">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${BLACK};padding:28px 12px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px">
      <tr><td style="padding:0 0 18px;font-family:'Arial Black',Arial,sans-serif;font-size:22px;letter-spacing:1px;color:${PINK}">UB</td></tr>
      <tr><td style="border-top:2px solid ${PINK};padding:28px 0 8px">
        <div style="font-family:'Arial Black',Arial,sans-serif;font-size:44px;line-height:1;text-transform:uppercase;color:${GREEN}">Locked in.</div>
        <p style="margin:16px 0 0;font-size:16px;line-height:1.5;color:${PINK}">Hi ${escapeHtml(ticket.name)}, your free ticket is confirmed. Show the QR code below at the door.</p>
      </td></tr>
      <tr><td style="padding:20px 0">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:2px solid ${PINK};border-radius:6px">
          <tr><td style="padding:16px 18px;border-bottom:2px solid ${PINK}">
            <div style="font-family:'Arial Black',Arial,sans-serif;font-size:20px;text-transform:uppercase;color:#ffffff">${escapeHtml(event.name)}</div>
            <div style="margin-top:6px;font-size:14px;color:${PINK}">${escapeHtml(formatEventDay(event.startsAt))} · ${escapeHtml(doors)}</div>
            <div style="margin-top:2px;font-size:14px;color:${PINK}">${escapeHtml(where)}</div>
          </td></tr>
          <tr><td align="center" style="padding:22px 18px">
            <table cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:6px"><tr><td style="padding:10px">
              <img src="${qrSrc}" width="220" height="220" alt="Ticket QR code for ${escapeHtml(ticket.ticket_id)}" style="display:block;border:0">
            </td></tr></table>
            <div style="margin-top:14px;font-family:Menlo,monospace;font-size:20px;font-weight:700;letter-spacing:2px;color:#ffffff">${escapeHtml(ticket.ticket_id)}</div>
            <div style="margin-top:2px;font-size:14px;color:${PINK}">${escapeHtml(ticket.name)}</div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:4px 0 24px">
        <a href="${ticketUrl}" style="display:inline-block;background:${GREEN};color:#000000;text-decoration:none;padding:14px 26px;border-radius:6px;font-family:'Arial Black',Arial,sans-serif;font-size:14px;text-transform:uppercase;letter-spacing:.5px">View ticket online</a>
      </td></tr>
      <tr><td style="border-top:2px solid ${PINK};padding:16px 0 0;font-size:12px;line-height:1.5;color:${PINK}">One ticket per person. Keep this email or screenshot the QR code.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/**
 * Sends the confirmation email and records the outcome on the ticket.
 * Runs after the reservation has committed: a failed email never
 * un-books a ticket, it just leaves email_status = FAILED to retry later.
 */
export async function sendTicketEmail(ticket: Ticket, event: Event, ticketUrl: string) {
  if (!emailConfigured()) {
    console.log(`[email] SMTP not configured — skipped email to ${ticket.email} (${ticketUrl})`);
    await setEmailStatus(ticket.code, "SKIPPED");
    return "SKIPPED" as const;
  }

  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: Number(process.env.SMTP_PORT ?? 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? `${event.name} <${process.env.SMTP_USER}>`,
      to: ticket.email,
      subject: `Your ticket for ${event.name} (${ticket.ticket_id})`,
      text: `Hi ${ticket.name}, your free ticket is confirmed.\n\nTicket: ${ticket.ticket_id}\n${event.name}\n${formatEventDay(event.startsAt)}, doors ${formatTime(event.startsAt)}\nView it here: ${ticketUrl}`,
      html: renderTicketEmail(ticket, event, ticketUrl, "cid:ticket-qr"),
      // Inline attachment: Gmail blocks data: URLs in images.
      attachments: [{ filename: "ticket.png", content: await ticketQr(ticketUrl), cid: "ticket-qr" }],
    });
    await setEmailStatus(ticket.code, "SENT");
    return "SENT" as const;
  } catch (err) {
    console.error(`[email] failed for ${ticket.code}:`, err);
    await setEmailStatus(ticket.code, "FAILED", String((err as Error).message ?? err).slice(0, 500));
    return "FAILED" as const;
  }
}
