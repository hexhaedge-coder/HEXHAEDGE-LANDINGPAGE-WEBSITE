// Small UI helpers. Every value goes through html`` which escapes it, so
// member-written text can never become markup (XSS).

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
export const esc = (v) => String(v === undefined || v === null ? "" : v).replace(/[&<>"'`]/g, (c) => ESC[c]);

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
/** Marks a string as already-safe markup (only for markup we wrote). */
export const raw = (s) => new Raw(String(s));

function part(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join("");
  if (v === false || v === null || v === undefined) return "";
  return esc(v);
}

/** Tagged template: escapes every interpolated value. Returns Raw. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return new Raw(out);
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function mount(el, content) {
  el.innerHTML = String(content);
}

/* ---------- Toasts ---------- */
let toastBox;
export function toast(message, kind = "") {
  if (!toastBox) {
    toastBox = document.createElement("div");
    toastBox.className = "toasts";
    toastBox.setAttribute("role", "status");
    toastBox.setAttribute("aria-live", "polite");
    document.body.appendChild(toastBox);
  }
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.textContent = message;
  toastBox.appendChild(t);
  setTimeout(() => t.remove(), kind === "bad" ? 7000 : 4200);
}

/* ---------- Dialog sheets ---------- */
/**
 * Opens a sheet. `body` is Raw markup; returns the dialog element.
 * onSubmit(formData, dialog) runs on the first form inside; return false to keep it open.
 */
export function sheet({ title, body, submitLabel, onSubmit, danger = false, wide = false }) {
  const d = document.createElement("dialog");
  d.className = "sheet" + (wide ? " sheet-wide" : "");
  d.innerHTML = String(html`
    <form method="dialog" class="sheet-form" novalidate>
      <div class="sheet-head">
        <h2 class="sheet-title">${title}</h2>
        <button class="icon-btn" type="button" data-close aria-label="Close">${raw(ICON.x)}</button>
      </div>
      <div class="sheet-body">${body}<p class="error-text" data-error hidden></p></div>
      ${submitLabel ? html`<div class="sheet-foot">
        <button class="btn btn-ghost" type="button" data-close>Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="submit">${submitLabel}</button>
      </div>` : ""}
    </form>`);
  document.body.appendChild(d);
  const form = d.querySelector("form");
  const err = d.querySelector("[data-error]");
  d.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => d.close()));
  d.addEventListener("close", () => d.remove());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!onSubmit) return d.close();
    const btn = form.querySelector('button[type="submit"]');
    err.hidden = true;
    btn.disabled = true;
    try {
      const keep = await onSubmit(new FormData(form), d);
      if (keep !== false) d.close();
    } catch (ex) {
      err.textContent = ex.message || String(ex);
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
  d.showModal();
  const first = d.querySelector("input, select, textarea");
  if (first) first.focus();
  return d;
}

export function confirmSheet(title, text, label = "Confirm", danger = false) {
  return new Promise((resolve) => {
    let ok = false;
    const d = sheet({ title, body: html`<p>${text}</p>`, submitLabel: label, danger, onSubmit: () => { ok = true; } });
    d.addEventListener("close", () => resolve(ok));
  });
}

/** Runs an async action on a button, with a busy state and a toast on error. */
export async function busy(btn, fn, okMessage) {
  if (btn) { btn.disabled = true; btn.setAttribute("aria-busy", "true"); }
  try {
    const r = await fn();
    if (okMessage) toast(okMessage);
    return r;
  } catch (e) {
    toast(e.message || "Something went wrong.", "bad");
    return undefined;
  } finally {
    if (btn) { btn.disabled = false; btn.removeAttribute("aria-busy"); }
  }
}

