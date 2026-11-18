// HexhaEdge member dashboard: one place to see where you are active, paused
// or not yet in, across all four services. Mobile first.
import { initThemeToggles } from "../theme.js";
import { demoMode, firebase, friendly } from "../lib/fb.js";
import {
  html, raw, $, $$, mount, toast, sheet, confirmSheet, busy, pill, pips, ICON,
  fmtDate, fmtTime, fmtDateTime, fmtKes, dateKey, addDays, relTime, toDate,
} from "../lib/ui.js";
import { SERVICES, PLAN_CATEGORIES, FIRM_CATEGORIES, RULE_LABELS, CONSENTS, loadMember, act } from "./data.js";

initThemeToggles();

const view = $("#view");
let S = null;                 // the member's state
let route = "overview";
let chatUnsub = null;
const params = new URLSearchParams(location.search);

/* ------------------------------------------------------------------ */
/* Shell                                                                */
/* ------------------------------------------------------------------ */

const NAV = [
  ["overview", "Overview", ICON.home],
  ["services", "Services", ICON.grid],
  ["billing", "Billing", ICON.card],
  ["messages", "Messages", ICON.chat],
  ["settings", "Settings", ICON.gear],
];
$$("[data-nav]").forEach((a) => {
  const [, label, icon] = NAV.find((n) => n[0] === a.dataset.nav);
  a.innerHTML = `${icon}<span>${label}</span>`;
});

function paintShell() {
  const unread = (S.notifications || []).filter((n) => !n.read).length;
  $("#bell").innerHTML = String(html`${raw(ICON.bell)}${unread ? html`<span class="count" aria-label="${unread} unread">${unread}</span>` : ""}`);
  const name = (S.profile && S.profile.name) || "";
  $("#me").innerHTML = S.profile && S.profile.avatarUrl
    ? String(html`<img class="avatar" src="${S.profile.avatarUrl}" alt="" width="40" height="40">`)
    : String(html`<span class="avatar" aria-hidden="true">${name ? name[0].toUpperCase() : "·"}</span>`);
  const top = { chamber: "services", plan: "services", record: "services", build: "services", mindspace: "services", capital: "services", notifications: "overview" }[route] || route;
  $$("[data-nav]").forEach((a) => { if (a.dataset.nav !== top) a.removeAttribute("aria-current"); else a.setAttribute("aria-current", "page"); });
}

function firstName() { return ((S.profile && S.profile.name) || "there").split(" ")[0]; }
function m(service) { return (S.memberships || {})[service] || null; }
function st(service) { const x = m(service); return x ? x.state : "none"; }
function lockedPlans() { return (S.plans || []).filter((p) => p.status === "locked"); }
function activeTimeouts() { return (S.timeouts || []).filter((t) => t.status === "active" || t.status === "frozen"); }
function backTo(hash, label) { return html`<a class="back-link" href="#${hash}">${raw(ICON.back)} ${label}</a>`; }

/* ------------------------------------------------------------------ */
/* Overview                                                             */
/* ------------------------------------------------------------------ */

function serviceStatusLine(service) {
  const x = m(service);
  if (service === "capital") return x && x.state === "invited" ? "You are invited. Details are in your email." : x && x.state === "active" ? "Active." : "By invitation only.";
  if (!x) return { build: "One-on-one training on the live market.", chamber: "Accountability for the plan you write.", mindspace: "A place to talk things through." }[service];
  if (service === "chamber") {
    if (x.state === "timeout") return "Timeout running. Clips still due each trading day.";
    if (x.state === "paused") return "Paused. Clips are not needed while paused.";
    if (x.state === "onboarding") return "Next: write your plan.";
    if (x.state === "plan_review") return x.awaitingPayment ? "Plan locked. Pay the fee to start." : "Your plan is with a reviewer.";
    if (x.state === "suspended") return "Suspended. Next step: a MindSpace session.";
  }
  if (service === "build" && x.state === "accepted") return "Accepted. Next: agreements and payment.";
  return "";
}

function serviceCard(service) {
  const s = SERVICES[service];
  const state = service === "capital" && !m("capital") ? null : st(service);
  const href = { build: "#build", chamber: "#chamber", capital: "#capital", mindspace: "#mindspace" }[service];
  return html`
    <a class="card svc-card" href="${href}">
      <span class="badge-ring"><img src="${s.logo}" alt="${s.name} logo"></span>
      <div>
        <h3>${s.name}</h3>
        <p class="sub">${s.sub}</p>
        ${state ? pill(state === "none" ? "none" : state) : pill("none", "By invitation")}
        <p class="small muted">${serviceStatusLine(service)}</p>
      </div>
    </a>`;
}

function mindspaceBanner() {
  if (S.profile && S.profile.metMindspace) return "";
  return html`
    <section class="banner banner-mind" aria-labelledby="ms-first">
      <span class="badge-ring"><img src="${SERVICES.mindspace.logo}" alt="Talk Your Edge logo"></span>
      <div>
        <h3 id="ms-first">Start with MindSpace</h3>
        <p>MindSpace is the first door: a short conversation before you begin, so you start with a clear head.</p>
        <div class="row"><a class="btn btn-primary btn-sm" href="#mindspace">Book a MindSpace session</a></div>
      </div>
    </section>`;
}

function todayCard() {
  const owes = ["active", "timeout"].includes(st("chamber"));
  if (!owes) return "";
  const today = dateKey();
  const obs = (S.obligations || []).filter((o) => o.date === today);
  if (!obs.length) return html`<section class="card"><h2 class="h-sm">Today</h2><p class="muted">No clips due today (not a trading day for your plan).</p></section>`;
  return html`
    <section class="card" aria-labelledby="today-h">
      <div class="row-between"><h2 id="today-h" class="h-sm">Today’s record</h2><span class="small muted">${fmtDate(today)}</span></div>
      <div class="today">
        ${obs.map((o) => html`
          ${o.accountLabel ? html`<p class="small muted">${o.accountLabel}</p>` : ""}
          ${clipRow(o, "sod")}${clipRow(o, "eod")}`)}
      </div>
    </section>`;
}

function clipRow(o, kind) {
  const status = o[`${kind}Status`] || "pending";
  const due = o[`${kind}Due`];
  const label = kind === "sod" ? "Start of day" : "End of day";
  return html`
    <div class="clip-row">
      <span class="k">${kind.toUpperCase()}</span>
      <div><strong>${label}</strong><div class="when">Due ${due ? fmtTime(due) : "—"} · ${pill(status)}</div></div>
      ${status === "pending" ? html`<a class="btn btn-primary btn-sm" href="#record/${o.id}/${kind}">Record</a>` : html`<span aria-hidden="true">${raw(ICON.check)}</span>`}
    </div>`;
}

function timeoutCard() {
  const ts = activeTimeouts();
  if (!ts.length) return "";
  const tierDays = (S.settings.rules && S.settings.rules.tierDays) || { minor: 1, serious: 3, critical: 5 };
  const t = ts.slice().sort((a, b) => (b.end || "").localeCompare(a.end || ""))[0];
  const total = t.days || tierDays[t.tier] || 1;
  const remaining = t.status === "frozen" ? t.frozenRemaining : (t.daysRemaining !== undefined ? t.daysRemaining : total);
  return html`
    <section class="card" aria-labelledby="to-h">
      <div class="row-between"><h2 id="to-h" class="h-sm">Timeout</h2>${pill(t.tier)}</div>
      <p class="row">${pips(total, remaining)}</p>
      <p class="small muted">${t.status === "frozen" ? "Frozen while you are paused; it resumes when you return." : html`No trading until the end of ${fmtDate(t.end)}. Keep sending both clips each trading day.`}</p>
    </section>`;
}

function nextThing() {
  const now = Date.now();
  const items = [
    ...(S.bookings || []).filter((b) => b.status === "booked" && +toDate(b.start) > now).map((b) => ({ when: toDate(b.start), what: b.service === "chamber" ? "Weekly review" : "MindSpace session", href: b.service === "chamber" ? "#chamber" : "#mindspace" })),
    ...(S.trainingSessions || []).filter((s) => s.status === "scheduled" && +toDate(s.start) > now).map((s) => ({ when: toDate(s.start), what: s.kind === "x_space" ? "Friday X Space" : "Training session", href: "#build" })),
  ].sort((a, b) => a.when - b.when);
  if (!items.length) return "";
  const n = items[0];
  return html`<a class="card row-between" href="${n.href}"><div><p class="kicker">Next</p><strong>${n.what}</strong><p class="small muted">${fmtDateTime(n.when)}</p></div><span aria-hidden="true">${raw(ICON.arrow)}</span></a>`;
}

function overview() {
  const unpaid = Object.values(S.memberships || {}).filter((x) => x.paymentStatus === "unpaid");
  return html`
    <div class="page-head">
      <h1>Good to see you, ${firstName()}.</h1>
      <p>Where you stand across the four doors.</p>
    </div>
    ${S.outage ? html`<p class="notice notice-info"><span aria-hidden="true">ⓘ</span><span><strong>We are having a problem on our side.</strong> Deadlines are extended and no automatic rulings are issued until it is fixed.</span></p>` : ""}
    ${unpaid.length ? html`<p class="notice notice-warn"><span aria-hidden="true">!</span><span><strong>Fee unpaid.</strong> ${unpaid.map((x) => SERVICES[x.service].name).join(", ")}. Booking is paused; daily clips still apply. <a href="#billing">Pay now</a></span></p>` : ""}
    ${mindspaceBanner()}
    <div class="grid-2">
      ${todayCard()}
      ${timeoutCard()}
      ${nextThing()}
    </div>
    <div class="section-title"><h2>Your services</h2><a class="small" href="#services">All details</a></div>
    <div class="svc-grid">${["build", "chamber", "capital", "mindspace"].map(serviceCard)}</div>
    <div class="section-title"><h2>Latest</h2><a class="small" href="#notifications">All notices</a></div>
    ${noticeList((S.notifications || []).slice(0, 3))}`;
}

function noticeList(list) {
  if (!list.length) return html`<p class="empty">Nothing new.</p>`;
  return html`<div class="list">${list.map((n) => html`
    <article class="item ${n.read ? "" : "unread"}">
      <div><h4>${n.title}</h4><p>${n.body}</p></div>
      <span class="meta">${relTime(n.createdAt)}</span>
    </article>`)}</div>`;
}

