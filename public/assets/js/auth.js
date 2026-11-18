// Log in and create profile (P-1, P-2, P-6). Phone + one-time code for members;
// email + password, then an SMS second factor, for staff.
import { initThemeToggles } from "./theme.js";
import { demoMode, firebase, call, friendly } from "./lib/fb.js";

initThemeToggles();

const $ = (s) => document.querySelector(s);
const errorBox = $("#auth-error");
const params = new URLSearchParams(location.search);
const door = params.get("door"); // build | chamber | mindspace, from the landing page

let mode = "login";          // login | signup
let confirmation = null;     // phone sign-in confirmation
let mfa = null;              // { resolver, verificationId }
let verifier = null;
let resendTimer = null;

/* ---------- local lockout after repeated wrong codes (the server also limits) ---------- */
const LOCK_KEY = "hx-code-lock";
function lockedUntil() {
  try { return Number(localStorage.getItem(LOCK_KEY + "-until") || 0); } catch (e) { return 0; }
}
function noteFailure() {
  try {
    const n = Number(localStorage.getItem(LOCK_KEY) || 0) + 1;
    localStorage.setItem(LOCK_KEY, String(n));
    if (n >= 5) {
      localStorage.setItem(LOCK_KEY + "-until", String(Date.now() + 15 * 60000));
      localStorage.setItem(LOCK_KEY, "0");
    }
  } catch (e) { /* ignore */ }
}
function clearFailures() { try { localStorage.removeItem(LOCK_KEY); localStorage.removeItem(LOCK_KEY + "-until"); } catch (e) { /* ignore */ } }

function showError(msg) { errorBox.textContent = msg; errorBox.hidden = !msg; }

function show(id) {
  ["#login-phone", "#login-email", "#signup-phone", "#profile-form", "#code-form"].forEach((s) => { $(s).hidden = s !== id; });
  showError("");
  const f = $(id).querySelector("input");
  if (f) setTimeout(() => f.focus(), 30);
}

function setTab(tab) {
  mode = tab;
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  document.querySelectorAll("[data-panel]").forEach((p) => { p.hidden = p.dataset.panel !== tab; });
  show(tab === "login" ? "#login-phone" : "#signup-phone");
  if (location.hash !== `#${tab}`) history.replaceState(null, "", `${location.pathname}${location.search}#${tab}`);
}

function steps(n) {
  document.querySelectorAll("[data-step-dot]").forEach((d) => d.classList.toggle("on", Number(d.dataset.stepDot) <= n));
}

function phoneE164(raw) {
  let p = String(raw || "").replace(/[\s-]/g, "");
  if (/^\+254[17]\d{8}$/.test(p)) return p;
  if (/^254[17]\d{8}$/.test(p)) return "+" + p;
  if (/^0[17]\d{8}$/.test(p)) return "+254" + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) return "+254" + p;
  return null;
}

async function getVerifier(fb) {
  if (verifier) return verifier;
  verifier = new fb.A.RecaptchaVerifier(fb.auth, "recaptcha-box", { size: "invisible" });
  return verifier;
}

function startResendTimer() {
  const btn = $("#code-resend");
  let s = 45;
  btn.disabled = true;
  clearInterval(resendTimer);
  btn.textContent = `Resend code (${s}s)`;
  resendTimer = setInterval(() => {
    s -= 1;
    btn.textContent = s > 0 ? `Resend code (${s}s)` : "Resend code";
    if (s <= 0) { clearInterval(resendTimer); btn.disabled = false; }
  }, 1000);
}

let lastPhone = null;
async function sendPhoneCode(phone) {
  if (lockedUntil() > Date.now()) {
    const mins = Math.ceil((lockedUntil() - Date.now()) / 60000);
    throw new Error(`Too many wrong codes. Try again in ${mins} minute${mins > 1 ? "s" : ""}.`);
  }
  const fb = await firebase();
  const v = await getVerifier(fb);
  confirmation = await fb.A.signInWithPhoneNumber(fb.auth, phone, v);
  lastPhone = phone;
  $("#code-title").textContent = "Enter the code";
  $("#code-help").textContent = `We sent a 6-digit code to ${phone}.`;
  show("#code-form");
  steps(2);
  startResendTimer();
}

async function afterSignIn(user) {
  const fb = await firebase();
  const token = await user.getIdTokenResult(true);
  const staff = ["admin", "reviewer", "trainer", "practitioner"].some((r) => token.claims[r] === true);
  const profile = await fb.F.getDoc(fb.F.doc(fb.db, "users", user.uid));
  if (!profile.exists() && !staff) {
    // Phone verified but no profile yet: finish the profile step.
    setTab("signup");
    show("#profile-form");
    steps(3);
    $("#p-email").value = user.email || "";
    return;
  }
  clearFailures();
  if (staff) location.href = "/staff/";
  else location.href = door ? `/app/?door=${encodeURIComponent(door)}#services` : "/app/";
}

/* ---------- Wire up ---------- */

document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
document.querySelectorAll("[data-show]").forEach((b) => b.addEventListener("click", () => show("#" + b.dataset.show)));

