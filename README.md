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
  assets/js/firebase-config.js   Firebase web config and the API address  ← fill this in
  _headers, _redirects  Cloudflare security headers (CSP) and short links
  sw.js                 Service worker: instant repeat visits, works on bad connections
docs/                   Setup, security model and PRD coverage
```

**The backend is in a separate repository:**
[HEXHAEDGE-WEBSITE-BACKEND](https://github.com/hexhaedge-coder/HEXHAEDGE-WEBSITE-BACKEND). It runs on
Render (the API, M-Pesa webhooks and scheduled jobs) and holds the Chamber rules engine and the Firebase
security rules.

## Stack decisions

| Need | Choice | Why |
| --- | --- | --- |
| Website hosting | **Cloudflare Pages** | Static site, global CDN. Output folder `public`, no build command. |
| API and scheduled jobs | **Render** (Frankfurt), backend repo | Rules engine, M-Pesa callbacks, reminders and counting jobs run without a person. |
| Database, login | **Firebase** Firestore + Authentication | Phone one-time codes for members, SMS second factor for staff. |
| Profile images | **Cloudinary** (signed uploads) | Only profile photos go here. |
| Trading clips and dashboard evidence | **Firebase Storage** (private) | See below. |
| Payments | Safaricom Daraja: STK Push + C2B | P-9 to P-13 |

**Why the clips do not go to a video platform.** The SOD/EOD clips are personal financial records under
the Data Protection Act. They must never have public addresses (PRD N-3), need resumable uploads (C-2) and
must be deletable on a schedule (N-9). Firebase Storage does all three, behind the same login and rules as
the database. Mux's free plan stores only 10 videos (the pilot makes about 200 clips a month); Cloudinary's
free plan is 25 credits a month shared with images; Cloudflare Stream has no free plan.

## Quick start

1. Set up the backend first (Firebase + Render): see the backend repository's README.
2. Fill in `public/assets/js/firebase-config.js`: the Firebase web config and `apiBase` (the Render API address).
3. In Cloudflare Pages: build command empty, output directory `public`.

Details: **[docs/SETUP.md](docs/SETUP.md)**.

## Before launch

The PRD's open items are listed in **[docs/PRD-COVERAGE.md](docs/PRD-COVERAGE.md)**. The most important:
lawyer review of all legal wording, consent text, the Capital description and data hosting; confirm the
Chamber fee; the Safaricom Paybill/Till go-live; SMS sender ID; WhatsApp template; the MindSpace escalation
path with a qualified professional; and the business registration details in the footer.