function notifications() {
  return html`
    ${backTo("overview", "Overview")}
    <div class="page-head"><h1>Notices</h1><p>Facts and a link. Change how they reach you in Settings.</p></div>
    ${noticeList(S.notifications || [])}`;
}

/* ------------------------------------------------------------------ */
/* Services                                                             */
/* ------------------------------------------------------------------ */

function services() {
  return html`
    <div class="page-head"><h1>Services</h1><p>One profile, four doors. Each has its own short intake.</p></div>
    <div class="stack">
      ${["build", "chamber", "capital", "mindspace"].map((s) => html`
        <article class="card">
          <div class="svc-card">
            <span class="badge-ring"><img src="${SERVICES[s].logo}" alt="${SERVICES[s].name} logo"></span>
            <div>
              <div class="row-between"><h2 class="h-sm">${SERVICES[s].name}</h2>${s === "capital" && !m("capital") ? pill("none", "By invitation") : pill(st(s))}</div>
              <p class="sub">${SERVICES[s].sub}</p>
              <p class="small">${serviceStatusLine(s)}</p>
              <div class="row">${serviceAction(s)}</div>
            </div>
          </div>
        </article>`)}
    </div>`;
}

function serviceAction(s) {
  const state = st(s);
  if (s === "capital") return m("capital") ? html`<a class="btn btn-sm" href="#capital">Open</a>` : html`<span class="small muted">No sign-up. HexhaEdge invites people directly.</span>`;
  if (s === "mindspace") return html`<a class="btn btn-primary btn-sm" href="#mindspace">${state === "none" ? "Book a session" : "Open MindSpace"}</a>`;
  if (state === "none" || state === "declined" || state === "exited") return html`<button class="btn btn-primary btn-sm" type="button" data-action="apply" data-service="${s}">Apply</button>`;
  return html`<a class="btn btn-sm" href="#${s}">Open</a>`;
}

function needsMindspaceFirst(service) {
  const gates = (S.settings.gates && S.settings.gates.mindspaceFirst) || { build: true, chamber: true };
  return gates[service] && !(S.profile && S.profile.metMindspace);
}

function applySheet(service) {
  if (needsMindspaceFirst(service)) {
    sheet({
      title: "MindSpace first",
      body: html`<p>Before ${SERVICES[service].name}, you meet MindSpace for a short conversation. Book it now, and apply after.</p>
        <p class="small muted">You can still send your application now; it waits for the MindSpace step.</p>`,
      submitLabel: "Apply anyway",
      onSubmit: () => { setTimeout(() => applyForm(service), 50); },
    });
    return;
  }
  applyForm(service);
}

function applyForm(service) {
  if (service === "build") {
    sheet({
      title: "Apply for Build Your Edge",
      wide: true,
      body: html`
        <p class="small muted">A first talk follows, then a day to think. Nobody pays in the same conversation.</p>
        ${[["experience", "What do you trade now, and for how long?"], ["goal", "What do you want from training?"], ["time", "Which hour, Monday to Thursday, can you give to the live market?"], ["money", "Is the money you trade money you can afford to lose?"], ["expectations", "What do you expect to happen in the first three months?"]].map(([k, q]) => html`
          <div class="field"><label for="a-${k}">${q}</label><textarea class="input" id="a-${k}" name="${k}" required maxlength="1500"></textarea></div>`)}
        <div class="field"><label for="a-hour">Preferred hour (EAT)</label><input class="input" id="a-hour" name="preferredHour" type="time" step="3600" value="10:00" required></div>
        <p class="small">We never give signals or trade for anyone.</p>`,
      submitLabel: "Send application",
      onSubmit: async (f) => {
        const answers = {};
        for (const k of ["experience", "goal", "time", "money", "expectations"]) answers[k] = String(f.get(k) || "").trim();
        if (Object.values(answers).some((v) => v.length < 2)) throw new Error("Please answer all five questions.");
        await act("applyToService", { service: "build", answers, preferredHour: f.get("preferredHour") });
        toast("Application sent. We’ll arrange the first talk.");
        await refresh();
      },
    });
    return;
  }
  if (service === "chamber") {
    if (!(S.consents.clips && S.consents.clips.given)) {
      sheet({
        title: "One consent needed",
        body: html`<p>The Chamber works from short screen recordings of your trading platform. To join, give consent for <strong>recording and storage of your trading clips</strong>.</p>`,
        submitLabel: "Give consent",
        onSubmit: async () => { await act("setConsent", { purpose: "clips", given: true }); await refresh(); setTimeout(() => applyForm("chamber"), 50); },
      });
      return;
    }
    sheet({
      title: "Apply to the Chamber",
      body: html`
        <p class="small muted">The Chamber checks that you followed your own plan. It does not teach an edge, give signals, place trades or promise results.</p>
        <div class="field"><label for="a-why">Why do you want to join?</label><textarea class="input" id="a-why" name="why" required maxlength="1500"></textarea></div>
        <fieldset><legend>Account type</legend><div class="radio-row">
          <label><input type="radio" name="accountType" value="prop" required> Prop firm</label>
          <label><input type="radio" name="accountType" value="personal"> Personal</label>
          <label><input type="radio" name="accountType" value="practice"> Practice</label>
        </div></fieldset>
        <p class="small">Fee: ${fmtKes((S.settings.fees || {}).chamberMonthlyKes || 7500)} a month, paid once your plan is accepted. Amount to be confirmed.</p>`,
      submitLabel: "Send application",
      onSubmit: async (f) => {
        if (!f.get("accountType")) throw new Error("Pick your account type.");
        await act("applyToService", { service: "chamber", answers: { why: f.get("why"), accountType: f.get("accountType") } });
        toast("Application sent.");
        await refresh();
      },
    });
  }
}

/* ------------------------------------------------------------------ */
/* Chamber                                                              */
/* ------------------------------------------------------------------ */

function planSummary(p) {
  if (!p) return "";
  const rows = PLAN_CATEGORIES.map((c) => {
    const v = (p.rules || {})[c.key];
    const shown = c.kind === "bool" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join("\n") : v;
    return html`<div><dt>${c.label}</dt><dd>${shown === undefined || shown === "" ? "—" : shown}</dd></div>`;
  });
  const firm = p.accountType === "prop" ? FIRM_CATEGORIES.map((c) => html`<div><dt>${c.label}</dt><dd>${(p.firmRules || {})[c.key] || "—"}</dd></div>`) : [];
  return html`<dl class="plan-rules">${rows}${firm}
    <div><dt>SOD deadline</dt><dd>${p.sodDeadline || "—"}</dd></div>
    <div><dt>EOD deadline</dt><dd>${p.eodDeadline || "—"}</dd></div></dl>`;
}

function suspensionCount() {
  const since = addDays(dateKey(), -28); // about 20 trading days
  const days = new Map();
  for (const v of S.violations || []) {
    if (v.status !== "confirmed" || v.tradingDate < since) continue;
    if (v.tier === "serious" || v.tier === "critical") days.set(v.tradingDate, true);
  }
  return days.size;
}

