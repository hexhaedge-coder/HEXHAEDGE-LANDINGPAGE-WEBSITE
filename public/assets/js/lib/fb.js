// Firebase, loaded straight from Google's CDN as ES modules (no build step).
// One version, pinned here.
import { firebaseConfig, apiBase, appCheckSiteKey } from "../firebase-config.js";

const V = "12.11.0";
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

export const demoMode =
  firebaseConfig.projectId === "YOUR_PROJECT_ID" || new URLSearchParams(location.search).has("demo");

let ready = null;

/** Loads and initialises Firebase once. Returns the SDK functions and instances. */
export function firebase() {
  if (demoMode) return Promise.reject(new Error("demo"));
  if (ready) return ready;
  ready = (async () => {
    const [appMod, authMod, fsMod, stMod] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
      import(`${CDN}/firebase-storage.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    let appCheck = null;
    let AC = null;
    if (appCheckSiteKey) {
      AC = await import(`${CDN}/firebase-app-check.js`);
      appCheck = AC.initializeAppCheck(app, { provider: new AC.ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    }
    const auth = authMod.getAuth(app);
    auth.useDeviceLanguage();
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);
    const db = fsMod.getFirestore(app);
    const storage = stMod.getStorage(app);
    return { app, auth, db, storage, appCheck, A: authMod, F: fsMod, S: stMod, AC };
  })();
  return ready;
}

/**
 * Calls an action on the HexhaEdge API (Render) with the member's Firebase ID
 * token, and turns any error into plain words.
 */
export async function call(name, data = {}) {
  const fb = await firebase();
  const user = fb.auth.currentUser;
  if (!user) throw Object.assign(new Error("Please log in again."), { code: "unauthenticated" });
  const headers = { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" };
  if (fb.appCheck) {
    try { headers["X-Firebase-AppCheck"] = (await fb.AC.getToken(fb.appCheck)).token; } catch (e) { /* the server decides */ }
  }
  let res;
  try {
    res = await fetch(`${apiBase}/api/${encodeURIComponent(name)}`, { method: "POST", headers, body: JSON.stringify({ data }), credentials: "omit", cache: "no-store" });
  } catch (e) {
    throw Object.assign(new Error("No connection to HexhaEdge. Check your internet and try again."), { code: "unavailable" });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    const err = new Error(friendly({ code: e.status || `http-${res.status}`, message: e.message || "" }));
    err.code = e.status || `http-${res.status}`;
    throw err;
  }
  return json.result;
}

export function friendly(e) {
  const code = String((e && e.code) || "");
  const msg = String((e && e.message) || "");
  const has = (c) => code.includes(c) || msg.includes(c);
  if (has("operation-not-allowed")) return "Phone or email sign-in is not switched on in Firebase yet. (auth/operation-not-allowed)";
  if (has("unauthorized-domain")) return "This website address is not on Firebase's list of authorized domains yet. (auth/unauthorized-domain)";
  if (has("invalid-app-credential") || has("app-not-authorized")) return "Firebase did not accept this website for SMS codes. Check Authorized domains in Firebase. (auth/invalid-app-credential)";
  if (has("billing-not-enabled")) return "SMS codes need the Firebase project on the Blaze plan. (auth/billing-not-enabled)";
  if (has("quota-exceeded")) return "The daily limit for SMS codes was reached. Try again later. (auth/quota-exceeded)";
  if (has("admin-restricted-operation") || has("region")) return "SMS to this country is not allowed in Firebase's SMS region policy yet.";
  if (code.endsWith("unauthenticated")) return "Please log in again.";
  if (code.endsWith("resource-exhausted") || has("too-many-requests")) return "Too many attempts. Please wait a few minutes and try again.";
  if (has("network-request-failed") || code.endsWith("unavailable")) return msg && !/^(internal|Error)$/i.test(msg) && !msg.startsWith("Firebase:") ? msg : "No connection. Check your internet and try again.";
  if (has("invalid-verification-code")) return "That code is not right. Check the SMS and try again.";
  if (has("code-expired")) return "That code has expired. Ask for a new one.";
  if (has("invalid-phone-number")) return "That phone number does not look right.";
  if (has("wrong-password") || has("invalid-credential") || has("invalid-login-credentials")) return "Email or password is not right.";
  if (has("user-not-found")) return "No profile with those details.";
  if (has("requires-recent-login")) return "For your safety, log in again and repeat this.";
  if (has("captcha")) return "The security check did not finish. Please try again.";
  const auth = (msg.match(/\((auth\/[^)]+)\)/) || [])[1] || (code.startsWith("auth/") ? code : "");
  if (auth) return `Something went wrong (${auth}). Please try again, or tell HexhaEdge this code.`;
  if (msg && !/^(internal|error)$/i.test(msg)) return msg.replace(/^Firebase: /, "").trim();
  return "Something went wrong. Please try again.";
}
