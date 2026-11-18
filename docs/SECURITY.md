# Security and privacy model

The rules, server code and their tests are in the [HEXHAEDGE-WEBSITE-BACKEND](https://github.com/hexhaedge-coder/HEXHAEDGE-WEBSITE-BACKEND) repository (`firebase/` and `src/`). This website repository holds only the static site and its security headers.

## Principles

1. **Deny by default.** Every Firestore collection is listed in `firebase/firestore.rules`; anything unlisted is closed.
2. **The server decides.** Plans, daily records, rulings, timeouts, suspensions, bookings, payments,
   roles, settings and the audit log are written only by the HexhaEdge API on Render. The app cannot write them at all,
   even with a modified browser. Members can write only: safe profile fields, "mark as read" on their own
   notices, and messages in their own thread.
3. **Least access.** A member reads only their own records (M-1). A reviewer reads Chamber data only; a
   trainer only their own trainees; a practitioner MindSpace. MindSpace notes are readable only by the
   practitioner who wrote them and the admin (T-4). The Chamber sees MindSpace attendance only if the
   member gave the sharing consent.
4. **Two-step login for staff.** Rules and functions both require a role claim *and* a completed SMS
   second factor (N-3). Roles are custom claims set only by an admin through `setRoles`.
5. **Clips are never public.** Storage rules deny every read. Playback is a 10-minute signed link made by
   `getClipUrl`, which checks the role and writes an audit entry. Uploads are write-once and must match a
   server-issued ticket for that member, day and clip kind. Upload timing comes from Storage, not from the
   phone, so it cannot be typed in.
6. **No broker credentials, ever.** There is no field anywhere for a broker or prop firm login, password
   or API key (N-4). Evidence requests ask for files from the dashboard only, and are deleted after the
   check unless a ruling depends on them.
7. **Append-only audit log.** Every rule decision, timeout, suspension, pause, override, payment change and
   consent change is written with who, when and why (P-16). Rules forbid any client write; the server code
   never updates an entry. Members can read their own entries.

## Other protections

- **Rate limits** on every API action (and per IP at the server), per user and action (N-3); Firebase also throttles SMS codes,
  and the login page locks for 15 minutes after five wrong codes.
- **Payments:** Daraja callbacks carry a secret token (compared in constant time), and an STK "paid"
  callback is confirmed again with an STK query before anything is marked paid. Repeated callbacks are ignored.
- **Input validation** on every function argument; rules validate the profile fields members can edit.
- **XSS:** all rendering goes through an escaping template (`html```), so member text never becomes markup.
- **Content Security Policy** in `public/_headers`: the landing and legal pages allow scripts only from this
  site; the app pages add only Firebase, reCAPTCHA, Cloudinary and the API on onrender.com. Also HSTS, no framing, no sniffing.
- **Outage rule (N-8):** the hourly health check switches outage mode on after repeated upload failures;
  while it is on, no automatic violation is issued and missing clips are recorded as excused.
- **Staff screens** are never cached on the device (`Cache-Control: no-store`, excluded from the service worker).

## Data protection (Kenya, DPA 2019) — for the lawyer

- Processors to list in the privacy notice and to sign agreements with: Google (Firebase), Render (API servers in Frankfurt), Cloudflare,
  Cloudinary, Safaricom, Africa's Talking, Meta (WhatsApp), Resend.
- Data location: Firestore and Storage in `africa-south1` (South Africa); the API processes requests on Render in Frankfurt (Germany). Transfers outside Kenya need
  adequate safeguards or consent: confirm.
- MindSpace records are health-related (sensitive): explicit consent, separate storage and access list are
  built; a data protection impact assessment may be needed before launch.
- Retention periods are settings (Rule settings → Retention); the daily job deletes on schedule.
- Breach plan (N-6): detect (health check and alerts), assess, fix, report to the ODPC within 72 hours, tell
  affected members. The written plan itself is still to be prepared.
