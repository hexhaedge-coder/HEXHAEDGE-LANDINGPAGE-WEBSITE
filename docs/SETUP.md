# Setup (website)

The platform is two repositories:

| Repository | Runs on | Holds |
| --- | --- | --- |
| **HEXHAEDGE-LANDINGPAGE-WEBSITE** (this one) | Cloudflare Pages | The static website: landing page, login, member dashboard, staff workspace |
| **[HEXHAEDGE-WEBSITE-BACKEND](https://github.com/hexhaedge-coder/HEXHAEDGE-WEBSITE-BACKEND)** | Render | The API, M-Pesa webhooks, scheduled jobs, and the Firebase security rules |

Firebase (Firestore, Authentication, Storage) is shared by both. Set up the backend first: its README walks
through Firebase and Render. Then come back here.

## 1. Cloudflare

The project in Cloudflare is a **Worker** called `hexhaedge-website`, connected to this repository. It serves
the static files in `public/` (configured in `wrangler.toml`). In Workers & Pages → hexhaedge-website →
Settings → Build:

- **Build command:** leave empty
- **Deploy command:** `npx wrangler deploy`
- **Root directory:** `/`
- **Production branch:** `main`

Security headers and redirects come from `public/_headers` and `public/_redirects`.
The site is served at **https://hexhaedge.com** (custom domain), and still at `hexhaedge-website.hexhaedge.workers.dev`.

## 2. Connect the website to Firebase and the API

Edit `public/assets/js/firebase-config.js`:

1. **firebaseConfig:** Firebase console → Project settings → Your apps → Web app → copy the config.
   These values are public by design; security comes from the rules and the API.
2. **apiBase:** the Render address of `hexhaedge-api`, for example `https://hexhaedge-api.onrender.com`.
3. **appCheckSiteKey** (optional): a reCAPTCHA Enterprise key, if you turn on App Check.

As soon as `projectId` is not the placeholder, demo mode switches off and the site uses real data.

Then, in the backend's Render settings, set `ALLOWED_ORIGINS` to this site's address(es), for example
`https://hexhaedge.com,https://www.hexhaedge.com`. And in Firebase → Authentication → Settings →
Authorized domains, add the same domains.

## 3. Custom domain

Add it in Cloudflare Pages → Custom domains. Then add it to `ALLOWED_ORIGINS` on Render, to Firebase
Authorized domains, and to `APP_URL` on Render (used for links in messages).

## 4. If you use a custom domain for the API

`public/_headers` allows the API on `*.onrender.com`. If you give the API its own domain, add that domain to
`connect-src` in the `/auth`, `/app` and `/staff` blocks of `public/_headers`.
