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
  const code = (e && e.code) || "";
  const msg = (e && e.message) || "";
  if (code.endsWith("unauthenticated")) return "Please log in again.";
  if (code.endsWith("resource-exhausted") || code.includes("too-many-requests")) return "Too many attempts. Please wait a few minutes and try again.";
  if (code.includes("network-request-failed") || code.endsWith("unavailable")) return msg && !msg.startsWith("internal") ? msg : "No connection. Check your internet and try again.";
  if (code.includes("invalid-verification-code")) return "That code is not right. Check the SMS and try again.";
  if (code.includes("code-expired")) return "That code has expired. Ask for a new one.";
  if (code.includes("invalid-phone-number")) return "That phone number does not look right.";
  if (code.includes("wrong-password") || code.includes("invalid-credential") || code.includes("invalid-login-credentials")) return "Email or password is not right.";
  if (code.includes("user-not-found")) return "No profile with those details.";
  if (code.includes("requires-recent-login")) return "For your safety, log in again and repeat this.";
  if (code.includes("captcha")) return "The security check did not finish. Please try again.";
  if (msg && !/^(internal|INTERNAL)$/.test(msg)) return msg.replace(/^Firebase: /, "").replace(/\(auth\/[^)]+\)\.?/, "").trim();
  return "Something went wrong. Please try again.";
}
