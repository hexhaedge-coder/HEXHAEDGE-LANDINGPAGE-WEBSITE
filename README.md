# HexhaEdge platform — release 1

One website, one login. A trader's profile follows them across the four doors:
**Build Your Edge** (training), **Follow Your Edge** (the Chamber),
**Execute Your Edge** (HexhaEdge Capital, by invitation) and **Talk Your Edge** (MindSpace).
Release 1 is the landing page, profiles and login, the member dashboard, and the Chamber automation.

## See it now (no setup)

Until Firebase is connected, the site runs in **demo mode** with sample data:

| Page | Link (on your Cloudflare Pages URL) |
| --- | --- |
| Landing page | `/` |
| Log in / create profile | `/auth/` |
| Dashboard: new member | `/app/?demo=new` |
| Dashboard: trainee in the Chamber | `/app/?demo=chamber` |
| Dashboard: paused, invited to Capital | `/app/?demo=paused` |
| Staff workspace (reviewer + admin) | `/staff/?demo=1` |

## What is in this repository

```
public/                 The website. Static files, no build step. Cloudflare Pages serves this folder.
  index.html            Landing page (black hero band, 14-second logo animation, four doors)
  auth/                 Log in and create profile (phone + one-time code; email + password + SMS for staff)
  app/                  Member dashboard (mobile first, floating dock, installable as a web app)
  staff/                Reviewer, trainer, MindSpace and admin workspace (laptop)
  legal/                Terms, Privacy, Risk statement (drafts for the lawyer)
  assets/               CSS, JavaScript modules, logo and door emblems
  _headers, _redirects  Cloudflare security headers (CSP) and short links
  sw.js                 Service worker: instant repeat visits, works on bad connections
backend/                Firebase Cloud Functions (Node 22)
  src/engine.js         The Chamber rules engine: pure, deterministic, unit-tested
  src/*.js              Profiles, consent, Chamber, bookings, M-Pesa, training, admin, jobs
  test/                 Engine unit tests (run with: cd backend && npm test)
  test-rules/           Firestore security-rules tests (run against the emulator)
firestore.rules         Strict, deny-by-default database rules
storage.rules           Private clip and evidence storage rules
firestore.indexes.json  Query indexes and TTL policies
firebase.json           Firebase project wiring
docs/                   Setup, security model and PRD coverage
```

## Stack decisions

| Need | Choice | Why |
| --- | --- | --- |
| Hosting | **Cloudflare Pages** (already connected to this repo) | Static site, global CDN, free. Output folder `public`, no build command. |
| Database, login | **Firebase** Firestore + Authentication | As requested. Phone one-time codes for members, SMS second factor for staff. |
| Server logic and schedules | **Firebase Cloud Functions** (2nd gen) | Rules engine, M-Pesa callbacks, reminders and counting jobs run on time without a person. |
| Profile images | **Cloudinary** (signed uploads) | As requested. Only profile photos go here. |
| Trading clips and dashboard evidence | **Firebase Storage** (private) | See below. |
| Payments | Safaricom Daraja: STK Push + C2B | P-9 to P-13 |
| SMS / WhatsApp / email | Africa's Talking / WhatsApp Cloud API / Resend | Each switches off cleanly until its key is set |

**Why the clips do not go to a video platform.** The SOD/EOD clips are personal financial records under
the Data Protection Act. They must never have public addresses (PRD N-3), need resumable uploads (C-2) and
must be deletable on a schedule (N-9). Firebase Storage does all three, behind the same login and rules as
the database, and costs nothing extra to run alongside it. The free video platforms do not fit: Mux's free
plan stores only 10 videos (the pilot makes about 200 clips a month); Cloudinary's free plan is 25 credits a
month shared with images, and putting private clips there adds another processor with signed-delivery setup;
Cloudflare Stream has no free plan. A 10-second screen recording plays in every modern browser as recorded,
so no transcoding service is needed (the PRD reaches the same conclusion). At 5 members, storage is about
1 GB a month before retention deletes old clips.

## Quick start

Full steps are in **[docs/SETUP.md](docs/SETUP.md)**. In short:

1. Create the Firebase project on the Blaze plan (it still has a no-cost tier), region `africa-south1`.
2. Paste the web config into `public/assets/js/firebase-config.js` — demo mode switches off.
3. `firebase deploy --only firestore,storage` then set the secrets and `firebase deploy --only functions`.
4. Make yourself admin: `cd backend && node scripts/bootstrap-admin.js you@example.com`, then enrol two-step login.
5. In Cloudflare Pages: build command empty, output directory `public`.

## Checks

```
cd backend
npm test            # 16 rules-engine tests (no install needed)
npm run test:rules  # security-rules tests (needs Firebase CLI, Java, npm install)
```

## Before launch

The PRD's open items are listed in **[docs/PRD-COVERAGE.md](docs/PRD-COVERAGE.md)**. The most important:
lawyer review of all legal wording, consent text, the Capital description and data hosting; confirm the
Chamber fee; the Safaricom Paybill/Till go-live; SMS sender ID; WhatsApp template; the MindSpace escalation
path with a qualified professional; and the business registration details in the footer.
