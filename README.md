# Free Ticket Booking — MVP

Scan a QR code → reserve a free general-admission ticket → get an email with your ticket QR.

## Run the class demo

```bash
npm install
npm run reset     # wipe test bookings (local database only)
npm run demo      # build + start on your Wi-Fi network
```

1. Open `http://<your-laptop-ip>:3000/present` on the projector (find the IP with `ipconfig getifaddr en0`).
   **Open it via the IP, not `localhost`**, so the QR code points somewhere phones can reach.
2. Classmates scan the QR, fill in name + email, and get their ticket.
3. The counter on the projector updates live as tickets are claimed.

Phones must be on the **same Wi-Fi** as the laptop. Some school networks block device-to-device
traffic — if phones can't load the page, use your phone's hotspot or deploy it (see below).

## Pages

| URL | What |
|---|---|
| `/` | Event page + reservation form |
| `/present` | Projector view: big QR code + live counter |
| `/ticket/<code>` | The attendee's ticket |
| `/ticket/<code>/email` | Browser preview of the confirmation email |
| `/api/stats` | `{ capacity, reserved, remaining }` |

Edit the event (name, date, venue, capacity) in `src/lib/event.ts`.

## Email

Without setup, bookings work and the ticket page links to an email preview ("demo mode").
To send real emails, copy `.env.example` to `.env.local` and set `SMTP_USER` / `SMTP_PASS`
using a Gmail **App Password**. Gmail allows ~500 emails/day, plenty for a class.

## How it avoids overselling

The logic follows the seat-hold / concurrency guide this project is based on, simplified for
free general-admission tickets (no seat map, no payment, so no hold timer is needed):

- **One conditional update claims a spot:** `UPDATE events SET reserved = reserved + 1 WHERE reserved < capacity`.
  Postgres locks the row, so simultaneous requests queue and each re-checks the condition.
- **The database is the final guard:** `CHECK (reserved <= capacity)` and a unique index on
  `(event, lower(email))` refuse invalid data even if the app code had a bug.
- **Idempotency:** every form load gets a key. Double-clicks and retries return the same ticket.
- **Short transaction, side effects after commit:** the email is sent after the booking is saved.
  A failed email never cancels a ticket; it's marked `FAILED` and can be re-sent from the ticket page.

Prove it: `npm run stress` fires 204 simultaneous requests at a 50-ticket event on a throwaway database
and checks the invariants.

## Deploying online (optional)

Deploy to Vercel, add a Postgres database (Neon via the Vercel Marketplace), and set
`DATABASE_URL`, `PUBLIC_URL`, `SMTP_USER`, `SMTP_PASS` in the project's environment variables.
The local database (`.pglite`) does not work on Vercel.