function chamber() {
  const x = m("chamber");
  if (!x || ["declined", "exited"].includes(x.state)) {
    return html`${backTo("services", "Services")}
      <div class="page-head"><h1>${SERVICES.chamber.name}</h1><p>${SERVICES.chamber.sub}</p></div>
      <div class="card stack">
        <p>You write your own plan with every rule filled in. A reviewer accepts it and it locks for about a month. Each trading day you send two 10-second screen clips, start and end of day, plus a short form. Once a week a reviewer goes through your trades with you for 20 minutes.</p>
        <p class="small muted">Not a course, not signals, and nobody trades for you.</p>
        <div class="row"><button class="btn btn-primary" type="button" data-action="apply" data-service="chamber">Apply</button></div>
      </div>`;
  }
  const plan = lockedPlans()[0];
  const draft = (S.plans || []).find((p) => p.status === "draft" || p.status === "review");
  const lockedOn = plan && plan.lockedOn;
  const unlockOn = lockedOn ? addDays(lockedOn, 30) : null;
  const ts = activeTimeouts();
  const count = suspensionCount();
  const minors = (S.violations || []).filter((v) => v.status === "confirmed" && v.tier === "minor").length;
  const nextReview = (S.bookings || []).filter((b) => b.service === "chamber" && b.status === "booked").sort((a, b) => toDate(a.start) - toDate(b.start))[0];
  const lastNote = (S.bookings || []).find((b) => b.service === "chamber" && b.status === "done" && b.note);
  const report = (S.weeklyReports || [])[0];
  const openEvidence = (S.evidenceRequests || []).filter((e) => e.status === "open");
  const openUnlock = (S.unlockRequests || []).find((u) => u.status === "open");

  return html`
    ${backTo("services", "Services")}
    <div class="page-head row-between">
      <div><h1>${SERVICES.chamber.name}</h1><p>${SERVICES.chamber.sub}</p></div>
      ${pill(x.state)}
    </div>

    ${x.state === "suspended" ? html`<p class="notice notice-bad"><span aria-hidden="true">!</span><span><strong>Suspended: no trading for now.</strong> The way back is through MindSpace. <a href="#mindspace">Book a session</a>. The rule applies to the behaviour, not to you.</span></p>` : ""}
    ${x.state === "paused" ? html`<p class="notice notice-info"><span aria-hidden="true">ⓘ</span><span><strong>You are paused.</strong> No clips are needed. To come back, have a MindSpace session first; your first SOD back needs to match your last EOD. ${x.clearedToReturn ? html`<button class="link-btn" type="button" data-action="return">Return now</button>` : html`<a href="#mindspace">Book MindSpace</a>`}</span></p>` : ""}
    ${openEvidence.map((e) => html`<p class="notice notice-warn"><span aria-hidden="true">!</span><span><strong>Evidence requested.</strong> ${e.note} Due ${fmtDateTime(e.dueAt)}. <button class="link-btn" type="button" data-action="evidence" data-id="${e.id}">Send files</button></span></p>`)}

    <div class="grid-2">
      <section class="card stack">
        <div class="row-between"><h2 class="h-sm">Your plan</h2>${plan ? pill("locked") : draft ? pill(draft.status) : ""}</div>
        ${plan ? html`
          <p><strong>Version ${plan.version}</strong>${plan.accountLabel ? html` · ${plan.accountLabel}` : ""}</p>
          <p class="small muted">Locked on ${fmtDate(lockedOn)}. It can unlock from about ${fmtDate(unlockOn)}, sooner for a new account or a firm rule change, or early after a clean month.</p>
          <div class="row">
            <button class="btn btn-sm" type="button" data-action="view-plan">See the plan</button>
            ${openUnlock ? pill("open", "Unlock requested") : ["active", "timeout"].includes(x.state) ? html`<button class="btn btn-ghost btn-sm" type="button" data-action="unlock" data-id="${plan.id}">Ask to unlock</button>` : ""}
          </div>` : ""}
        ${["onboarding", "plan_rewrite"].includes(x.state) ? html`
          ${draft && draft.returnNote ? html`<p class="notice notice-warn"><span>!</span><span><strong>Returned by the reviewer:</strong> ${draft.returnNote}</span></p>` : ""}
          <p>${x.state === "plan_rewrite" ? "Write the new version. Your current plan stays in force until it is locked." : "Write your plan. Every category must be filled before it can be accepted."}</p>
          <div class="row"><a class="btn btn-primary btn-sm" href="#plan">${draft ? "Continue the plan" : "Write the plan"}</a></div>` : ""}
        ${x.state === "plan_review" ? html`<p>${x.awaitingPayment ? html`Your plan is locked. <a href="#billing">Pay the monthly fee</a> to start the daily record.` : "Your plan is with a reviewer. You’ll hear back within a trading day."}</p>` : ""}
        ${x.state === "applicant" ? html`<p>Your application is with HexhaEdge.</p>` : ""}
      </section>

      <section class="card stack">
        <h2 class="h-sm">Timeouts and count</h2>
        ${ts.length ? ts.map((t) => html`<div><p class="row">${pill(t.tier)} ${pips(t.days || 1, t.status === "frozen" ? t.frozenRemaining : (t.daysRemaining ?? t.days))}</p>
          <p class="small muted">${t.status === "frozen" ? "Frozen during your pause." : html`Ends after ${fmtDate(t.end)}.`}</p></div>`) : html`<p class="muted">No timeout running.</p>`}
        <p class="small"><strong class="num">${count} of 3</strong> Serious or Critical timeout days in the last 20 trading days. Three means a suspension. <span class="muted">Minor timeouts (${minors}) never count toward it.</span></p>
      </section>
    </div>

    ${["active", "timeout"].includes(x.state) ? html`<div class="section-title"><h2>Today</h2><a class="small" href="#record">Record a clip</a></div>${todayCard()}` : ""}

    <div class="section-title"><h2>Weekly review</h2></div>
    <section class="card stack">
      ${nextReview ? html`
        <p><strong>${fmtDateTime(nextReview.start)}</strong> · ${nextReview.minutes} minutes</p>
        <p class="small muted">The report is built one hour before. Reminders go 24 hours and 1 hour before.</p>
        <div class="row"><button class="btn btn-ghost btn-sm" type="button" data-action="cancel-booking" data-id="${nextReview.id}">Cancel</button></div>
        <p class="small muted">Cancelling later than 12 hours before counts as a missed review (proposed rule).</p>`
      : ["active", "timeout", "plan_rewrite"].includes(x.state) ? html`
        <p>Pick one 20-minute slot for this week or next, before Friday 18:00.</p>
        ${x.paymentStatus !== "paid" ? html`<p class="notice notice-warn"><span>!</span><span>Booking is paused while the fee is unpaid. <a href="#billing">Pay now</a></span></p>` : slotPicker("chamber")}`
      : html`<p class="muted">Weekly reviews open once your plan is locked.</p>`}
      ${lastNote ? html`<hr class="divider"><p class="kicker">Last review note</p><p>${lastNote.note}</p>` : ""}
    </section>

    ${report ? html`<div class="section-title"><h2>Weekly report</h2><span class="small muted">${fmtDate(report.weekStart)} – ${fmtDate(report.weekEnd)}</span></div>${reportCard(report)}` : ""}

    <div class="section-title"><h2>Rulings</h2></div>
    ${rulingsList()}

    <div class="section-title"><h2>Recent record</h2></div>
    ${recordTable()}

    <div class="section-title"><h2>Pause or leave</h2></div>
    <section class="card stack">
      <p>You can ask for a pause at any time, with no penalty and no reason needed. Asking for help is always fine.</p>
      <div class="row">
        ${["active", "timeout", "plan_rewrite", "plan_review", "onboarding"].includes(x.state) ? html`<button class="btn btn-sm" type="button" data-action="pause" data-service="chamber">${raw(ICON.pause)} Pause</button>` : ""}
        ${x.state === "paused" && x.clearedToReturn ? html`<button class="btn btn-primary btn-sm" type="button" data-action="return">${raw(ICON.play)} Return</button>` : ""}
        <button class="btn btn-ghost btn-sm" type="button" data-action="leave" data-service="chamber">Leave the Chamber</button>
      </div>
    </section>`;
}

function slotPicker(service) {
  const slots = (S.openSlots || {})[service] || [];
  if (!slots.length) return html`<p class="empty">No open slots yet. New slots are published each week.</p>`;
  return html`<div class="slots">${slots.slice(0, 12).map((s) => html`
    <button class="slot-btn" type="button" data-action="book" data-id="${s.id}" data-service="${service}">
      <strong>${fmtDate(s.start)}</strong>${fmtTime(s.start)} · ${s.minutes} min
    </button>`)}</div>`;
}