/* ---------- Formatting ---------- */
export const TZ = "Africa/Nairobi";
export function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === "function") return v.toDate();
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  return null;
}
export function fmtDate(v, tz = TZ) {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  }
  const d = toDate(v);
  return d ? d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", timeZone: tz }) : "—";
}
export function fmtTime(v, tz = TZ) {
  const d = toDate(v);
  return d ? d.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }) : "—";
}
export function fmtDateTime(v, tz = TZ) {
  const d = toDate(v);
  return d ? `${fmtDate(d, tz)}, ${fmtTime(d, tz)}` : "—";
}
export function fmtKes(n) { return "KES " + Number(n || 0).toLocaleString("en-KE"); }
export function dateKey(d = new Date(), tz = TZ) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function addDays(key, n) {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function relTime(v) {
  const d = toDate(v);
  if (!d) return "";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return fmtDate(d);
}

/* ---------- Status pills ---------- */
const STATE_TEXT = {
  none: ["Not yet in", "mute"], applicant: ["Applied", "info"], onboarding: ["Writing plan", "info"], plan_review: ["Plan in review", "info"],
  active: ["Active", "ok"], timeout: ["Timeout", "bad"], paused: ["Paused", "warn"], suspended: ["Suspended", "bad"],
  plan_rewrite: ["Plan rewrite", "info"], exited: ["Left", "mute"], disqualified: ["Removed", "bad"], declined: ["Not this time", "mute"],
  accepted: ["Accepted", "info"], invited: ["Invited", "ok"], revoked: ["Not invited", "mute"],
  on_time: ["On time", "ok"], late: ["Late", "warn"], missing: ["Not submitted", "bad"], pending: ["Waiting", "mute"], excused: ["Excused", "info"],
  paid: ["Paid", "ok"], unpaid: ["Unpaid", "warn"], failed: ["Failed", "bad"], expired: ["Expired", "warn"],
  booked: ["Booked", "info"], done: ["Done", "ok"], missed: ["Missed", "bad"], moved: ["Moved", "warn"], cancelled: ["Cancelled", "mute"],
  issued: ["Proposed", "warn"], confirmed: ["Confirmed", "bad"], reversed: ["Reversed", "mute"], dismissed: ["Dismissed", "mute"], escalated: ["With admin", "bad"],
  scheduled: ["Scheduled", "info"], open: ["Open", "info"], submitted: ["Submitted", "info"], checked: ["Checked", "ok"],
  draft: ["Draft", "mute"], review: ["In review", "info"], locked: ["Locked", "ok"], replaced: ["Replaced", "mute"],
  minor: ["Minor", "warn"], serious: ["Serious", "bad"], critical: ["Critical", "bad"],
  ok: ["OK", "ok"], bad: ["Attention", "bad"], warn: ["Check", "warn"], info: ["Note", "info"],
};
export function pill(state, label) {
  const [text, kind] = STATE_TEXT[state] || [state || "—", "mute"];
  return html`<span class="pill pill-${kind}">${label || text}</span>`;
}

/* ---------- Timeout pips: red while counting, number always shown (N-10) ---------- */
export function pips(total, remaining) {
  const t = Math.max(0, Math.min(10, total || 0));
  const used = t - (remaining || 0);
  const dots = [];
  for (let i = 0; i < t; i++) dots.push(html`<span class="pip ${i < used ? "done" : "on"}"></span>`);
  return html`<span class="pips" role="img" aria-label="${remaining} of ${t} timeout days left">${dots}</span><span class="pip-num num">${remaining} of ${t} days left</span>`;
}

/* ---------- Icons (stroke, currentColor) ---------- */
const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  x: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  home: I('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>'),
  grid: I('<path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="M12 22V12M21 7l-9 5-9-5"/>'),
  card: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>'),
  chat: I('<path d="M4 5h16v11H9l-5 4z"/>'),
  gear: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  bell: I('<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>'),
  video: I('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>'),
  upload: I('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>'),
  calendar: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  lock: I('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  check: I('<path d="m5 12 5 5 9-10"/>'),
  arrow: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  back: I('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  pause: I('<path d="M9 5v14M15 5v14"/>'),
  play: I('<path d="m7 4 13 8-13 8z"/>'),
  logout: I('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'),
  shield: I('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>'),
};