async function onPhoneSubmit(e) {
  e.preventDefault();
  const input = e.target.querySelector('input[name="phone"]');
  const phone = phoneE164(input.value);
  if (!phone) {
    input.setAttribute("aria-invalid", "true");
    showError("Use a Kenyan mobile number, for example 712 345 678.");
    return;
  }
  input.removeAttribute("aria-invalid");
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await sendPhoneCode(phone);
  } catch (ex) {
    showError(ex.message === "demo" ? "Demo mode: Firebase is not connected yet." : friendly(ex));
    if (verifier) { try { verifier.clear(); } catch (x) { /* ignore */ } verifier = null; }
  } finally {
    btn.disabled = false;
  }
}
$("#login-phone").addEventListener("submit", onPhoneSubmit);
$("#signup-phone").addEventListener("submit", onPhoneSubmit);

$("#code-back").addEventListener("click", () => {
  mfa = null;
  confirmation = null;
  setTab(mode);
  steps(1);
});

$("#code-resend").addEventListener("click", async () => {
  try {
    if (mfa) await sendMfaCode(mfa.resolver);
    else if (lastPhone) await sendPhoneCode(lastPhone);
  } catch (ex) { showError(friendly(ex)); }
});

$("#code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("#code").value.trim();
  if (!/^\d{6}$/.test(code)) { showError("Enter the 6 digits from the SMS."); return; }
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const fb = await firebase();
    let cred;
    if (mfa) {
      const pc = fb.A.PhoneAuthProvider.credential(mfa.verificationId, code);
      cred = await mfa.resolver.resolveSignIn(fb.A.PhoneMultiFactorGenerator.assertion(pc));
    } else {
      cred = await confirmation.confirm(code);
    }
    await afterSignIn(cred.user);
  } catch (ex) {
    noteFailure();
    showError(friendly(ex));
  } finally {
    btn.disabled = false;
  }
});

async function sendMfaCode(resolver) {
  const fb = await firebase();
  const hint = resolver.hints.find((h) => h.factorId === fb.A.PhoneMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw new Error("Your account has no phone set for two-step login. Ask the admin.");
  const provider = new fb.A.PhoneAuthProvider(fb.auth);
  const v = await getVerifier(fb);
  const verificationId = await provider.verifyPhoneNumber({ multiFactorHint: hint, session: resolver.session }, v);
  mfa = { resolver, verificationId };
  $("#code-title").textContent = "Two-step login";
  $("#code-help").textContent = `Enter the code sent to ${hint.phoneNumber || "your phone"}.`;
  show("#code-form");
  startResendTimer();
}

$("#login-email").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const fb = await firebase();
    const cred = await fb.A.signInWithEmailAndPassword(fb.auth, String(f.get("email")).trim(), String(f.get("password")));
    await afterSignIn(cred.user);
  } catch (ex) {
    if (ex && ex.code === "auth/multi-factor-auth-required") {
      try {
        const fb = await firebase();
        await sendMfaCode(fb.A.getMultiFactorResolver(fb.auth, ex));
      } catch (x) { showError(friendly(x)); }
    } else {
      showError(ex.message === "demo" ? "Demo mode: Firebase is not connected yet." : friendly(ex));
    }
  } finally {
    btn.disabled = false;
  }
});

$("#forgot").addEventListener("click", async () => {
  const email = String($("#email").value || "").trim();
  if (!email) { showError("Type your email above first, then press Forgot password."); return; }
  try {
    const fb = await firebase();
    await fb.A.sendPasswordResetEmail(fb.auth, email, { url: `${location.origin}/auth/#login` });
  } catch (ex) { /* same answer either way, so nobody can test which emails exist */ }
  showError("");
  errorBox.hidden = false;
  errorBox.textContent = "If that email has a profile, a reset link is on its way.";
});

$("#profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const f = new FormData(form);
  if (!form.checkValidity()) {
    const bad = form.querySelector(":invalid");
    if (bad) bad.setAttribute("aria-invalid", "true");
    showError(bad && bad.name.startsWith("c_") ? "Please accept the terms and the privacy notice." : "Please fill in your name and a valid email.");
    return;
  }
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    await call("createProfile", {
      name: f.get("name"),
      email: f.get("email"),
      timezone: f.get("timezone"),
      contactChannel: f.get("contactChannel"),
      background: {
        instruments: String(f.get("instruments") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20),
        years: Number(f.get("years") || 0),
        accounts: f.getAll("accounts"),
      },
      consents: {
        terms: f.get("c_terms") === "on",
        privacy: f.get("c_privacy") === "on",
        clips: f.get("c_clips") === "on",
        sessions_ai: f.get("c_sessions_ai") === "on",
        share_chamber_mindspace: f.get("c_share_chamber_mindspace") === "on",
      },
    });
    const fb = await firebase();
    // Ask the inbox to confirm the email (best effort).
    try { await fb.A.sendEmailVerification(fb.auth.currentUser); } catch (x) { /* ignore */ }
    location.href = door ? `/app/?door=${encodeURIComponent(door)}#services` : "/app/";
  } catch (ex) {
    showError(friendly(ex));
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Start ---------- */
if (demoMode) $("#demo-note").hidden = false;
setTab(location.hash === "#signup" ? "signup" : "login");

// Already signed in? Go straight on.
if (!demoMode) {
  firebase().then((fb) => {
    fb.A.onAuthStateChanged(fb.auth, (user) => {
      if (user && !confirmation && !mfa && location.hash !== "#signup") afterSignIn(user).catch(() => undefined);
    });
  }).catch(() => undefined);
}