function reportCard(r) {
  const f = r.figures || {};
  const c = f.clips || {};
  const t = f.violationsByTier || {};
  const line = f.balanceLine || [];
  return html`<section class="card stack">
    <div class="stat-row">
      <div class="stat"><div class="n num">${c.onTime || 0}</div><div class="l">clips on time</div></div>
      <div class="stat"><div class="n num">${c.late || 0}</div><div class="l">late</div></div>
      <div class="stat"><div class="n num">${c.missing || 0}</div><div class="l">not submitted</div></div>
      <div class="stat"><div class="n num">${(t.serious || 0) + (t.critical || 0)}</div><div class="l">Serious/Critical rulings</div></div>
      <div class="stat"><div class="n num">${f.cleanStreak || 0}</div><div class="l">clean days in a row</div></div>
    </div>
    ${line.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Day</th><th>Clip</th><th>Balance (typed)</th></tr></thead><tbody>
      ${line.map((b) => html`<tr><td>${fmtDate(b.date)}</td><td>${String(b.kind).toUpperCase()}</td><td class="num">${Number(b.balance).toLocaleString("en-KE", { minimumFractionDigits: 2 })}</td></tr>`)}</tbody></table></div>` : ""}
  </section>`;
}

function rulingsList() {
  const vs = (S.violations || []).filter((v) => v.status !== "dismissed");
  if (!vs.length) return html`<p class="empty">No rulings. Every clean day counts.</p>`;
  const tierDays = (S.settings.rules && S.settings.rules.tierDays) || { minor: 1, serious: 3, critical: 5 };
  return html`<div class="list">${vs.map((v) => html`
    <article class="item">
      <div>
        <h4>${RULE_LABELS[v.category] || v.category}</h4>
        <p>${(v.evidence && v.evidence.detail) || ""}</p>
        <p class="meta">${fmtDate(v.tradingDate)} · ${v.status === "confirmed" ? `${tierDays[v.tier]} trading day${tierDays[v.tier] > 1 ? "s" : ""}` : ""} ${v.auto ? "· automatic" : ""}</p>
        ${v.status === "reversed" && v.reverseReason ? html`<p class="small"><strong>Reversed:</strong> ${v.reverseReason}</p>` : ""}
        ${v.response ? html`<p class="small"><strong>Your response:</strong> ${v.response}</p>` : v.status === "confirmed" || v.status === "issued" ? html`<button class="link-btn small" type="button" data-action="respond" data-id="${v.id}">Add a written response</button>` : ""}
      </div>
      <div class="stack stack-tight">${pill(v.tier)}${pill(v.status)}</div>
    </article>`)}</div>`;
}

function recordTable() {
  const obs = (S.obligations || []).slice(0, 10);
  if (!obs.length) return html`<p class="empty">Your daily record starts the trading day after your plan locks.</p>`;
  return html`<div class="table-wrap"><table class="table"><thead><tr><th>Day</th><th>SOD</th><th>EOD</th></tr></thead><tbody>
    ${obs.map((o) => html`<tr><td>${fmtDate(o.date)}</td><td>${pill(o.sodStatus)}</td><td>${pill(o.eodStatus)}</td></tr>`)}
  </tbody></table></div>`;
}

/* ---------- Plan editor ---------- */

function planEditor() {
  const draft = (S.plans || []).find((p) => p.status === "draft") || {};
  const r = draft.rules || {};
  const fr = draft.firmRules || {};
  const x = m("chamber");
  if (!x || !["onboarding", "plan_rewrite"].includes(x.state)) {
    return html`${backTo("chamber", "Chamber")}<p class="empty">You can write a plan once you are accepted, or when your plan is unlocked.</p>`;
  }
  const field = (c) => {
    const v = r[c.key];
    if (c.kind === "bool") {
      return html`<fieldset><legend class="label">${c.label}</legend><div class="radio-row">
        <label><input type="radio" name="${c.key}" value="true" ${v === true ? raw("checked") : ""}> Yes</label>
        <label><input type="radio" name="${c.key}" value="false" ${v === false ? raw("checked") : ""}> No</label></div></fieldset>`;
    }
    if (c.kind === "list") return html`<div class="field"><label for="pl-${c.key}">${c.label}</label><textarea class="input" id="pl-${c.key}" name="${c.key}" rows="3">${(v || []).join("\n")}</textarea>${c.help ? html`<span class="help">${c.help}</span>` : ""}</div>`;
    if (c.kind === "int") return html`<div class="field"><label for="pl-${c.key}">${c.label}</label><input class="input" id="pl-${c.key}" name="${c.key}" type="number" min="0" max="500" inputmode="numeric" value="${v ?? ""}"></div>`;
    return html`<div class="field"><label for="pl-${c.key}">${c.label}</label><input class="input" id="pl-${c.key}" name="${c.key}" value="${v || ""}" maxlength="600">${c.help ? html`<span class="help">${c.help}</span>` : ""}</div>`;
  };
  return html`
    ${backTo("chamber", "Chamber")}
    <div class="page-head"><h1>Your plan</h1><p>Your own rules, written so a reviewer can check them from a clip. Every category is required.</p></div>
    <form id="plan-form" class="card stack" novalidate>
      <div class="input-row">
        <div class="field"><label for="pl-label">Account name</label><input class="input" id="pl-label" name="accountLabel" value="${draft.accountLabel || "Main account"}" maxlength="60"></div>
        <div class="field"><label for="pl-type">Account type</label>
          <select class="input" id="pl-type" name="accountType">
            ${["prop", "personal", "practice"].map((t) => html`<option value="${t}" ${(draft.accountType || "personal") === t ? raw("selected") : ""}>${{ prop: "Prop firm", personal: "Personal", practice: "Practice" }[t]}</option>`)}
          </select></div>
      </div>
      <div class="input-row">
        <div class="field"><label for="pl-sod">SOD deadline (session start)</label><input class="input" id="pl-sod" name="sodDeadline" type="time" value="${draft.sodDeadline || "09:30"}"></div>
        <div class="field"><label for="pl-eod">EOD deadline</label><input class="input" id="pl-eod" name="eodDeadline" type="time" value="${draft.eodDeadline || "21:30"}"></div>
      </div>
      <label class="check"><input type="checkbox" name="synthetic" ${draft.synthetic ? raw("checked") : ""}><span>I trade synthetic indices (every day is a trading day).</span></label>
      ${PLAN_CATEGORIES.map(field)}
      <fieldset id="firm-rules" ${draft.accountType === "prop" ? "" : raw("hidden")}>
        <legend>Your prop firm’s rules, in full</legend>
        ${FIRM_CATEGORIES.map((c) => html`<div class="field"><label for="fr-${c.key}">${c.label}</label><textarea class="input" id="fr-${c.key}" name="firm_${c.key}" rows="2">${fr[c.key] || ""}</textarea></div>`)}
      </fieldset>
      <input type="hidden" name="planId" value="${draft.id || ""}">
      <div class="row">
        <button class="btn" type="submit" name="intent" value="save">Save draft</button>
        <button class="btn btn-primary" type="submit" name="intent" value="submit">Send to reviewer</button>
      </div>
      <p class="small muted">Once accepted, the plan locks for about a month.</p>
    </form>`;
}

function readPlanForm(form) {
  const f = new FormData(form);
  const rules = {};
  for (const c of PLAN_CATEGORIES) {
    const v = f.get(c.key);
    if (c.kind === "bool") { if (v === "true" || v === "false") rules[c.key] = v === "true"; continue; }
    if (v === null || String(v).trim() === "") continue;
    if (c.kind === "list") rules[c.key] = String(v).split("\n").map((s) => s.trim()).filter(Boolean);
    else if (c.kind === "int") rules[c.key] = Number(v);
    else rules[c.key] = String(v).trim();
  }
  const firmRules = {};
  for (const c of FIRM_CATEGORIES) { const v = f.get(`firm_${c.key}`); if (v && String(v).trim()) firmRules[c.key] = String(v).trim(); }
  return {
    planId: f.get("planId") || undefined, accountLabel: f.get("accountLabel"), accountType: f.get("accountType"),
    sodDeadline: f.get("sodDeadline"), eodDeadline: f.get("eodDeadline"), synthetic: f.get("synthetic") === "on",
    timezone: (S.profile && S.profile.timezone) || "Africa/Nairobi", rules, firmRules,
  };
}

/* ---------- Record flow (C-2, C-4): under five minutes ---------- */

function record(obligationId, kind) {
  const today = dateKey();
  const open = (S.obligations || []).filter((o) => o.date >= addDays(today, -1) && (o.sodStatus === "pending" || o.eodStatus === "pending" || o.sod?.resubmitRequested || o.eod?.resubmitRequested));
  const o = (S.obligations || []).find((x) => x.id === obligationId) || open[0];
  if (!o) return html`${backTo("chamber", "Chamber")}<div class="page-head"><h1>Record</h1></div><p class="empty">Nothing is due right now.</p>`;
  const k = kind || (o.sodStatus === "pending" ? "sod" : "eod");
  const plan = (S.plans || []).find((p) => p.id === o.planId) || lockedPlans()[0] || { rules: {} };
  const setups = (plan.rules && plan.rules.setups) || [];
  return html`
    ${backTo("chamber", "Chamber")}
    <div class="page-head"><h1>${k === "sod" ? "Start of day" : "End of day"}</h1><p>${fmtDate(o.date)}${o.accountLabel ? ` · ${o.accountLabel}` : ""} · due ${fmtTime(o[`${k}Due`])}</p></div>
    <form id="record-form" class="card stack" data-obligation="${o.id}" data-kind="${k}" novalidate>
      <div>
        <p class="label">1 · Your clip</p>
        <p class="small muted">Screen-record about 10 seconds of your platform showing <strong>balance and equity</strong>, using your phone’s screen recorder. Then pick the file here.</p>
        <label class="drop" for="clip"><span aria-hidden="true">${raw(ICON.video)}</span><strong>Choose the recording</strong><span class="small muted">8 to 15 seconds</span>
          <input id="clip" name="clip" type="file" accept="video/*" required></label>
        <div class="preview" id="clip-preview" hidden></div>
      </div>
      <div>
        <p class="label">2 · Type what the clip shows</p>
        <div class="input-row">
          <div class="field"><label for="bal">Balance</label><input class="input num" id="bal" name="balance" inputmode="decimal" required placeholder="10240.50"></div>
          <div class="field"><label for="eq">Equity</label><input class="input num" id="eq" name="equity" inputmode="decimal" required placeholder="10240.50"></div>
        </div>
        ${k === "sod" && m("chamber") && m("chamber").lastEod ? html`<p class="help">Your last EOD: balance ${m("chamber").lastEod.balance}, equity ${m("chamber").lastEod.equity}. Today’s SOD should match it.</p>` : ""}
      </div>
      ${k === "eod" ? html`
        <div>
          <p class="label">3 · The day’s form</p>
          <div class="radio-row">
            <label><input type="radio" name="dayType" value="trades" checked> I traded</label>
            <label><input type="radio" name="dayType" value="none"> No trades today</label>
            ${activeTimeouts().some((t) => t.status === "active") ? html`<label><input type="radio" name="dayType" value="timeout"> Timeout day</label>` : ""}
          </div>
          <div id="trades"></div>
          <button class="btn btn-ghost btn-sm" type="button" id="add-trade">+ Add a trade</button>
          <template id="trade-tpl">
            <div class="trade">
              <div class="trade-head"><strong>Trade</strong><button class="link-btn small" type="button" data-remove>Remove</button></div>
              <div class="trade-grid">
                <div class="field"><label>Setup</label><select class="input" name="t_setup">${setups.map((s) => html`<option>${s}</option>`)}</select></div>
                <div class="field"><label>Instrument</label><input class="input" name="t_instrument" maxlength="40" value="${(plan.rules.instruments || [])[0] || ""}"></div>
                <div class="field"><label>Planned entry</label><input class="input num" name="t_plannedEntry" inputmode="decimal"></div>
                <div class="field"><label>Actual entry</label><input class="input num" name="t_actualEntry" inputmode="decimal"></div>
                <div class="field"><label>Planned stop</label><input class="input num" name="t_plannedStop" inputmode="decimal"></div>
                <div class="field"><label>Actual stop</label><input class="input num" name="t_actualStop" inputmode="decimal"></div>
                <div class="field"><label>Planned size</label><input class="input num" name="t_plannedSize" inputmode="decimal"></div>
                <div class="field"><label>Actual size</label><input class="input num" name="t_actualSize" inputmode="decimal"></div>
                <div class="field"><label>Result</label><input class="input num" name="t_result" inputmode="decimal" placeholder="-25.40"></div>
              </div>
              <div class="field"><label>Pre-trade analysis</label><textarea class="input" name="t_analysis" rows="2" maxlength="1500"></textarea></div>
            </div>
          </template>
          <div class="field"><label for="eod-note">Anything else (optional)</label><textarea class="input" id="eod-note" name="note" rows="2" maxlength="2000"></textarea></div>
        </div>` : ""}
      <div id="upload-progress" hidden>
        <progress class="bar" id="up-bar" max="100" value="0"></progress>
        <p class="small row-between"><span id="up-text">Uploading…</span><span class="row"><button class="link-btn" type="button" id="up-pause">Pause</button><button class="link-btn" type="button" id="up-resume" hidden>Resume</button></span></p>
      </div>
      <button class="btn btn-primary btn-block" type="submit">Send ${k.toUpperCase()}</button>
      <p class="small muted">If your connection drops, the upload carries on when it comes back. A clip counts as on time if the upload started before the deadline and finishes within 30 minutes.</p>
    </form>`;
}

function readClipDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(v.src); resolve(Number.isFinite(d) ? Math.round(d * 10) / 10 : 0); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

function wireRecord() {
  const form = $("#record-form");
  if (!form) return;
  const clip = $("#clip", form);
  let duration = 0;
  clip.addEventListener("change", async () => {
    const f = clip.files[0];
    const pv = $("#clip-preview");
    if (!f) { pv.hidden = true; return; }
    duration = await readClipDuration(f);
    const url = URL.createObjectURL(f);
    pv.innerHTML = String(html`<video src="${url}" controls muted playsinline></video><p class="small ${duration < 8 || duration > 15 ? "error-text" : "muted"}">${duration ? `${duration} seconds` : "Length unknown"} · ${(f.size / 1048576).toFixed(1)} MB${duration && (duration < 8 || duration > 15) ? " · outside 8–15 seconds; the reviewer will see this" : ""}</p>`);
    pv.hidden = false;
  });
  const trades = $("#trades", form);
  const tpl = $("#trade-tpl", form);
  const addTrade = () => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector("[data-remove]").addEventListener("click", () => node.remove());
    trades.appendChild(node);
  };
  if (trades) {
    addTrade();
    $("#add-trade", form).addEventListener("click", addTrade);
    $$('input[name="dayType"]', form).forEach((r) => r.addEventListener("change", () => {
      const traded = form.dayType.value === "trades";
      trades.hidden = !traded;
      $("#add-trade", form).hidden = !traded;
    }));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const file = clip.files[0];
    const kind = form.dataset.kind;
    const balance = Number(String(f.get("balance")).replace(/,/g, ""));
    const equity = Number(String(f.get("equity")).replace(/,/g, ""));
    if (!file) return toast("Choose your recording first.", "bad");
    if (!Number.isFinite(balance) || !Number.isFinite(equity) || f.get("balance") === "" || f.get("equity") === "") return toast("Type the balance and equity shown in the clip.", "bad");
    let form2 = null;
    if (kind === "eod") {
      const dayType = f.get("dayType");
      const list = dayType === "trades" ? $$(".trade", trades).map((t) => {
        const g = (n) => t.querySelector(`[name="t_${n}"]`).value;
        return { setup: g("setup"), instrument: g("instrument"), plannedEntry: g("plannedEntry"), actualEntry: g("actualEntry"), plannedStop: g("plannedStop"), actualStop: g("actualStop"), plannedSize: g("plannedSize"), actualSize: g("actualSize"), result: g("result"), analysis: g("analysis") };
      }) : [];
      if (dayType === "trades" && !list.length) return toast("Add at least one trade, or choose No trades today.", "bad");
      form2 = { noTrade: dayType !== "trades", timeoutDay: dayType === "timeout", trades: list, note: f.get("note") || "" };
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      if (demoMode) {
        await act("submitRecord", {});
        location.hash = "#chamber";
        return;
      }
      const fb = await firebase();
      const ticket = await (await import("../lib/fb.js")).call("beginUpload", { obligationId: form.dataset.obligation, kind });
      await uploadResumable(fb, ticket.path, file);
      const res = await (await import("../lib/fb.js")).call("submitRecord", { uploadId: ticket.uploadId, balance, equity, clipSeconds: duration || 0, form: form2 });
      const flags = (res.flags || []).map((x) => x.code);
      toast(res.timing.status === "late" ? `Received, ${res.timing.lateMinutes} min after the deadline.` : flags.includes("mismatch") ? "Received. Your balance does not match yesterday’s EOD; a reviewer will look." : "Received on time. Thank you.");
      await refresh();
      location.hash = "#chamber";
    } catch (ex) {
      toast(ex.message || "Upload failed. Try again.", "bad");
      if (!demoMode) (await import("../lib/fb.js")).call("reportUploadIssue", { detail: String(ex.message || ex).slice(0, 200) }).catch(() => undefined);
    } finally {
      btn.disabled = false;
    }
  });
}

/** Resumable upload with progress, pause and resume (C-2, N-2). */
function uploadResumable(fb, path, file) {
  return new Promise((resolve, reject) => {
    const task = fb.S.uploadBytesResumable(fb.S.ref(fb.storage, path), file, { contentType: file.type || "video/mp4" });
    const box = $("#upload-progress");
    const bar = $("#up-bar");
    const txt = $("#up-text");
    box.hidden = false;
    $("#up-pause").onclick = () => { task.pause(); $("#up-pause").hidden = true; $("#up-resume").hidden = false; txt.textContent = "Paused"; };
    $("#up-resume").onclick = () => { task.resume(); $("#up-pause").hidden = false; $("#up-resume").hidden = true; };
    const offline = () => { txt.textContent = "Connection lost. Waiting to continue…"; };
    window.addEventListener("offline", offline);
    task.on("state_changed", (snap) => {
      const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
      bar.value = pct;
      if (snap.state === "running") txt.textContent = `Uploading… ${pct}%`;
    }, (err) => { window.removeEventListener("offline", offline); reject(new Error(friendly(err))); }, () => { window.removeEventListener("offline", offline); txt.textContent = "Uploaded. Checking…"; resolve(); });
  });
}

/* ------------------------------------------------------------------ */
/* Build Your Edge                                                      */
/* ------------------------------------------------------------------ */

function build() {
  const x = m("build");
  const s = SERVICES.build;
  const head = html`${backTo("services", "Services")}<div class="page-head row-between"><div><h1>${s.name}</h1><p>${s.sub}</p></div>${pill(st("build"))}</div>`;
  if (!x || ["declined", "exited"].includes(x.state)) {
    return html`${head}<div class="card stack">
      <p>One-on-one training on the live market over Google Meet, Monday to Thursday in the hour you choose (40 to 45 minutes), with an open line to your trainer in market hours. Friday is the weekly X Space.</p>
      <p>USD ${(S.settings.fees || {}).buildMonthlyUsd || 75} a month, or the KES equivalent. Two instalments a month are allowed. No refunds.</p>
      <p class="small muted">There are no scores, points or marks. Feedback is written as comments.</p>
      ${x && x.state === "declined" ? html`<p class="small">Your last application was not the right fit at that time. You can apply again.</p>` : ""}
      <div class="row"><button class="btn btn-primary" type="button" data-action="apply" data-service="build">Apply</button></div></div>`;
  }
  if (x.state === "applicant") return html`${head}<div class="card"><p>Your application is in. Next is a first talk, then five questions and a day to think. Nobody pays in the same conversation.</p></div>`;
  const agreed = S.consents.training_agreement && S.consents.training_agreement.given && S.consents.risk_statement && S.consents.risk_statement.given;
  const upcoming = (S.trainingSessions || []).filter((t) => t.status === "scheduled" && +toDate(t.start) > Date.now()).sort((a, b) => toDate(a.start) - toDate(b.start));
  const past = (S.trainingSessions || []).filter((t) => ["done", "missed", "attended", "absent"].includes(t.status));
  return html`${head}
    ${x.state === "accepted" && !agreed ? html`<section class="card stack">
      <h2 class="h-sm">Before you pay</h2>
      <p>Read and accept the Training Agreement and the one-page Risk Statement. Your acceptance is recorded with the wording version.</p>
      <label class="check"><input type="checkbox" id="ag-1"><span>I accept the <a href="/legal/terms/" target="_blank" rel="noopener">Training Agreement</a>.</span></label>
      <label class="check"><input type="checkbox" id="ag-2"><span>I have read and accept the <a href="/legal/risk/" target="_blank" rel="noopener">Risk Statement</a>.</span></label>
      <div class="row"><button class="btn btn-primary btn-sm" type="button" data-action="agree">Accept both</button></div></section>` : ""}
    ${x.state === "accepted" && agreed ? html`<p class="notice notice-info"><span>ⓘ</span><span>Agreements accepted. <a href="#billing">Pay the first month</a> to open your sessions.</span></p>` : ""}
    ${x.suggestChamber ? html`<p class="notice notice-ok"><span>✓</span><span>Your trainer suggests <strong>Follow Your Edge</strong> as a next step. It is your decision. <a href="#chamber">Read about it</a></span></p>` : ""}

    <div class="grid-2">
      <section class="card stack">
        <h2 class="h-sm">Your hour and trainer</h2>
        ${x.trainerUid ? html`<p>Monday to Thursday at <strong>${x.trainingHour}</strong> EAT.</p>` : html`<p class="muted">Pick the hour you can give to the live market. Only trainers free at that hour are offered.</p>`}
        <div class="row"><button class="btn btn-sm" type="button" data-action="choose-trainer">${x.trainerUid ? "Change hour" : "Choose hour"}</button></div>
      </section>
      <section class="card stack">
        <h2 class="h-sm">Next session</h2>
        ${upcoming.length ? html`<p><strong>${fmtDateTime(upcoming[0].start)}</strong> · ${upcoming[0].kind === "x_space" ? "Friday X Space" : `${upcoming[0].minutes} min`}</p>
          ${upcoming[0].meetLink ? html`<p><a class="btn btn-primary btn-sm" href="${upcoming[0].meetLink}" target="_blank" rel="noopener">Join ${upcoming[0].kind === "x_space" ? "the X Space" : "Google Meet"}</a></p>` : ""}
          ${upcoming[0].kind !== "x_space" ? html`<button class="link-btn small" type="button" data-action="move" data-id="${upcoming[0].id}">Ask to move it</button>` : ""}` : html`<p class="muted">Sessions open once the month is paid.</p>`}
      </section>
    </div>

    <div class="section-title"><h2>Starting note</h2></div>
    ${S.startingNote ? html`<section class="card"><dl class="kv"><dt>What I know</dt><dd>${S.startingNote.know}</dd><dt>What I expect</dt><dd>${S.startingNote.expect}</dd><dt>How I feel</dt><dd>${S.startingNote.feel}</dd></dl><p class="small muted">Your fixed point. It doesn’t change.</p></section>`
      : html`<section class="card"><p>In your first session you record what you know, expect and feel. It stays as your fixed point.</p><div class="row"><button class="btn btn-sm" type="button" data-action="starting-note">Write it</button></div></section>`}

    <div class="section-title"><h2>Session notes</h2></div>
    ${past.length ? html`<div class="list">${past.map((t) => html`<article class="item"><div><h4>${fmtDate(t.start)}</h4>${t.covered ? html`<p><strong>Covered:</strong> ${t.covered}</p><p><strong>Observe before next time:</strong> ${t.observe}</p>` : ""}</div>${pill(t.status === "absent" ? "missed" : t.status === "attended" ? "done" : t.status)}</article>`)}</div>` : html`<p class="empty">Notes appear after each session.</p>`}

    <div class="section-title"><h2>Progress checks</h2></div>
    ${(S.progressChecks || []).length ? html`<div class="list">${S.progressChecks.map((p) => html`<article class="card"><p class="kicker">${fmtDate(p.date)}</p><dl class="kv"><dt>Strategy</dt><dd>${p.strategy}</dd><dt>Psychology and behaviour</dt><dd>${p.psychology}</dd><dt>Risk and reward</dt><dd>${p.risk}</dd><dt>Trade management</dt><dd>${p.management}</dd></dl></article>`)}</div>` : html`<p class="empty">Your trainer adds comments once or twice a month. No scores, ever.</p>`}

    <div class="section-title"><h2>Stopping</h2></div>
    <section class="card stack"><p class="small">You can stop at any time with at least seven days’ notice before the renewal date. Breaks are allowed; the paid period is not refunded or carried over.</p>
      <div class="row">${x.state === "active" ? html`<button class="btn btn-sm" type="button" data-action="pause" data-service="build">Take a break</button>` : ""}${x.state === "paused" ? html`<button class="btn btn-primary btn-sm" type="button" data-action="return-build">Come back</button>` : ""}<button class="btn btn-ghost btn-sm" type="button" data-action="leave" data-service="build">${x.exitRequested ? "Stop requested" : "Stop training"}</button></div></section>`;
}

/* ------------------------------------------------------------------ */
/* MindSpace and Capital                                                */
/* ------------------------------------------------------------------ */

function mindspace() {
  const mine = (S.bookings || []).filter((b) => b.service === "mindspace");
  const next = mine.filter((b) => b.status === "booked").sort((a, b) => toDate(a.start) - toDate(b.start));
  return html`
    ${backTo("services", "Services")}
    <div class="page-head"><h1>${SERVICES.mindspace.name}</h1><p>${SERVICES.mindspace.sub}</p></div>
    <section class="card stack">
      <p>A place to talk through what is affecting your trading, with HexhaEdge MindSpace practitioners. It is the first door to the other services, and the way back after a pause or a suspension.</p>
      <p class="small muted">MindSpace does not diagnose or provide medical treatment. What you say stays with your practitioner; the Chamber sees only whether you attended and were cleared, unless you allow more in Settings.</p>
    </section>
    <div class="section-title"><h2>Your sessions</h2></div>
    ${next.length ? html`<div class="list">${next.map((b) => html`<article class="item"><div><h4>${fmtDateTime(b.start)}</h4><p class="meta">${b.minutes} minutes</p></div><button class="btn btn-ghost btn-sm" type="button" data-action="cancel-booking" data-id="${b.id}">Cancel</button></article>`)}</div>` : html`<p class="empty">No session booked.</p>`}
    <div class="section-title"><h2>Book a session</h2></div>
    <section class="card">${slotPicker("mindspace")}</section>
    <div class="section-title"><h2>If you may be in danger</h2></div>
    <section class="card stack">
      <p>If you might hurt yourself, or you are in danger right now, call <strong><a href="tel:999">999</a></strong> or <strong><a href="tel:112">112</a></strong>.</p>
      <p>Kenya Red Cross, free, 24 hours: <strong><a href="tel:1199">1199</a></strong>.<br>Befrienders Kenya (call, SMS or WhatsApp): <strong><a href="tel:+254722178177">+254 722 178 177</a></strong>.</p>
      <p class="small muted">Draft escalation path. To be completed with a qualified professional before any session is held.</p>
    </section>`;
}

function capital() {
  const x = m("capital");
  return html`
    ${backTo("services", "Services")}
    <div class="page-head row-between"><div><h1>${SERVICES.capital.name}</h1><p>${SERVICES.capital.sub}</p></div>${x ? pill(x.state) : pill("none", "By invitation")}</div>
    <section class="card stack">
      ${x && x.state === "invited" ? html`<p><strong>You are invited.</strong> Your login details were sent to your email. More will appear here once HexhaEdge shares the next step with you.</p>`
        : x && x.state === "active" ? html`<p>Your HexhaEdge Capital access is active.</p>`
        : html`<p>By invitation only. There is no sign-up.</p>`}
      <p class="small muted">HexhaEdge Capital is HexhaEdge’s own proprietary trading. We do not trade for, manage or hold money for other people, and nothing here is an offer to invest or a promise of any return. You pay nothing for it.</p>
    </section>`;
}

/* ------------------------------------------------------------------ */
/* Billing                                                              */
/* ------------------------------------------------------------------ */

function billing() {
  const paying = ["chamber", "build"].filter((s) => m(s) && !["declined", "exited", "applicant", "onboarding", "disqualified"].includes(st(s)));
  return html`
    <div class="page-head"><h1>Billing</h1><p>Pay by M-Pesa. Each period is paid before its sessions or review slots open.</p></div>
    ${paying.length ? paying.map((s) => {
      const x = m(s);
      const fees = S.settings.fees || {};
      const amount = s === "chamber" ? fees.chamberMonthlyKes || 7500 : Math.round((x.joinedFeeUsd || fees.buildMonthlyUsd || 75) * (fees.usdToKes || 129));
      return html`<section class="card stack">
        <div class="row-between"><h2 class="h-sm">${SERVICES[s].name}</h2>${pill(x.paymentStatus || "unpaid")}</div>
        <p><strong>${fmtKes(amount)}</strong> a month${s === "build" ? html` <span class="small muted">(USD ${x.joinedFeeUsd || fees.buildMonthlyUsd || 75} at the current rate)</span>` : html` <span class="small muted">(amount to be confirmed)</span>`}</p>
        ${x.paidUntil ? html`<p class="small muted">Paid until ${fmtDate(x.paidUntil)}.</p>` : ""}
        <div class="row">
          <button class="btn btn-primary btn-sm" type="button" data-action="pay" data-service="${s}">Pay with M-Pesa</button>
          ${s === "build" ? html`<label class="check small"><input type="checkbox" data-action="instalments" ${x.instalments ? raw("checked") : ""}><span>Pay in two instalments (start and middle of the month)</span></label>` : ""}
        </div>
        ${s === "build" ? html`<p class="small muted">No refunds. You keep the fee you joined at while you renew without a gap.</p>` : ""}
      </section>`;
    }) : html`<p class="empty">Nothing to pay yet. Fees start once you are accepted into a paid service.</p>`}
    <div class="section-title"><h2>Invoices</h2></div>
    ${(S.invoices || []).length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Service</th><th>Period</th><th>Amount</th><th>Reference</th><th>Status</th></tr></thead><tbody>
      ${S.invoices.map((i) => html`<tr><td>${SERVICES[i.service].name}</td><td>${fmtDate(i.periodStart)} – ${fmtDate(i.periodEnd)}</td><td class="num">${fmtKes(i.amountKes)}</td><td class="mono">${i.reference}${i.receipt ? html`<br><span class="small muted">${i.receipt}</span>` : ""}</td><td>${pill(i.status)}</td></tr>`)}
    </tbody></table></div>` : html`<p class="empty">No invoices yet.</p>`}
    <p class="small muted">Paying by Paybill instead? Use the invoice reference as the account number, and it is matched automatically.</p>`;
}

