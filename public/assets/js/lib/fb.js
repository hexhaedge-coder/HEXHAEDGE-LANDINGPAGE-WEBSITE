// Firebase, loaded straight from Google's CDN as ES modules (no build step).
// One version, pinned here.
import { firebaseConfig, functionsRegion, appCheckSiteKey } from "../firebase-config.js";

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
    const [appMod, authMod, fsMod, fnMod, stMod] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
      import(`${CDN}/firebase-functions.js`),
      import(`${CDN}/firebase-storage.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    if (appCheckSiteKey) {
      const ac = await import(`${CDN}/firebase-app-check.js`);
      ac.initializeAppCheck(app, { provider: new ac.ReCaptchaEnterpriseProvider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    }
    const auth = authMod.getAuth(app);
    auth.useDeviceLanguage();
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);
    const db = fsMod.getFirestore(app);
    const functions = fnMod.getFunctions(app, functionsRegion);
    const storage = stMod.getStorage(app);
    return { app, auth, db, functions, storage, A: authMod, F: fsMod, Fn: fnMod, S: stMod };
  })();
  return ready;
}

/** Calls a server function and turns its error into plain words. */
export async function call(name, data = {}) {
  const fb = await firebase();
  try {
    const res = await fb.Fn.httpsCallable(fb.functions, name)(data);
    return res.data;
  } catch (e) {
    const err = new Error(friendly(e));
    err.code = e.code;
    throw err;
  }
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
