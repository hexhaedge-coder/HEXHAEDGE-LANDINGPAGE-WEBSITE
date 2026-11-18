# Setup

Do these in order. Nothing secret ever goes into this repository: secrets live in Google Secret Manager.

## 1. Cloudflare Pages (hosting)

The repository is already connected. In Cloudflare → Workers & Pages → your project → Settings → Build:

- **Build command:** leave empty
- **Build output directory:** `public`
- **Root directory:** `/` (repository root)

`wrangler.toml` says the same thing. Every push to a branch gets a preview URL; `main` is production.
Security headers come from `public/_headers`.

Add your custom domain in Cloudflare when ready, then add it to Firebase in step 3.

## 2. Firebase project

1. Create a project at console.firebase.google.com. Upgrade to **Blaze** (pay as you go). Cloud Storage and
   Cloud Functions require it; the no-cost allowances still apply. Set a **budget alert** (for example US$10).
2. **Firestore:** create the `(default)` database in **production mode**, location **africa-south1**
   (Johannesburg). Confirm the location with the lawyer (PRD N-5); it cannot be changed later.
3. **Storage:** create the default bucket in the same location.
4. **Web app:** Project settings → Your apps → add a Web app. Copy the config into
   `public/assets/js/firebase-config.js`. These values are public by design.

## 3. Authentication

1. Authentication → Sign-in method: enable **Phone** and **Email/Password**.
2. Authentication → Settings → **Authorized domains:** add your `*.pages.dev` domain and your custom domain.
3. **Upgrade to Firebase Authentication with Identity Platform** (Authentication → Settings) and enable
   **SMS multi-factor authentication**. Staff screens refuse to open without it.
4. Phone auth: under Settings → SMS region policy, allow Kenya (and any other country you serve).
5. Optional but recommended: App Check with reCAPTCHA Enterprise. Put the site key in
   `firebase-config.js`, then set `ENFORCE_APP_CHECK=true` in `backend/.env`.

## 4. Rules, indexes and TTL

```
npm install -g firebase-tools
firebase login
cp .firebaserc.example .firebaserc   # put your project id in it
firebase deploy --only firestore:rules,firestore:indexes,storage
```

- Storage rules read Firestore (to check upload tickets). The first deploy asks to grant that permission: say yes.
- `firestore.indexes.json` turns on TTL for `ratelimits.expireAt` and `uploads.expireAt`, so those clean themselves up.

## 5. Functions

```
cd backend
cp .env.example .env        # fill in the plain settings
npm install
```

Set each secret (use the word `unset` for anything you are not using yet):

```
firebase functions:secrets:set MPESA_CONSUMER_KEY
firebase functions:secrets:set MPESA_CONSUMER_SECRET
firebase functions:secrets:set MPESA_PASSKEY
firebase functions:secrets:set MPESA_CALLBACK_TOKEN     # any long random string
firebase functions:secrets:set AT_API_KEY
firebase functions:secrets:set WHATSAPP_TOKEN
firebase functions:secrets:set RESEND_API_KEY
firebase functions:secrets:set CLOUDINARY_API_SECRET
```

Then `firebase deploy --only functions`. After the first deploy, put the real functions base URL in
`PAYMENTS_CALLBACK_BASE` in `backend/.env` and deploy again.

**Signed clip links** need the functions' service account to sign URLs: in Google Cloud → IAM, give the
default compute service account the role **Service Account Token Creator** on itself.

If deploying to `africa-south1` fails for any product, use `europe-west1` in both
`backend/src/config.js` (REGION) and `public/assets/js/firebase-config.js` (functionsRegion).

## 6. First admin

1. Create your own profile on the site (or an email/password user in the Firebase console).
2. Download a service account key (Project settings → Service accounts) and keep it **outside** this repo.
3. `GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node scripts/bootstrap-admin.js you@example.com`
4. Log in at `/auth/` with email and password. The staff page asks you to turn on two-step login.
5. From then on, give roles in **Staff and roles**.

## 7. Providers

| Provider | What to do |
| --- | --- |
| **M-Pesa (Daraja)** | Create an app at developer.safaricom.co.ke. Sandbox works at once (shortcode 174379). Production needs a **Safaricom-issued** Paybill or Till and go-live approval. Then press **Register Paybill confirmation URLs** in Payments. |
| **Africa's Talking (SMS)** | Create an account, set `AT_USERNAME` and the API key. Register a sender ID if you want "HexhaEdge" as the sender. |
| **WhatsApp** | WhatsApp Business Platform: create a template named `hx_notice` (Utility, English) with one body variable `{{1}}`. Set `WHATSAPP_PHONE_ID` and the token. |
| **Email (Resend)** | Verify your domain, set `EMAIL_FROM` and the API key. |
| **Cloudinary** | Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and the secret. Only profile photos use it. |

Anything not set is skipped and logged; members still get the message in the app.

## 8. First run checklist

- Settings → set the **no-trade calendar**, fees, and confirm the gates.
- Calendar → publish review slots for the coming week (the Friday cut-off skips penalties when no slots exist).
- Training → each trainer sets hours and a standing Google Meet link. Settings → Friday X Space link.
- Health → check that scheduled jobs have run.
- Do a test restore of a Firestore export before launch (PRD N-7): `gcloud firestore export gs://your-backup-bucket`.