/* ------------------------------------------------------------------ */
/* Messages                                                             */
/* ------------------------------------------------------------------ */

function messages() {
  return html`
    <div class="page-head"><h1>Messages</h1><p>Write to HexhaEdge. For anything urgent about a session, also use the channel your trainer gave you.</p></div>
    <section class="card">
      <div class="chat" id="chat" aria-live="polite"><p class="muted small">Loading…</p></div>
      <form class="chat-form" id="chat-form">
        <label class="sr-only" for="chat-text">Message</label>
        <textarea class="input" id="chat-text" name="text" maxlength="2000" required placeholder="Type a message"></textarea>
        <button class="btn btn-primary" type="submit">Send</button>
      </form>
      <p class="small muted">Never send a broker or prop firm login, password or code here.</p>
    </section>`;
}

async function wireMessages() {
  const box = $("#chat");
  const form = $("#chat-form");
  if (!box) return;
  const paint = (list) => {
    box.innerHTML = list.length ? String(html`${list.map((x) => html`<div class="msg ${x.byStaff ? "" : "me"}">${x.text}<span class="t">${x.byStaff ? "HexhaEdge · " : ""}${fmtDateTime(x.at)}</span></div>`)}`) : String(html`<p class="muted small">No messages yet. Say hello.</p>`);
    box.scrollTop = box.scrollHeight;
  };
  if (demoMode) {
    paint([{ text: "Hi, can I move Thursday's review to Friday?", at: new Date(Date.now() - 7200e3) }, { text: "Yes. Cancel it and pick a Friday slot; no penalty that far ahead.", byStaff: true, at: new Date(Date.now() - 3600e3) }]);
    form.addEventListener("submit", (e) => { e.preventDefault(); toast("Demo mode: nothing was sent."); });
    return;
  }
  const fb = await firebase();
  const { F, db } = fb;
  const col = F.collection(db, "threads", S.user.uid, "messages");
  if (chatUnsub) chatUnsub();
  chatUnsub = F.onSnapshot(F.query(col, F.orderBy("at", "asc"), F.limitToLast(100)), (snap) => paint(snap.docs.map((d) => d.data())), () => paint([]));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = form.text.value.trim();
    if (!text) return;
    await busy(form.querySelector("button"), async () => {
      await F.addDoc(col, { from: S.user.uid, text, at: F.serverTimestamp(), byStaff: false });
      form.reset();
    });
  });
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

function settings() {
  const p = S.profile || {};
  const bg = p.background || {};
  const hasPassword = (S.user.providers || []).includes("password");
  return html`
    <div class="page-head"><h1>Settings</h1><p>Your profile is the one place you edit your details. Every service reads from it.</p></div>
    <form id="profile-form" class="card stack" novalidate>
      <div class="row">
        ${p.avatarUrl ? html`<img class="avatar" src="${p.avatarUrl}" alt="" width="56" height="56">` : html`<span class="avatar" aria-hidden="true">${(p.name || "·")[0]}</span>`}
        <button class="btn btn-ghost btn-sm" type="button" data-action="avatar">Change photo</button>
      </div>
      <div class="field"><label for="s-name">Full name</label><input class="input" id="s-name" name="name" value="${p.name || ""}" maxlength="80" required></div>
      <dl class="kv"><dt>Phone</dt><dd>${p.phone || S.user.phone || "—"}</dd><dt>Email</dt><dd>${p.email || S.user.email || "—"} ${S.user.emailVerified ? "" : html`<span class="small muted">(not yet confirmed)</span>`}</dd></dl>
      <p class="help">To change your phone or email, message HexhaEdge; they are checked before they change.</p>
      <div class="input-row">
        <div class="field"><label for="s-tz">Time zone</label><select class="input" id="s-tz" name="timezone">${["Africa/Nairobi", "Africa/Kampala", "Africa/Dar_es_Salaam", "Africa/Kigali", "Africa/Lagos", "Africa/Johannesburg", "Europe/London", "Asia/Dubai", "UTC"].map((t) => html`<option ${p.timezone === t ? raw("selected") : ""}>${t}</option>`)}</select></div>
        <div class="field"><label for="s-ch">Non-urgent messages by</label><select class="input" id="s-ch" name="contactChannel">${[["sms", "SMS"], ["whatsapp", "WhatsApp"], ["email", "Email"]].map(([v, l]) => html`<option value="${v}" ${p.contactChannel === v ? raw("selected") : ""}>${l}</option>`)}</select></div>
      </div>
      <p class="help">Time-bound items (a clip is due, a session starts soon, a timeout) always come by SMS or WhatsApp, and in the app.</p>
      <div class="field"><label for="s-instr">What you trade</label><input class="input" id="s-instr" name="instruments" value="${(bg.instruments || []).join(", ")}"></div>
      <div class="input-row">
        <div class="field"><label for="s-years">Years trading</label><input class="input" id="s-years" name="years" type="number" min="0" max="60" value="${bg.years || 0}"></div>
        <div class="field"><span class="label">Accounts</span><div class="radio-row">${["personal", "prop", "practice"].map((a) => html`<label><input type="checkbox" name="accounts" value="${a}" ${(bg.accounts || []).includes(a) ? raw("checked") : ""}> ${a === "prop" ? "Prop firm" : a[0].toUpperCase() + a.slice(1)}</label>`)}</div></div>
      </div>
      <div class="row"><button class="btn btn-primary btn-sm" type="submit">Save</button></div>
    </form>

    <div class="section-title"><h2>Consent</h2></div>
    <section class="card stack">
      <p class="small muted">Each consent is stored with the time and the version of the wording. Withdrawing one a service needs pauses that service, and we tell you which.</p>
      ${Object.entries(CONSENTS).map(([k, c]) => {
        const given = S.consents[k] && S.consents[k].given;
        return html`<div class="row-between item"><div><h4>${c.label}</h4><p class="meta">${given ? `Given · version ${S.consents[k].version || ""}` : "Not given"}${c.needs ? ` · needed for ${c.needs}` : ""}${c.required ? " · required for any service" : ""}</p></div>
          <button class="btn btn-sm ${given ? "btn-ghost" : ""}" type="button" data-action="consent" data-purpose="${k}" data-given="${given ? "0" : "1"}">${given ? "Withdraw" : "Give"}</button></div>`;
      })}
    </section>

    <div class="section-title"><h2>Login</h2></div>
    <section class="card stack">
      <p class="small">You log in with your number and a code. ${hasPassword ? "You also have a password." : "You can also set a password."}</p>
      <div class="row">
        <button class="btn btn-sm" type="button" data-action="password">${hasPassword ? "Change password" : "Set a password"}</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="logout">${raw(ICON.logout)} Log out</button>
      </div>
    </section>

    <div class="section-title"><h2>Your data</h2></div>
    <section class="card stack">
      <p class="small">Download everything we hold about you, or ask for it to be deleted. Some records needed to treat other members fairly may be kept, as the law allows.</p>
      <div class="row">
        <button class="btn btn-sm" type="button" data-action="export">Download my data</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="delete">Ask for deletion</button>
        <button class="btn btn-ghost btn-sm" type="button" data-action="my-log">My activity log</button>
      </div>
    </section>
    <p class="small muted center">HexhaEdge · <a href="/legal/terms/">Terms</a> · <a href="/legal/privacy/">Privacy</a> · <a href="/legal/risk/">Risk statement</a></p>`;
}

/* ------------------------------------------------------------------ */
/* Actions (event delegation)                                           */
/* ------------------------------------------------------------------ */

const actions = {
  reload: () => location.reload(),
  apply: (b) => applySheet(b.dataset.service),
  book: (b) => busy(b, async () => { await act("bookSlot", { slotId: b.dataset.id }); await refresh(); }, "Booked. You’ll get reminders 24 hours and 1 hour before."),
  "cancel-booking": async (b) => {
    if (!(await confirmSheet("Cancel this booking?", "You can pick another slot after."))) return;
    await busy(b, async () => {
      const r = await act("cancelBooking", { bookingId: b.dataset.id });
      if (r && r.countsAsMiss) toast("Cancelled. Because it was less than 12 hours before, it counts as a missed review.");
      await refresh();
    });
  },
  "view-plan": () => sheet({ title: "Your locked plan", wide: true, body: planSummary(lockedPlans()[0]) }),
  unlock: (b) => sheet({
    title: "Ask to unlock your plan",
    body: html`<div class="field"><label for="u-r">Reason</label><select class="input" id="u-r" name="reason">
      <option value="monthly_checkpoint">Monthly checkpoint</option><option value="new_account">New account</option><option value="firm_rule_change">My firm changed its rules</option><option value="blown_account">Account blown (no rule broken)</option><option value="clean_month">A clean month</option><option value="other">Other</option></select></div>
      <div class="field"><label for="u-t">In a few words</label><textarea class="input" id="u-t" name="text" required minlength="5"></textarea></div>
      <p class="small muted">A reviewer decides. Your plan stays locked until then.</p>`,
    submitLabel: "Send request",
    onSubmit: async (f) => { await act("requestUnlock", { planId: b.dataset.id, reason: f.get("reason"), text: f.get("text") }); toast("Request sent."); await refresh(); },
  }),
  respond: (b) => sheet({
    title: "Your written response",
    body: html`<p class="small muted">It shows beside the ruling for the reviewer and the admin.</p><div class="field"><label for="r-t">Response</label><textarea class="input" id="r-t" name="text" required minlength="5" maxlength="3000"></textarea></div>`,
    submitLabel: "Send",
    onSubmit: async (f) => { await act("respondToViolation", { violationId: b.dataset.id, text: f.get("text") }); toast("Response added."); await refresh(); },
  }),
  pause: (b) => sheet({
    title: "Take a pause",
    body: html`<p>${b.dataset.service === "chamber" ? "Your pause starts now, with no penalty. No clips are needed while you are paused. To return, you have a MindSpace session first, and your first SOD back must match your last EOD. Any timeout days freeze until you return." : "Breaks are allowed. The paid period is not refunded or carried over."}</p>
      <div class="field"><label for="p-n">Anything you want us to know (optional)</label><textarea class="input" id="p-n" name="note" maxlength="500"></textarea></div>`,
    submitLabel: "Start the pause",
    onSubmit: async (f) => { await act("requestPause", { service: b.dataset.service, note: f.get("note") || undefined }); await refresh(); },
  }),
  return: (b) => busy(b, async () => { await act("returnFromPause", { service: "chamber" }); await refresh(); }, "Welcome back. Your next SOD needs to match your last EOD."),
  "return-build": (b) => busy(b, async () => { await act("returnFromPause", { service: "build" }); await refresh(); }, "Welcome back."),
  leave: (b) => sheet({
    title: b.dataset.service === "build" ? "Stop training" : "Leave the Chamber",
    body: html`<p>${b.dataset.service === "build" ? "Stopping needs at least seven days’ notice before your renewal date. Your sessions run to the end of the paid period." : "You can leave at any time. What happens to this month’s fee and your records is still being set with our lawyer."}</p>
      <div class="field"><label for="l-r">Why are you leaving?</label><textarea class="input" id="l-r" name="reason" required minlength="3"></textarea><span class="help">Every exit has a reason recorded. It helps us improve.</span></div>`,
    submitLabel: "Confirm",
    danger: true,
    onSubmit: async (f) => { await act("leaveService", { service: b.dataset.service, reason: f.get("reason") }); await refresh(); },
  }),
  evidence: (b) => sheet({
    title: "Send dashboard evidence",
    body: html`<p>Upload screenshots or an export of your <strong>balance and trade history</strong> from your firm’s or broker’s dashboard.</p>
      <p class="notice notice-warn small"><span>!</span><span>Never send a login, password or API key. We never need them.</span></p>
      <div class="field"><label for="ev-f">Files (images, PDF, CSV or Excel; up to 20 MB each)</label><input class="input" id="ev-f" name="files" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf,text/csv,.xlsx" required></div>`,
    submitLabel: "Send",
    onSubmit: async (f) => {
      const files = f.getAll("files").filter((x) => x && x.size);
      if (!files.length) throw new Error("Choose at least one file.");
      if (!demoMode) {
        const fb = await firebase();
        for (const file of files) {
          const safe = file.name.replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
          await fb.S.uploadBytes(fb.S.ref(fb.storage, `evidence/${S.user.uid}/${b.dataset.id}/${safe}`), file, { contentType: file.type || "application/octet-stream" });
        }
      }
      await act("submitEvidence", { requestId: b.dataset.id });
      toast("Evidence sent. The reviewer compares and records the result.");
      await refresh();
    },
  }),
  agree: async (b) => {
    if (!$("#ag-1").checked || !$("#ag-2").checked) return toast("Tick both to continue.", "bad");
    await busy(b, async () => {
      await act("setConsent", { purpose: "training_agreement", given: true });
      await act("setConsent", { purpose: "risk_statement", given: true });
      await refresh();
    }, "Accepted. Next: pay the first month.");
  },
  "choose-trainer": () => sheet({
    title: "Choose your hour",
    body: html`<div class="field"><label for="ct-h">Hour (EAT), Monday to Thursday</label><input class="input" id="ct-h" name="hour" type="time" step="3600" value="${(m("build") || {}).trainingHour || "10:00"}" required></div><div id="ct-opts"></div>`,
    submitLabel: "Find trainers",
    onSubmit: async (f, d) => {
      const hour = f.get("hour");
      const chosen = d.querySelector('input[name="trainer"]:checked');
      if (chosen) {
        await act("chooseTrainer", { hour, trainerUid: chosen.value });
        toast("Saved. Sessions follow from the next paid day.");
        await refresh();
        return true;
      }
      const res = demoMode ? { options: [{ trainerUid: "t1", name: "Volin", current: true }, { trainerUid: "t2", name: "Trainer two" }] } : await act("trainerOptions", { hour });
      const box = d.querySelector("#ct-opts");
      box.innerHTML = res.options.length
        ? String(html`<fieldset><legend>Free at ${hour}</legend><div class="radio-row">${res.options.map((o) => html`<label><input type="radio" name="trainer" value="${o.trainerUid}" ${o.current ? raw("checked") : ""}> ${o.name}${o.current ? " (yours)" : ""}</label>`)}</div></fieldset>`)
        : String(html`<p class="empty">No trainer is free at ${hour}. Try another hour.</p>`);
      d.querySelector('button[type="submit"]').textContent = "Save";
      return false;
    },
  }),
  move: (b) => sheet({
    title: "Ask to move a session",
    body: html`<p class="small muted">Moves need notice. If another slot is free in the same week, your trainer moves it. A no-show loses the session.</p><div class="field"><label for="mv">Times that work for you</label><textarea class="input" id="mv" name="note" required minlength="3"></textarea></div>`,
    submitLabel: "Send",
    onSubmit: async (f) => { await act("requestMove", { sessionId: b.dataset.id, note: f.get("note") }); toast("Sent to your trainer."); },
  }),
  "starting-note": () => sheet({
    title: "Your starting note",
    body: html`<p class="small muted">Saved once, as your fixed point.</p>
      <div class="field"><label for="sn1">What you know now</label><textarea class="input" id="sn1" name="know" required></textarea></div>
      <div class="field"><label for="sn2">What you expect</label><textarea class="input" id="sn2" name="expect" required></textarea></div>
      <div class="field"><label for="sn3">How you feel about trading right now</label><textarea class="input" id="sn3" name="feel" required></textarea></div>`,
    submitLabel: "Save",
    onSubmit: async (f) => { await act("saveStartingNote", { know: f.get("know"), expect: f.get("expect"), feel: f.get("feel") }); await refresh(); },
  }),
  pay: async (b) => {
    const service = b.dataset.service;
    let inv;
    try { inv = demoMode ? { id: "demo", amountKes: 7500, reference: "HXDEMO01", paybill: "174379", dueOn: dateKey() } : await act("getInvoice", { service }); } catch (e) { return toast(e.message, "bad"); }
    sheet({
      title: "Pay with M-Pesa",
      body: html`<p><strong>${fmtKes(inv.amountKes)}</strong> · ${SERVICES[service].name}</p>
        <div class="field"><label for="pay-phone">M-Pesa number</label><div class="prefix-input"><span>+254</span><input class="input" id="pay-phone" name="phone" inputmode="tel" value="${(S.profile.phone || "").replace("+254", "")}" required></div></div>
        <p class="small muted">You’ll get a prompt on your phone. Enter your M-Pesa PIN there. We never see your PIN.</p>
        <hr class="divider"><p class="small">Or pay by Paybill <strong class="mono">${inv.paybill || ""}</strong>, account <strong class="mono">${inv.reference}</strong>.</p>`,
      submitLabel: "Send the prompt",
      onSubmit: async (f) => {
        const r = await act("startPayment", { invoiceId: inv.id, phone: "0" + String(f.get("phone")).replace(/\D/g, "").replace(/^0/, "").slice(-9) });
        toast((r && r.message) || "Check your phone and enter your M-Pesa PIN.");
        setTimeout(refresh, 20000);
      },
    });
  },
  instalments: (b) => busy(null, async () => { await act("setInstalments", { on: b.checked }); }, b.checked ? "Two instalments from the next invoice." : "One payment a month from the next invoice."),
  consent: (b) => {
    const give = b.dataset.given === "1";
    const c = CONSENTS[b.dataset.purpose];
    sheet({
      title: give ? "Give consent" : "Withdraw consent",
      body: html`<p><strong>${c.label}</strong></p><p>${give ? "You can withdraw it again at any time." : c.required ? "This is needed for every service. Withdrawing it pauses all your services." : c.needs ? `This is needed for ${c.needs}. Withdrawing it pauses that service.` : "Nothing pauses."}</p>`,
      submitLabel: give ? "Give" : "Withdraw",
      danger: !give,
      onSubmit: async () => {
        const r = await act("setConsent", { purpose: b.dataset.purpose, given: give });
        if (r && r.paused && r.paused.length) toast(`Paused: ${r.paused.map((s) => SERVICES[s].name).join(", ")}.`);
        await refresh();
      },
    });
  },
  password: () => {
    const has = (S.user.providers || []).includes("password");
    sheet({
      title: has ? "Change password" : "Set a password",
      body: html`<p class="small muted">At least 10 characters. You will still be able to log in with your number and a code.</p>
        <div class="field"><label for="pw1">New password</label><input class="input" id="pw1" name="pw" type="password" autocomplete="new-password" minlength="10" required></div>
        <div class="field"><label for="pw2">Repeat it</label><input class="input" id="pw2" name="pw2" type="password" autocomplete="new-password" minlength="10" required></div>`,
      submitLabel: "Save",
      onSubmit: async (f) => {
        const pw = String(f.get("pw"));
        if (pw.length < 10) throw new Error("Use at least 10 characters.");
        if (pw !== f.get("pw2")) throw new Error("The two passwords are different.");
        if (demoMode) return void toast("Demo mode: nothing was saved.");
        const fb = await firebase();
        const user = fb.auth.currentUser;
        try {
          if (has) await fb.A.updatePassword(user, pw);
          else await fb.A.linkWithCredential(user, fb.A.EmailAuthProvider.credential(user.email || S.profile.email, pw));
        } catch (e) { throw new Error(friendly(e)); }
        toast("Password saved.");
        await refresh();
      },
    });
  },
  logout: async () => {
    if (demoMode) { location.href = "/"; return; }
    const fb = await firebase();
    await fb.A.signOut(fb.auth);
    location.href = "/";
  },
  export: (b) => busy(b, async () => {
    const data = demoMode ? { demo: true, profile: S.profile } : await act("exportMyData", {});
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hexhaedge-my-data-${dateKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "Your data is downloading."),
  delete: () => sheet({
    title: "Ask for deletion",
    body: html`<p>An admin carries out deletion under the retention rules and tells you what was deleted and what must be kept.</p><div class="field"><label for="del-n">Anything to add (optional)</label><textarea class="input" id="del-n" name="note"></textarea></div>`,
    submitLabel: "Send request",
    danger: true,
    onSubmit: async (f) => { await act("requestDeletion", { note: f.get("note") || undefined }); toast("Request sent."); },
  }),
  "my-log": () => sheet({
    title: "My activity log",
    wide: true,
    body: (S.audit || []).length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>What</th><th>Why</th></tr></thead><tbody>${S.audit.map((a) => html`<tr><td>${fmtDateTime(a.at)}</td><td>${String(a.action).replace(/[._]/g, " ")}</td><td>${a.reason || ""}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">Every ruling, payment and consent change that concerns you appears here.</p>`,
  }),
  avatar: () => sheet({
    title: "Profile photo",
    body: html`<div class="field"><label for="av">Choose an image (JPG, PNG or WebP, up to 5 MB)</label><input class="input" id="av" name="file" type="file" accept="image/jpeg,image/png,image/webp" required></div>`,
    submitLabel: "Upload",
    onSubmit: async (f) => {
      const file = f.get("file");
      if (!file || !file.size) throw new Error("Choose an image.");
      if (file.size > 5 * 1024 * 1024) throw new Error("That image is over 5 MB.");
      if (demoMode) return void toast("Demo mode: nothing was saved.");
      const sig = await act("avatarSignature", {});
      const body = new FormData();
      body.append("file", file);
      for (const k of ["timestamp", "folder", "public_id", "overwrite", "invalidate", "allowed_formats", "transformation", "signature", "api_key"]) body.append(k, sig[k]);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(sig.cloud_name)}/image/upload`, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error((json.error && json.error.message) || "Upload failed.");
      await act("setAvatar", { url: json.secure_url });
      toast("Photo updated.");
      await refresh();
    },
  }),
};

view.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || !actions[b.dataset.action] || b.tagName === "INPUT") return;
  e.preventDefault();
  actions[b.dataset.action](b);
});
view.addEventListener("change", (e) => {
  const b = e.target.closest('input[data-action="instalments"]');
  if (b) actions.instalments(b);
  if (e.target.name === "accountType" && $("#firm-rules")) $("#firm-rules").hidden = e.target.value !== "prop";
});
view.addEventListener("submit", async (e) => {
  if (e.target.id === "plan-form") {
    e.preventDefault();
    const intent = e.submitter ? e.submitter.value : "save";
    const data = readPlanForm(e.target);
    await busy(e.submitter, async () => {
      const r = await act("savePlanDraft", data);
      if (intent === "submit") {
        await act("submitPlan", { planId: (r && r.planId) || data.planId });
        toast("Sent. A reviewer checks every category before the plan locks.");
        await refresh();
        location.hash = "#chamber";
      } else {
        toast("Draft saved.");
        await refresh();
      }
    });
  }
  if (e.target.id === "profile-form") {
    e.preventDefault();
    const f = new FormData(e.target);
    await busy(e.submitter, async () => {
      if (demoMode) return act("noop");
      const fb = await firebase();
      await fb.F.updateDoc(fb.F.doc(fb.db, "users", S.user.uid), {
        name: String(f.get("name")).trim(),
        timezone: f.get("timezone"),
        contactChannel: f.get("contactChannel"),
        background: {
          instruments: String(f.get("instruments") || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20),
          years: Math.max(0, Math.min(60, parseInt(f.get("years") || "0", 10) || 0)),
          accounts: f.getAll("accounts"),
        },
        updatedAt: fb.F.serverTimestamp(),
      }).catch((ex) => { throw new Error(friendly(ex)); });
      await refresh();
    }, "Saved.");
  }
});

/* ------------------------------------------------------------------ */
/* Router                                                               */
/* ------------------------------------------------------------------ */

const VIEWS = { overview, services, chamber, plan: planEditor, record, build, mindspace, capital, billing, messages, settings, notifications };

async function render() {
  const [name, a, b] = (location.hash.replace(/^#/, "") || "overview").split("/");
  route = VIEWS[name] ? name : "overview";
  if (chatUnsub && route !== "messages") { chatUnsub(); chatUnsub = null; }
  mount(view, VIEWS[route](a, b));
  paintShell();
  if (route === "record") wireRecord();
  if (route === "messages") wireMessages();
  if (route === "notifications" && !demoMode) markRead();
  document.title = `${{ overview: "Dashboard", plan: "Plan", record: "Record" }[route] || route[0].toUpperCase() + route.slice(1)} · HexhaEdge`;
}

async function markRead() {
  const fb = await firebase();
  for (const n of (S.notifications || []).filter((x) => !x.read).slice(0, 20)) {
    fb.F.updateDoc(fb.F.doc(fb.db, "notifications", n.id), { read: true }).catch(() => undefined);
    n.read = true;
  }
  paintShell();
}

async function refresh() {
  S = await loadMember(S && S.user ? S.user.uid : undefined);
  await render();
}

window.addEventListener("hashchange", () => { render(); view.focus({ preventScroll: true }); window.scrollTo(0, 0); });

async function start() {
  if (demoMode) {
    $("#demo-banner").hidden = false;
    S = await loadMember();
    await render();
    if (params.get("door")) applySheet(params.get("door"));
    return;
  }
  const fb = await firebase();
  fb.A.onAuthStateChanged(fb.auth, async (user) => {
    if (!user) { location.href = "/auth/#login"; return; }
    try {
      S = await loadMember(user.uid);
      if (!S.profile) { location.href = "/auth/#signup"; return; }
      await render();
      const door = params.get("door");
      if (door && ["build", "chamber", "mindspace"].includes(door)) {
        history.replaceState(null, "", location.pathname + location.hash);
        if (door === "mindspace") location.hash = "#mindspace"; else if (st(door) === "none") applySheet(door);
      }
    } catch (e) {
      mount(view, html`<p class="notice notice-bad"><span>!</span><span>We could not load your dashboard. ${friendly(e)} <button class="link-btn" type="button" data-action="reload">Try again</button></span></p>`);
    }
  });
}

start().catch((e) => mount(view, html`<p class="notice notice-bad"><span>!</span><span>${e.message}</span></p>`));
