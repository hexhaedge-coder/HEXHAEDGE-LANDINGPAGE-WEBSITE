// HexhaEdge staff workspace: reviewer queue and review screen (W-1 to W-8),
// trainer and MindSpace tools, and the admin console (A-1 to A-8).
// Built for a laptop. Every change goes through a server function that
// checks the role, the two-step login and writes the audit log.
import { initThemeToggles } from "../theme.js";
import { demoMode, firebase, call, friendly } from "../lib/fb.js";
import { html, raw, $, $$, mount, toast, sheet, confirmSheet, busy, pill, ICON, fmtDate, fmtTime, fmtDateTime, fmtKes, dateKey, addDays, toDate } from "../lib/ui.js";
import { SERVICES, PLAN_CATEGORIES, FIRM_CATEGORIES, RULE_LABELS } from "../app/data.js";
import { demoStaff } from "./demo.js";

initThemeToggles();

const view = $("#view");
let me = { uid: "demo", roles: ["admin", "reviewer", "trainer", "practitioner"], name: "Demo admin" };
let fb = null;
const cache = new Map(); // uid -> profile
const has = (r) => me.roles.includes("admin") || me.roles.includes(r);

/* ------------------------------------------------------------------ */
/* Data helpers                                                         */
/* ------------------------------------------------------------------ */

async function q(col, ...parts) {
  if (demoMode) return demoStaff.query(col, parts);
  const { F, db } = fb;
  const cons = parts.map((p) => {
    if (p[0] === "where") return F.where(p[1], p[2], p[3]);
    if (p[0] === "order") return F.orderBy(p[1], p[2] || "asc");
    if (p[0] === "limit") return F.limit(p[1]);
    throw new Error("bad query part");
  });
  const snap = await F.getDocs(F.query(F.collection(db, col), ...cons));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function get(col, id) {
  if (demoMode) return demoStaff.get(col, id);
  const s = await fb.F.getDoc(fb.F.doc(fb.db, col, id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
async function person(uid) {
  if (!uid) return { name: "—" };
  if (cache.has(uid)) return cache.get(uid);
  const p = (await get("users", uid).catch(() => null)) || { name: uid.slice(0, 6) };
  cache.set(uid, p);
  return p;
}
async function names(list, key = "uid") {
  await Promise.all([...new Set(list.map((x) => x[key]))].map(person));
  return (uid) => (cache.get(uid) || {}).name || "—";
}
async function act(name, data) {
  if (demoMode) { await new Promise((r) => setTimeout(r, 300)); toast("Demo mode: nothing was saved."); return { ok: true, demo: true }; }
  return call(name, data);
}

/** End of the next trading day after a submission: the review target. */
function reviewDue(created) {
  const d = toDate(created) || new Date();
  let k = dateKey(d);
  do { k = addDays(k, 1); } while ([0, 6].includes(new Date(k + "T12:00:00Z").getUTCDay()));
  return k;
}

/* ------------------------------------------------------------------ */
/* Navigation                                                           */
/* ------------------------------------------------------------------ */

const SECTIONS = [
  ["Chamber", [["queue", "Queue", "reviewer"], ["plans", "Plans to check", "reviewer"], ["calendar", "Calendar", "reviewer|practitioner"], ["members", "Members", "reviewer|practitioner"]]],
  ["Doors", [["applications", "Applications", "admin|trainer"], ["training", "Training", "trainer"], ["mindspace", "MindSpace", "practitioner"]]],
  ["Admin", [["payments", "Payments", "admin"], ["invitations", "Capital invitations", "admin"], ["settings", "Rule settings", "admin"], ["reports", "Reports", "admin"], ["cases", "Cases and requests", "admin"], ["staff", "Staff and roles", "admin"], ["audit", "Audit log", "admin"], ["health", "Health", "admin"]]],
  ["Talk", [["inbox", "Messages", "admin|reviewer"]]],
];
function allowed(spec) { return spec.split("|").some(has); }
function paintNav(current) {
  $("#nav").innerHTML = String(html`${SECTIONS.map(([title, items]) => {
    const ok = items.filter((i) => allowed(i[2]));
    if (!ok.length) return "";
    return html`<h3>${title}</h3>${ok.map(([k, label]) => html`<a href="#${k}" ${k === current ? raw('aria-current="page"') : ""}>${label}</a>`)}`;
  })}`);
}

/* ------------------------------------------------------------------ */
/* Queue (W-1): decisions first, then routine, oldest first             */
/* ------------------------------------------------------------------ */

async function viewQueue() {
  const [subs, issued, plans, unlocks, evidence] = await Promise.all([
    q("submissions", ["where", "reviewStatus", "==", "pending"], ["order", "priority"], ["order", "createdAt"], ["limit", 200]),
    q("violations", ["where", "status", "==", "issued"], ["order", "createdAt"], ["limit", 100]),
    q("plans", ["where", "status", "==", "review"], ["order", "submittedAt"], ["limit", 50]),
    q("unlockRequests", ["where", "status", "==", "open"], ["order", "createdAt"], ["limit", 50]),
    q("evidenceRequests", ["where", "status", "in", ["submitted", "overdue"]], ["limit", 50]),
  ]);
  const name = await names([...subs, ...issued, ...plans, ...unlocks, ...evidence]);
  const decisions = [
    ...issued.filter((v) => v.needsIntent).map((v) => ({ kind: "Mismatch: intent ruling", who: v.uid, when: v.createdAt, href: `#violation/${v.id}`, note: v.tradingDuringTimeout ? "Balance moved during a timeout" : (v.evidence || {}).detail })),
    ...issued.filter((v) => !v.needsIntent).map((v) => ({ kind: `Proposed: ${RULE_LABELS[v.category] || v.category}`, who: v.uid, when: v.createdAt, href: `#violation/${v.id}`, note: (v.evidence || {}).detail })),
    ...plans.map((p) => ({ kind: "Plan awaiting acceptance", who: p.uid, when: p.submittedAt, href: `#plan/${p.id}`, note: `Version ${p.version} · ${p.accountLabel || ""}` })),
    ...unlocks.map((u) => ({ kind: "Unlock request", who: u.uid, when: u.createdAt, action: "unlock", id: u.id, note: `${u.reason.replace(/_/g, " ")}: ${u.text}` })),
    ...evidence.map((e) => ({ kind: e.status === "overdue" ? "Evidence not received" : "Evidence to check", who: e.uid, when: e.createdAt, action: "evidence-result", id: e.id, note: `${(e.files || []).length} file(s)` })),
  ];
  const byMember = new Map();
  for (const s of subs) { if (!byMember.has(s.uid)) byMember.set(s.uid, []); byMember.get(s.uid).push(s); }
  return html`
    <div class="page-head"><h1>Queue</h1><p>Decisions first, then submissions oldest first. Target: every submission ruled by the end of the next trading day.</p></div>
    <div class="section-title"><h2>Needs a decision (${decisions.length})</h2></div>
    ${decisions.length ? html`<div class="list">${decisions.map((d) => html`
      <article class="item"><div><h4>${d.kind}</h4><p>${name(d.who)}${d.note ? html` · ${d.note}` : ""}</p><p class="meta">${fmtDateTime(d.when)}</p></div>
        ${d.href ? html`<a class="btn btn-sm btn-primary" href="${d.href}">Open</a>` : html`<button class="btn btn-sm btn-primary" type="button" data-action="${d.action}" data-id="${d.id}">Decide</button>`}</article>`)}</div>` : html`<p class="empty">Nothing waiting for a decision.</p>`}
    <div class="section-title"><h2>Submissions (${subs.length})</h2></div>
    ${subs.length ? [...byMember.entries()].map(([uid, list]) => html`
      <section class="card stack"><h3 class="h-sm">${name(uid)}</h3>
        <div class="table-wrap"><table class="table"><thead><tr><th>Day</th><th>Clip</th><th>Timing</th><th>Flags</th><th>Review by</th><th></th></tr></thead><tbody>
        ${list.map((s) => html`<tr><td>${fmtDate(s.tradingDate)}</td><td>${String(s.kind).toUpperCase()}</td><td>${pill(s.timing)}</td><td>${(s.flags || []).map((f) => pill(f.needsDecision ? "critical" : "minor", f.code.replace(/_/g, " ")))}</td><td>${fmtDate(reviewDue(s.createdAt))}</td><td><a class="btn btn-sm" href="#review/${s.id}">Review</a></td></tr>`)}
        </tbody></table></div></section>`) : html`<p class="empty">All submissions are reviewed.</p>`}`;
}

/* ------------------------------------------------------------------ */
/* Review screen (W-2, W-3, W-4)                                        */
/* ------------------------------------------------------------------ */

async function viewReview(id) {
  const s = await get("submissions", id);
  if (!s) return html`<p class="empty">Submission not found.</p>`;
  const [plan, p, proposed] = await Promise.all([get("plans", s.planId), person(s.uid), q("violations", ["where", "evidence.submissionId", "==", id], ["where", "status", "==", "issued"])]);
  const rules = (plan && plan.rules) || {};
  const checks = [
    ...PLAN_CATEGORIES.map((c) => ({ key: c.key, label: c.label, val: c.kind === "bool" ? (rules[c.key] ? "Yes" : "No") : Array.isArray(rules[c.key]) ? rules[c.key].join(", ") : rules[c.key] })),
    { key: "pretrade_analysis", label: "Pre-trade analysis written", val: "" },
    { key: "clip_parts", label: "Clip shows balance and equity", val: "" },
    ...(plan && plan.accountType === "prop" ? FIRM_CATEGORIES.slice(1).map((c) => ({ key: c.key, label: `Firm: ${c.label}`, val: (plan.firmRules || {})[c.key] })) : []),
  ];
  const trades = (s.form && s.form.trades) || [];
  return html`
    <a class="back-link" href="#queue">${raw(ICON.back)} Queue</a>
    <div class="page-head row-between"><div><h1>${p.name} · ${String(s.kind).toUpperCase()} ${fmtDate(s.tradingDate)}</h1><p>Uploaded ${fmtDateTime(s.uploadedAt)} · ${s.clipSeconds}s · ${pill(s.timing)}</p></div></div>
    ${(s.flags || []).map((f) => html`<p class="notice ${f.needsDecision ? "notice-bad" : "notice-warn"}"><span>!</span><span><strong>${f.code.replace(/_/g, " ")}</strong> · ${f.detail}</span></p>`)}
    <div class="review-split">
      <div class="stack">
        <div id="player" class="card"><button class="btn btn-primary" type="button" data-action="play" data-id="${s.id}">${raw(ICON.play)} Load clip (10-minute link)</button></div>
        <section class="card"><dl class="kv"><dt>Typed balance</dt><dd class="num">${s.balance}</dd><dt>Typed equity</dt><dd class="num">${s.equity}</dd>
          ${s.match && s.match.reason !== "no_prior" ? html`<dt>Against prior EOD</dt><dd>${s.match.match ? "Matches" : html`<strong>Differs</strong>: balance ${s.match.diffBalance}, equity ${s.match.diffEquity}`}</dd>` : ""}</dl></section>
        ${s.kind === "eod" ? html`<section class="card stack"><h3 class="h-sm">The day’s form</h3>
          ${s.form && s.form.noTrade ? html`<p>No trades${s.form.timeoutDay ? " (timeout day)" : ""}.</p>` : html`<div class="table-wrap"><table class="table"><thead><tr><th>Setup</th><th>Instr.</th><th>Entry plan / actual</th><th>Stop plan / actual</th><th>Size plan / actual</th><th>Result</th></tr></thead><tbody>
            ${trades.map((t) => html`<tr><td>${t.setup}</td><td>${t.instrument}</td><td class="num">${t.plannedEntry} / ${t.actualEntry}</td><td class="num">${t.plannedStop} / ${t.actualStop}</td><td class="num">${t.plannedSize} / ${t.actualSize}</td><td class="num">${t.result}</td></tr>`)}</tbody></table></div>
            ${trades.map((t, i) => html`<p class="small"><strong>Analysis ${i + 1}:</strong> ${t.analysis}</p>`)}`}
          ${s.form && s.form.note ? html`<p class="small"><strong>Note:</strong> ${s.form.note}</p>` : ""}</section>` : ""}
      </div>
      <form class="card" id="marks-form" data-id="${s.id}" data-uid="${s.uid}">
        <h2 class="h-sm">The member’s own rules</h2>
        <p class="small muted">Mark each rule kept, broken or unclear. Broken creates a proposed violation with the suggested tier. Unclear asks for dashboard evidence.</p>
        ${checks.map((c) => html`<div class="mark-row"><div><strong>${c.label}</strong>${c.val ? html`<div class="val">${c.val}</div>` : ""}</div>
          <div class="seg" role="radiogroup" aria-label="${c.label}">${["kept", "broken", "unclear"].map((v) => html`<label><input type="radio" name="${c.key}" value="${v}">${v}</label>`)}</div></div>`)}
        <div class="field"><label for="mk-note">Note (evidence, time-stamp)</label><textarea class="input" id="mk-note" name="note" rows="2"></textarea></div>
        <div class="row"><button class="btn btn-primary" type="submit">Save marks</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="resubmit" data-id="${s.id}">Ask to resend clip</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="request-evidence" data-uid="${s.uid}" data-id="${s.id}">Ask for dashboard evidence</button></div>
      </form>
    </div>
    ${proposed.length ? html`<div class="section-title"><h2>Proposed from this clip</h2></div><div class="list">${proposed.map((v) => html`<article class="item"><div><h4>${RULE_LABELS[v.category] || v.category}</h4><p>${(v.evidence || {}).detail}</p></div><a class="btn btn-sm btn-primary" href="#violation/${v.id}">Rule on it</a></article>`)}</div>` : ""}`;
}

async function viewViolation(id) {
  const v = await get("violations", id);
  if (!v) return html`<p class="empty">Not found.</p>`;
  const p = await person(v.uid);
  const cats = Object.keys(RULE_LABELS);
  return html`
    <a class="back-link" href="#queue">${raw(ICON.back)} Queue</a>
    <div class="page-head"><h1>${v.needsIntent ? "Intent ruling" : "Violation"}</h1><p>${p.name} · ${fmtDate(v.tradingDate)} · ${pill(v.status)}</p></div>
    <div class="grid-2">
      <section class="card stack">
        <dl class="kv"><dt>Rule</dt><dd>${RULE_LABELS[v.category] || v.category}</dd><dt>Suggested tier</dt><dd>${pill(v.tier)}</dd><dt>Evidence</dt><dd>${(v.evidence || {}).detail || "—"}</dd><dt>Weight table</dt><dd>version ${v.weightTableVersion || 1}</dd></dl>
        ${v.response ? html`<p class="notice notice-info"><span>ⓘ</span><span><strong>Member’s response:</strong> ${v.response}</span></p>` : html`<p class="small muted">No written response from the member.</p>`}
        ${v.evidence && v.evidence.submissionId ? html`<p><a href="#review/${v.evidence.submissionId}">Open the clip</a></p>` : ""}
      </section>
      ${v.status !== "issued" ? html`<p class="empty">Already decided.</p>` : v.needsIntent ? html`
      <form class="card stack" id="intent-form" data-id="${v.id}">
        <h2 class="h-sm">Honest slip or falsification?</h2>
        <p class="small muted">${v.tradingDuringTimeout ? "The balance moved during a timeout. Confirming sends it to a suspension." : "An honest slip is a Critical timeout. Falsification goes to the admin as a disqualification case."}</p>
        <div class="radio-row">
          <label><input type="radio" name="ruling" value="typing_corrected"> Typing slip, the clip matches (no timeout)</label>
          <label><input type="radio" name="ruling" value="honest_slip" required> Honest slip (Critical)</label>
          <label><input type="radio" name="ruling" value="falsification"> Falsification (to admin)</label>
        </div>
        <div class="field"><label for="in-n">Written reason</label><textarea class="input" id="in-n" name="note" required minlength="5"></textarea></div>
        <button class="btn btn-primary" type="submit">Record ruling</button>
      </form>` : html`
      <form class="card stack" id="confirm-form" data-id="${v.id}">
        <h2 class="h-sm">Confirm and issue the timeout</h2>
        <div class="field"><label for="cf-c">Plan rule</label><select class="input" id="cf-c" name="category">${cats.map((c) => html`<option value="${c}" ${c === v.category ? raw("selected") : ""}>${RULE_LABELS[c]}</option>`)}</select></div>
        <div class="field"><label for="cf-t">Tier</label><select class="input" id="cf-t" name="tier">${["minor", "serious", "critical"].map((t) => html`<option value="${t}" ${t === v.tier ? raw("selected") : ""}>${t[0].toUpperCase() + t.slice(1)} (${{ minor: 1, serious: 3, critical: 5 }[t]} trading days)</option>`)}</select></div>
        <div class="field"><label for="cf-ts">Clip time-stamp</label><input class="input" id="cf-ts" name="clipTimestamp" placeholder="0:07"></div>
        <div class="field"><label for="cf-n">Note to the member</label><textarea class="input" id="cf-n" name="note" rows="2"></textarea></div>
        <div class="row"><button class="btn btn-danger" type="submit">Confirm violation</button><button class="btn btn-ghost btn-sm" type="button" data-action="dismiss" data-id="${v.id}">Dismiss</button></div>
        <p class="small muted">The member is told the rule, the evidence, the days and the end date, at once.</p>
      </form>`}
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Plan acceptance (W-6)                                                */
/* ------------------------------------------------------------------ */

async function viewPlans() {
  const plans = await q("plans", ["where", "status", "==", "review"], ["order", "submittedAt"]);
  const name = await names(plans);
  return html`<div class="page-head"><h1>Plans to check</h1><p>A plan with a blank required category cannot be accepted.</p></div>
    ${plans.length ? html`<div class="list">${plans.map((p) => html`<article class="item"><div><h4>${name(p.uid)} · version ${p.version}</h4><p class="meta">${p.accountLabel} · sent ${fmtDateTime(p.submittedAt)}</p></div><a class="btn btn-sm btn-primary" href="#plan/${p.id}">Check</a></article>`)}</div>` : html`<p class="empty">No plans waiting.</p>`}`;
}

async function viewPlan(id) {
  const p = await get("plans", id);
  if (!p) return html`<p class="empty">Not found.</p>`;
  const who = await person(p.uid);
  const blank = (c, v) => (c.kind === "bool" ? typeof v !== "boolean" : c.kind === "list" ? !Array.isArray(v) || !v.length : v === undefined || v === null || v === "");
  const rows = PLAN_CATEGORIES.map((c) => {
    const v = (p.rules || {})[c.key];
    return html`<tr><td>${c.label}</td><td>${blank(c, v) ? pill("bad", "Blank") : c.kind === "bool" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : v}</td></tr>`;
  });
  const firm = p.accountType === "prop" ? FIRM_CATEGORIES.map((c) => html`<tr><td>${c.label}</td><td>${(p.firmRules || {})[c.key] || pill("bad", "Blank")}</td></tr>`) : [];
  return html`<a class="back-link" href="#plans">${raw(ICON.back)} Plans</a>
    <div class="page-head"><h1>${who.name} · plan version ${p.version}</h1><p>${p.accountLabel} · ${p.accountType} · SOD by ${p.sodDeadline}, EOD by ${p.eodDeadline}${p.synthetic ? " · synthetic (every day)" : ""}</p></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Category</th><th>Value</th></tr></thead><tbody>${rows}${firm}</tbody></table></div>
    ${p.status === "review" ? html`<div class="row mt"><button class="btn btn-primary" type="button" data-action="accept-plan" data-id="${p.id}">Accept and lock</button><button class="btn" type="button" data-action="return-plan" data-id="${p.id}">Return with a note</button></div>` : pill(p.status)}`;
}

/* ------------------------------------------------------------------ */
/* Calendar (W-7, W-8, T-1)                                             */
/* ------------------------------------------------------------------ */

async function viewCalendar() {
  const from = new Date(Date.now() - 2 * 86400000);
  const [slots, bookings] = await Promise.all([
    q("slots", ...(me.roles.includes("admin") ? [] : [["where", "staffUid", "==", me.uid]]), ["order", "start"], ["limit", 200]).then((l) => l.filter((s) => toDate(s.start) >= from)),
    q("bookings", ...(me.roles.includes("admin") ? [] : [["where", "staffUid", "==", me.uid]]), ["order", "start"], ["limit", 200]).then((l) => l.filter((b) => toDate(b.start) >= from)),
  ]);
  const name = await names(bookings);
  const services = [has("reviewer") ? "chamber" : null, has("practitioner") ? "mindspace" : null].filter(Boolean);
  return html`<div class="page-head"><h1>Calendar</h1><p>Publish slots for the coming week. Members book one; reminders go 24 hours and 1 hour before.</p></div>
    <form class="card stack" id="slots-form">
      <h2 class="h-sm">Publish slots</h2>
      <div class="input-row">
        <div class="field"><label for="sl-s">Service</label><select class="input" id="sl-s" name="service">${services.map((s) => html`<option value="${s}">${SERVICES[s].name}</option>`)}</select></div>
        <div class="field"><label for="sl-d">Date</label><input class="input" id="sl-d" name="date" type="date" value="${addDays(dateKey(), 1)}" required></div>
        <div class="field"><label for="sl-m">Minutes</label><input class="input" id="sl-m" name="minutes" type="number" value="20" min="10" max="120"></div>
      </div>
      <div class="field"><label for="sl-t">Start times (EAT), separated by commas</label><input class="input" id="sl-t" name="times" value="09:00, 09:30, 10:00, 16:00" required></div>
      <button class="btn btn-primary" type="submit">Publish</button>
    </form>
    <div class="section-title"><h2>Bookings</h2></div>
    ${bookings.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Service</th><th>Member</th><th>Status</th><th></th></tr></thead><tbody>
      ${bookings.map((b) => html`<tr><td>${fmtDateTime(b.start)}</td><td>${SERVICES[b.service].name}</td><td>${name(b.uid)}</td><td>${pill(b.status)}</td><td>${b.status === "booked" ? html`<button class="btn btn-sm" type="button" data-action="complete" data-id="${b.id}" data-service="${b.service}" data-uid="${b.uid}" data-report="${b.reportId || ""}">Close session</button>` : ""}</td></tr>`)}
    </tbody></table></div>` : html`<p class="empty">No bookings.</p>`}
    <div class="section-title"><h2>Open slots</h2></div>
    ${slots.filter((s) => s.status === "open").length ? html`<div class="slots">${slots.filter((s) => s.status === "open").map((s) => html`<span class="slot-btn"><strong>${fmtDate(s.start)}</strong>${fmtTime(s.start)} · ${SERVICES[s.service].name} <button class="link-btn small" type="button" data-action="close-slot" data-id="${s.id}">close</button></span>`)}</div>` : html`<p class="empty">No open slots.</p>`}`;
}

/* ------------------------------------------------------------------ */
/* Members (A-1) and member detail (M-1 from the staff side)            */
/* ------------------------------------------------------------------ */

async function viewMembers() {
  const ms = await q("memberships", ["limit", 500]);
  const name = await names(ms);
  const byUid = new Map();
  for (const x of ms) { if (!byUid.has(x.uid)) byUid.set(x.uid, {}); byUid.get(x.uid)[x.service] = x; }
  return html`<div class="page-head"><h1>Members</h1><p>State per service, payment and open items.</p></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Member</th>${["build", "chamber", "capital", "mindspace"].map((s) => html`<th>${SERVICES[s].name}</th>`)}<th></th></tr></thead><tbody>
    ${[...byUid.entries()].map(([uid, row]) => html`<tr><td>${name(uid)}</td>${["build", "chamber", "capital", "mindspace"].map((s) => html`<td>${row[s] ? html`${pill(row[s].state)}${row[s].paymentStatus && row[s].paymentStatus !== "none" ? html`<br>${pill(row[s].paymentStatus)}` : ""}` : html`<span class="muted">—</span>`}</td>`)}<td><a class="btn btn-sm" href="#member/${uid}">Open</a></td></tr>`)}
    </tbody></table></div>`;
}

async function viewMember(uid) {
  const [p, ms, vs, ts, apps] = await Promise.all([
    person(uid),
    q("memberships", ["where", "uid", "==", uid]),
    has("reviewer") ? q("violations", ["where", "uid", "==", uid], ["order", "createdAt", "desc"], ["limit", 30]) : [],
    has("reviewer") ? q("timeouts", ["where", "uid", "==", uid], ["order", "createdAt", "desc"], ["limit", 20]) : [],
    me.roles.includes("admin") ? q("applications", ["where", "uid", "==", uid], ["limit", 10]) : [],
  ]);
  const chamber = ms.find((x) => x.service === "chamber");
  return html`<a class="back-link" href="#members">${raw(ICON.back)} Members</a>
    <div class="page-head"><h1>${p.name}</h1><p>${p.phone || ""} · ${p.email || ""} · ${p.metMindspace ? "Has met MindSpace" : "Has not met MindSpace"}</p></div>
    <div class="grid-2">
      <section class="card stack"><h2 class="h-sm">Services</h2>
        ${ms.map((x) => html`<div class="row-between"><span>${SERVICES[x.service].name}</span><span class="row">${pill(x.state)}${x.paymentStatus && x.paymentStatus !== "none" ? pill(x.paymentStatus) : ""}</span></div>`)}
        ${apps.filter((a) => a.status === "pending").map((a) => html`<p class="notice notice-info"><span>ⓘ</span><span>Application to ${SERVICES[a.service].name} waiting. <button class="link-btn" type="button" data-action="decide-app" data-id="${a.id}" data-service="${a.service}">Decide</button></span></p>`)}
      </section>
      <section class="card stack"><h2 class="h-sm">Actions</h2>
        <div class="row">
          ${has("practitioner") && !p.metMindspace ? html`<button class="btn btn-sm" type="button" data-action="met-mindspace" data-uid="${uid}">Mark met MindSpace</button>` : ""}
          ${has("practitioner") && chamber && chamber.state === "paused" && !chamber.clearedToReturn ? html`<button class="btn btn-sm" type="button" data-action="clear-return" data-uid="${uid}">Clear to return from pause</button>` : ""}
          ${me.roles.includes("admin") && chamber && chamber.state === "suspended" ? html`<button class="btn btn-sm btn-primary" type="button" data-action="clear-suspension" data-uid="${uid}">Clear suspension</button>` : ""}
          ${me.roles.includes("admin") ? html`
            <button class="btn btn-sm" type="button" data-action="admin-state" data-uid="${uid}" data-op="pause">Pause a service</button>
            <button class="btn btn-sm" type="button" data-action="admin-state" data-uid="${uid}" data-op="reinstate">Reinstate a service</button>
            <button class="btn btn-sm" type="button" data-action="export-member" data-uid="${uid}">Export data</button>
            <button class="btn btn-sm btn-danger" type="button" data-action="delete-member" data-uid="${uid}">Delete data</button>
            ${chamber && !["disqualified", "exited"].includes(chamber.state) ? html`<button class="btn btn-sm btn-danger" type="button" data-action="disqualify" data-uid="${uid}">Disqualify</button>` : ""}` : ""}
          ${has("reviewer") ? html`<button class="btn btn-sm btn-ghost" type="button" data-action="request-evidence" data-uid="${uid}">Ask for evidence</button>` : ""}
        </div>
      </section>
    </div>
    ${has("reviewer") ? html`<div class="section-title"><h2>Rulings</h2></div>
      ${vs.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Day</th><th>Rule</th><th>Tier</th><th>Status</th><th>Response</th><th></th></tr></thead><tbody>
        ${vs.map((v) => html`<tr><td>${fmtDate(v.tradingDate)}</td><td>${RULE_LABELS[v.category] || v.category}${v.auto ? " (auto)" : ""}</td><td>${pill(v.tier)}</td><td>${pill(v.status)}</td><td class="small">${v.response || ""}</td><td>${v.status === "confirmed" ? html`<button class="link-btn small" type="button" data-action="reverse" data-id="${v.id}">Reverse</button>` : v.status === "issued" ? html`<a class="small" href="#violation/${v.id}">Rule</a>` : ""}</td></tr>`)}
      </tbody></table></div>` : html`<p class="empty">No rulings.</p>`}
      <div class="section-title"><h2>Timeouts</h2></div>
      ${ts.length ? html`<div class="list">${ts.map((t) => html`<article class="item"><div><h4>${t.tier} · ${t.days} days</h4><p class="meta">${fmtDate(t.start)} – ${fmtDate(t.end)}</p></div>${pill(t.status === "active" ? "timeout" : t.status === "frozen" ? "paused" : t.status === "ended" ? "done" : t.status)}</article>`)}</div>` : html`<p class="empty">None.</p>`}` : ""}`;
}

/* ------------------------------------------------------------------ */
/* Applications, training, MindSpace                                    */
/* ------------------------------------------------------------------ */

async function viewApplications() {
  const apps = await q("applications", ["where", "status", "==", "pending"], ["order", "createdAt"], ["limit", 100]);
  const visible = apps.filter((a) => me.roles.includes("admin") || a.service === "build");
  const name = await names(visible);
  return html`<div class="page-head"><h1>Applications</h1><p>Admit or decline. Declines are recorded with the reason; the member reads “not the right fit at this time”.</p></div>
    ${visible.length ? html`<div class="list">${visible.map((a) => html`<article class="card stack"><div class="row-between"><h3 class="h-sm">${name(a.uid)} · ${SERVICES[a.service].name}</h3><span class="small muted">${fmtDateTime(a.createdAt)}</span></div>
      <dl class="kv">${Object.entries(a.answers || {}).map(([k, v]) => html`<dt>${k}</dt><dd>${String(v)}</dd>`)}</dl>
      <div class="row"><button class="btn btn-sm btn-primary" type="button" data-action="decide-app" data-id="${a.id}" data-service="${a.service}">Decide</button></div></article>`)}</div>` : html`<p class="empty">No applications waiting.</p>`}`;
}

async function viewTraining() {
  const from = new Date(Date.now() - 7 * 86400000);
  const [sessions, trainees, profile] = await Promise.all([
    q("trainingSessions", ...(me.roles.includes("admin") ? [] : [["where", "trainerUid", "==", me.uid]]), ["order", "start", "desc"], ["limit", 100]).then((l) => l.filter((s) => toDate(s.start) >= from)),
    q("memberships", ["where", "service", "==", "build"], ...(me.roles.includes("admin") ? [] : [["where", "trainerUid", "==", me.uid]])),
    get("trainers", me.uid),
  ]);
  const name = await names([...sessions, ...trainees]);
  return html`<div class="page-head"><h1>Training</h1><p>Your trainees only. Notes after each session; comments, never scores.</p></div>
    <section class="card stack"><h2 class="h-sm">Your hours and Meet room</h2>
      <p>${profile ? html`${(profile.hours || []).join(", ") || "No hours set"} · ${profile.meetLink || "No Meet link"}` : "Not set yet."}</p>
      <div class="row"><button class="btn btn-sm" type="button" data-action="trainer-profile">Edit</button></div></section>
    <div class="section-title"><h2>Sessions</h2></div>
    ${sessions.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Trainee</th><th>Kind</th><th>Status</th><th></th></tr></thead><tbody>
      ${sessions.map((s) => html`<tr><td>${fmtDateTime(s.start)}</td><td>${(s.participants || [s.uid]).map(name).join(", ")}${s.moveRequested ? html`<br><span class="small">Move asked: ${s.moveNote}</span>` : ""}</td><td>${s.kind === "x_space" ? "X Space" : s.group ? "Small group" : "One-on-one"}</td><td>${pill(s.status)}</td><td>${s.status === "scheduled" ? html`<button class="btn btn-sm" type="button" data-action="session" data-id="${s.id}" data-kind="${s.kind}">Update</button>` : ""}</td></tr>`)}
    </tbody></table></div>
    <p class="small"><button class="link-btn" type="button" data-action="combine">Combine two or three sessions into a small group</button></p>` : html`<p class="empty">No sessions this week.</p>`}
    <div class="section-title"><h2>Trainees</h2></div>
    ${trainees.length ? html`<div class="list">${trainees.map((t) => html`<article class="item"><div><h4>${name(t.uid)}</h4><p class="meta">${t.trainingHour || "no hour"} · ${t.state} · paid until ${t.paidUntil ? fmtDate(t.paidUntil) : "—"}</p></div>
      <div class="row"><button class="btn btn-sm" type="button" data-action="progress" data-uid="${t.uid}">Progress check</button><button class="btn btn-sm btn-ghost" type="button" data-action="next-step" data-uid="${t.uid}">Suggest the Chamber</button></div></article>`)}</div>` : html`<p class="empty">No trainees yet.</p>`}`;
}

async function viewMindspace() {
  const bookings = await q("bookings", ["where", "service", "==", "mindspace"], ...(me.roles.includes("admin") ? [] : [["where", "staffUid", "==", me.uid]]), ["order", "start", "desc"], ["limit", 60]);
  const [paused, suspended] = await Promise.all([q("memberships", ["where", "service", "==", "chamber"], ["where", "state", "==", "paused"]), q("memberships", ["where", "service", "==", "chamber"], ["where", "state", "==", "suspended"])]);
  const name = await names([...bookings, ...paused, ...suspended]);
  return html`<div class="page-head"><h1>MindSpace</h1><p>Your notes are stored apart and only you and the admin can read them. The Chamber sees attended or not, and cleared or not.</p></div>
    <p class="notice notice-warn"><span>!</span><span>The written escalation path for a member who may be in danger must be completed with a qualified professional before any session is held (T-6).</span></p>
    <div class="section-title"><h2>Chamber members waiting on MindSpace</h2></div>
    ${[...paused, ...suspended].length ? html`<div class="list">${[...paused, ...suspended].map((x) => html`<article class="item"><div><h4>${name(x.uid)}</h4><p class="meta">${x.state}${x.clearedToReturn ? " · cleared" : ""}</p></div>${x.state === "paused" && !x.clearedToReturn ? html`<button class="btn btn-sm" type="button" data-action="clear-return" data-uid="${x.uid}">Clear to return</button>` : x.state === "suspended" ? html`<span class="small muted">Admin clears suspensions</span>` : ""}</article>`)}</div>` : html`<p class="empty">Nobody waiting.</p>`}
    <div class="section-title"><h2>Sessions</h2></div>
    ${bookings.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Member</th><th>Status</th><th></th></tr></thead><tbody>${bookings.map((b) => html`<tr><td>${fmtDateTime(b.start)}</td><td>${name(b.uid)}</td><td>${pill(b.status)}</td><td>${b.status === "booked" ? html`<button class="btn btn-sm" type="button" data-action="complete" data-id="${b.id}" data-service="mindspace" data-uid="${b.uid}">Close session</button>` : ""}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No sessions.</p>`}`;
}

/* ------------------------------------------------------------------ */
/* Admin                                                                */
/* ------------------------------------------------------------------ */

async function viewPayments() {
  const [unmatched, check, unpaid] = await Promise.all([
    q("payments", ["where", "status", "==", "unmatched"], ["limit", 100]),
    q("payments", ["where", "status", "in", ["needs_check", "short"]], ["limit", 100]),
    q("invoices", ["where", "status", "in", ["unpaid", "failed", "pending"]], ["limit", 200]),
  ]);
  const name = await names(unpaid);
  return html`<div class="page-head"><h1>Payments</h1><p>Match manual Paybill payments and confirm payments made outside the system. Every change is logged with a reason.</p></div>
    <div class="row"><button class="btn btn-sm" type="button" data-action="register-c2b">Register Paybill confirmation URLs</button></div>
    <div class="section-title"><h2>Unmatched M-Pesa payments</h2></div>
    ${unmatched.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Receipt</th><th>Amount</th><th>Account typed</th><th></th></tr></thead><tbody>${unmatched.map((p) => html`<tr><td class="mono">${p.receipt}</td><td>${fmtKes(p.amountPaid)}</td><td class="mono">${p.billRef}</td><td><button class="btn btn-sm" type="button" data-action="match" data-id="${p.id}">Match to invoice</button></td></tr>`)}</tbody></table></div>` : html`<p class="empty">None.</p>`}
    ${check.length ? html`<div class="section-title"><h2>To check</h2></div><div class="list">${check.map((p) => html`<article class="item"><div><h4>${p.status === "short" ? "Short payment" : "Callback and query disagree"}</h4><p class="meta">${p.receipt || p.checkoutRequestId} · ${fmtKes(p.amountPaid || p.amountKes)}</p></div></article>`)}</div>` : ""}
    <div class="section-title"><h2>Open invoices</h2></div>
    ${unpaid.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Member</th><th>Service</th><th>Amount</th><th>Due</th><th>Reference</th><th>Status</th><th></th></tr></thead><tbody>${unpaid.map((i) => html`<tr><td>${name(i.uid)}</td><td>${SERVICES[i.service].name}</td><td>${fmtKes(i.amountKes)}</td><td>${fmtDate(i.dueOn)}</td><td class="mono">${i.reference}</td><td>${pill(i.status)}</td><td><button class="btn btn-sm" type="button" data-action="mark-paid" data-id="${i.id}">Mark paid</button></td></tr>`)}</tbody></table></div>` : html`<p class="empty">No open invoices.</p>`}`;
}

async function viewInvitations() {
  const inv = await q("invitations", ["limit", 100]);
  return html`<div class="page-head"><h1>HexhaEdge Capital invitations</h1><p>Invitation only. The invited person receives login details by email. Wording to be reviewed by the lawyer before use.</p></div>
    <form class="card stack" id="invite-form"><h2 class="h-sm">Invite someone</h2>
      <div class="input-row"><div class="field"><label for="iv-n">Name</label><input class="input" id="iv-n" name="name" required></div><div class="field"><label for="iv-e">Email</label><input class="input" id="iv-e" name="email" type="email" required></div></div>
      <div class="field"><label for="iv-r">Reason (logged)</label><input class="input" id="iv-r" name="reason" required minlength="5" placeholder="e.g. clean Chamber record, admin decision"></div>
      <button class="btn btn-primary" type="submit">Send invitation</button></form>
    <div class="section-title"><h2>Sent</h2></div>
    ${inv.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>${inv.map((i) => html`<tr><td>${i.name}</td><td>${i.email}</td><td>${pill(i.status === "sent" ? "invited" : i.status)}</td><td>${i.status === "sent" ? html`<button class="link-btn small" type="button" data-action="revoke" data-id="${i.id}">Revoke</button>` : ""}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No invitations yet.</p>`}`;
}

async function viewSettings() {
  const [rules, wt, gates, fees, cal, ret, build, history] = await Promise.all(["rules", "weightTable", "gates", "fees", "calendar", "retention", "build"].map((k) => get("settings", k)).concat([q("settingsHistory", ["order", "at", "desc"], ["limit", 15]).catch(() => [])]));
  const R = { tierDays: { minor: 1, serious: 3, critical: 5 }, suspensionWindowDays: 20, suspensionThreshold: 3, clipMinSeconds: 8, clipMaxSeconds: 15, balanceTolerance: 0, uploadGraceMinutes: 30, missingAfterHours: 24, reversalWindowHours: 24, reviewLengthMinutes: 20, shortReviewMinutes: 10, cleanStreakForShortReview: 20, cancelCutoffHours: 12, autoNoBookingTimeout: true, autoMissedReviewTimeout: true, ...(rules || {}) };
  const W = (wt && wt.categories) || Object.fromEntries(Object.entries(RULE_LABELS).map(([k, label]) => [k, { label, tier: ["late_clip", "clip_missing_part", "missed_checkin", "no_review_booked", "missed_review"].includes(k) ? "minor" : ["daily_loss_limit", "max_loss_limit", "no_stop", "wider_stop", "size_above_plan", "record_mismatch", "firm_rule"].includes(k) ? "critical" : "serious" }]));
  const F = { chamberMonthlyKes: 7500, buildMonthlyUsd: 75, usdToKes: 129, invoiceDaysBefore: 3, reminderDaysBefore: 1, ...(fees || {}) };
  const G = { mindspaceFirst: { build: true, chamber: true, capital: false }, chamberNeedsPayment: true, buildNeedsPayment: true, chamberCapacity: 5, ...(gates || {}) };
  const num = (k, label) => html`<div class="field"><label for="r-${k}">${label}</label><input class="input" id="r-${k}" name="${k}" type="number" step="any" value="${R[k]}"></div>`;
  return html`<div class="page-head"><h1>Rule settings</h1><p>Rules are data, not code. Every change keeps a history, and past rulings keep the weight-table version they were issued under.</p></div>
    <form class="card stack" data-setting="rules"><h2 class="h-sm">Timeouts, windows and clips</h2>
      <div class="grid-3">
        <div class="field"><label for="r-tm">Minor (days)</label><input class="input" id="r-tm" name="tier_minor" type="number" value="${R.tierDays.minor}"></div>
        <div class="field"><label for="r-ts">Serious (days)</label><input class="input" id="r-ts" name="tier_serious" type="number" value="${R.tierDays.serious}"></div>
        <div class="field"><label for="r-tc">Critical (days)</label><input class="input" id="r-tc" name="tier_critical" type="number" value="${R.tierDays.critical}"></div>
        ${num("suspensionWindowDays", "Suspension window (trading days)")}${num("suspensionThreshold", "Timeouts for suspension")}
        ${num("clipMinSeconds", "Clip minimum (s)")}${num("clipMaxSeconds", "Clip maximum (s)")}${num("balanceTolerance", "Balance tolerance")}
        ${num("uploadGraceMinutes", "Upload grace (min)")}${num("missingAfterHours", "Missing after (h)")}${num("reversalWindowHours", "Reversal window (h)")}
        ${num("reviewLengthMinutes", "Review length (min)")}${num("shortReviewMinutes", "Short review (min)")}${num("cleanStreakForShortReview", "Clean days for short review")}
        ${num("cancelCutoffHours", "Late-cancel cut-off (h)")}
      </div>
      <label class="check"><input type="checkbox" name="autoNoBookingTimeout" ${R.autoNoBookingTimeout ? raw("checked") : ""}><span>No booking by the cut-off is a Minor timeout (proposed)</span></label>
      <label class="check"><input type="checkbox" name="autoMissedReviewTimeout" ${R.autoMissedReviewTimeout ? raw("checked") : ""}><span>A missed or late-cancelled review is a Minor timeout (proposed)</span></label>
      ${reasonField("rules")}</form>
    <form class="card stack" data-setting="weightTable"><h2 class="h-sm">Weight table ${wt ? `(version ${wt.version})` : "(version 1, default)"}</h2>
      <div class="table-wrap"><table class="table"><thead><tr><th>Rule</th><th>Tier</th></tr></thead><tbody>${Object.entries(W).map(([k, row]) => html`<tr><td>${row.label}</td><td><select class="input" name="wt_${k}" data-label="${row.label}">${["minor", "serious", "critical"].map((t) => html`<option ${row.tier === t ? raw("selected") : ""}>${t}</option>`)}</select></td></tr>`)}</tbody></table></div>
      ${reasonField("weightTable")}</form>
    <form class="card stack" data-setting="calendar"><h2 class="h-sm">No-trade calendar</h2>
      <div class="field"><label for="cal">Dates (YYYY-MM-DD), one per line</label><textarea class="input" id="cal" name="days" rows="5">${((cal && cal.noTradeDays) || []).join("\n")}</textarea><span class="help">Removes the clip obligation for those days. Synthetic-index plans still trade every day unless listed.</span></div>
      ${reasonField("calendar")}</form>
    <form class="card stack" data-setting="fees"><h2 class="h-sm">Fees</h2>
      <div class="grid-3">
        <div class="field"><label for="f1">Chamber (KES a month)</label><input class="input" id="f1" name="chamberMonthlyKes" type="number" value="${F.chamberMonthlyKes}"></div>
        <div class="field"><label for="f2">Training (USD a month)</label><input class="input" id="f2" name="buildMonthlyUsd" type="number" step="0.01" value="${F.buildMonthlyUsd}"></div>
        <div class="field"><label for="f3">KES per USD</label><input class="input" id="f3" name="usdToKes" type="number" step="0.01" value="${F.usdToKes}"></div>
        <div class="field"><label for="f4">Invoice days before</label><input class="input" id="f4" name="invoiceDaysBefore" type="number" value="${F.invoiceDaysBefore}"></div>
        <div class="field"><label for="f5">Reminder days before</label><input class="input" id="f5" name="reminderDaysBefore" type="number" value="${F.reminderDaysBefore}"></div>
      </div>${reasonField("fees")}</form>
    <form class="card stack" data-setting="gates"><h2 class="h-sm">Gates</h2>
      <label class="check"><input type="checkbox" name="ms_build" ${G.mindspaceFirst.build ? raw("checked") : ""}><span>MindSpace first for Build Your Edge</span></label>
      <label class="check"><input type="checkbox" name="ms_chamber" ${G.mindspaceFirst.chamber ? raw("checked") : ""}><span>MindSpace first for the Chamber</span></label>
      <label class="check"><input type="checkbox" name="ms_capital" ${G.mindspaceFirst.capital ? raw("checked") : ""}><span>MindSpace first for HexhaEdge Capital</span></label>
      <label class="check"><input type="checkbox" name="chamberNeedsPayment" ${G.chamberNeedsPayment ? raw("checked") : ""}><span>Chamber: Active needs the fee paid</span></label>
      <label class="check"><input type="checkbox" name="buildNeedsPayment" ${G.buildNeedsPayment ? raw("checked") : ""}><span>Training: sessions need the fee paid</span></label>
      <div class="field"><label for="g-c">Chamber capacity</label><input class="input" id="g-c" name="chamberCapacity" type="number" value="${G.chamberCapacity}"></div>
      ${reasonField("gates")}</form>
    <form class="card stack" data-setting="retention"><h2 class="h-sm">Retention (set with the lawyer)</h2>
      <div class="grid-3"><div class="field"><label for="rt1">Clips and forms (days)</label><input class="input" id="rt1" name="clipsDays" type="number" value="${(ret && ret.clipsDays) || 180}"></div>
      <div class="field"><label for="rt2">Dashboard evidence (days)</label><input class="input" id="rt2" name="evidenceDays" type="number" value="${(ret && ret.evidenceDays) || 14}"></div>
      <div class="field"><label for="rt3">Notices (days)</label><input class="input" id="rt3" name="notificationsDays" type="number" value="${(ret && ret.notificationsDays) || 365}"></div></div>
      ${reasonField("retention")}</form>
    <form class="card stack" data-setting="build"><h2 class="h-sm">Friday X Space</h2>
      <div class="input-row"><div class="field"><label for="x1">Link</label><input class="input" id="x1" name="xSpaceLink" value="${(build && build.xSpaceLink) || ""}"></div><div class="field"><label for="x2">Time (EAT)</label><input class="input" id="x2" name="xSpaceTime" type="time" value="${(build && build.xSpaceTime) || "18:00"}"></div></div>
      ${reasonField("build")}</form>
    <div class="section-title"><h2>Recent changes</h2></div>
    ${history.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Setting</th><th>Reason</th></tr></thead><tbody>${history.map((h) => html`<tr><td>${fmtDateTime(h.at)}</td><td>${h.key}</td><td>${h.reason}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No changes yet.</p>`}`;
}
function reasonField(k) {
  return html`<div class="input-row"><div class="field"><label for="why-${k}">Reason for the change (logged)</label><input class="input" id="why-${k}" name="reason" required minlength="5"></div><div class="field"><span class="label">&nbsp;</span><button class="btn btn-primary" type="submit">Save</button></div></div>`;
}
function readSetting(key, f) {
  const n = (k) => Number(f.get(k));
  if (key === "rules") {
    const out = { tierDays: { minor: n("tier_minor"), serious: n("tier_serious"), critical: n("tier_critical") }, autoNoBookingTimeout: f.get("autoNoBookingTimeout") === "on", autoMissedReviewTimeout: f.get("autoMissedReviewTimeout") === "on" };
    for (const k of ["suspensionWindowDays", "suspensionThreshold", "clipMinSeconds", "clipMaxSeconds", "balanceTolerance", "uploadGraceMinutes", "missingAfterHours", "reversalWindowHours", "reviewLengthMinutes", "shortReviewMinutes", "cleanStreakForShortReview", "cancelCutoffHours"]) out[k] = n(k);
    return out;
  }
  if (key === "weightTable") {
    const categories = {};
    for (const [k, v] of f.entries()) if (k.startsWith("wt_")) categories[k.slice(3)] = { tier: v, label: $(`select[name="${k}"]`).dataset.label };
    return { categories };
  }
  if (key === "calendar") return { noTradeDays: String(f.get("days") || "").split(/\s+/).filter(Boolean) };
  if (key === "fees") return { chamberMonthlyKes: n("chamberMonthlyKes"), buildMonthlyUsd: n("buildMonthlyUsd"), usdToKes: n("usdToKes"), invoiceDaysBefore: n("invoiceDaysBefore"), reminderDaysBefore: n("reminderDaysBefore") };
  if (key === "gates") return { mindspaceFirst: { build: f.get("ms_build") === "on", chamber: f.get("ms_chamber") === "on", capital: f.get("ms_capital") === "on" }, chamberNeedsPayment: f.get("chamberNeedsPayment") === "on", buildNeedsPayment: f.get("buildNeedsPayment") === "on", chamberCapacity: n("chamberCapacity") };
  if (key === "retention") return { clipsDays: n("clipsDays"), evidenceDays: n("evidenceDays"), notificationsDays: n("notificationsDays") };
  if (key === "build") return { xSpaceLink: f.get("xSpaceLink"), xSpaceTime: f.get("xSpaceTime") };
  return {};
}

async function viewReports() {
  const since = new Date(Date.now() - 30 * 86400000);
  const [obligations, subs, vs, bookings, ms, payments] = await Promise.all([
    q("obligations", ["limit", 2000]), q("submissions", ["limit", 2000]), q("violations", ["limit", 2000]),
    q("bookings", ["where", "service", "==", "chamber"], ["limit", 1000]), q("memberships", ["where", "service", "==", "chamber"], ["limit", 500]),
    q("payments", ["limit", 1000]),
  ]);
  const recent = (x, f) => (toDate(x[f]) || new Date(0)) >= since;
  const clipStates = obligations.flatMap((o) => [o.sodStatus, o.eodStatus]).filter((s) => s && s !== "pending");
  const onTime = clipStates.length ? Math.round((clipStates.filter((s) => s === "on_time").length / clipStates.length) * 100) : 0;
  const reviewed = subs.filter((s) => s.reviewedAt);
  const inTime = reviewed.filter((s) => dateKey(toDate(s.reviewedAt)) <= reviewDue(s.createdAt)).length;
  const conf = vs.filter((v) => v.status === "confirmed" && recent(v, "createdAt"));
  const members = ms.filter((x) => ["active", "timeout", "paused", "suspended", "plan_rewrite"].includes(x.state)).length || 1;
  const tiers = { minor: 0, serious: 0, critical: 0 };
  for (const v of conf) tiers[v.tier]++;
  const done = bookings.filter((b) => b.status === "done").length;
  const missed = bookings.filter((b) => b.status === "missed").length;
  const stk = payments.filter((p) => p.source === "stk");
  return html`<div class="page-head"><h1>Reports</h1><p>The Chamber’s own conduct numbers and the platform’s reliability. Never member profit.</p></div>
    <div class="stat-row">
      <div class="stat"><div class="n num">${onTime}%</div><div class="l">clips on time (target 95%)</div></div>
      <div class="stat"><div class="n num">${reviewed.length ? Math.round((inTime / reviewed.length) * 100) : 0}%</div><div class="l">reviewed by end of next trading day (target 90%)</div></div>
      <div class="stat"><div class="n num">${(conf.length / members).toFixed(1)}</div><div class="l">rule breaks per member, last 30 days</div></div>
      <div class="stat"><div class="n num">${tiers.minor}/${tiers.serious}/${tiers.critical}</div><div class="l">timeouts Minor/Serious/Critical, 30 days</div></div>
      <div class="stat"><div class="n num">${done}/${done + missed}</div><div class="l">weekly reviews attended</div></div>
      <div class="stat"><div class="n num">${stk.length ? Math.round((stk.filter((p) => p.status === "paid").length / stk.length) * 100) : 0}%</div><div class="l">STK prompts paid</div></div>
      <div class="stat"><div class="n num">${ms.filter((x) => x.state === "exited").length}</div><div class="l">exits (each with a reason)</div></div>
    </div>`;
}

async function viewCases() {
  const [cases, reqs] = await Promise.all([q("cases", ["where", "status", "==", "open"], ["limit", 100]), q("requests", ["where", "status", "==", "open"], ["limit", 100])]);
  const name = await names([...cases, ...reqs]);
  return html`<div class="page-head"><h1>Cases and requests</h1><p>Disqualification is never automatic. Only you apply it, with a reason from the permitted list.</p></div>
    <div class="section-title"><h2>Cases</h2></div>
    ${cases.length ? html`<div class="list">${cases.map((c) => html`<article class="item"><div><h4>${name(c.uid)} · ${c.kind.replace(/_/g, " ")}</h4><p>${c.detail}</p></div><div class="row"><a class="btn btn-sm" href="#member/${c.uid}">Member</a><button class="btn btn-sm btn-ghost" type="button" data-action="close-case" data-id="${c.id}">Close</button></div></article>`)}</div>` : html`<p class="empty">No open cases.</p>`}
    <div class="section-title"><h2>Member requests</h2></div>
    ${reqs.length ? html`<div class="list">${reqs.map((r) => html`<article class="item"><div><h4>${name(r.uid)} · ${r.kind}</h4><p>${r.note || ""}</p><p class="meta">${fmtDateTime(r.createdAt)}</p></div><div class="row"><a class="btn btn-sm" href="#member/${r.uid}">Member</a><button class="btn btn-sm btn-ghost" type="button" data-action="close-request" data-id="${r.id}">Close</button></div></article>`)}</div>` : html`<p class="empty">No open requests.</p>`}`;
}

async function viewStaff() {
  const staff = await q("staff", ["limit", 100]);
  return html`<div class="page-head"><h1>Staff and roles</h1><p>Roles take effect at the person’s next login. Staff need two-step login.</p></div>
    <form class="card stack" id="roles-form"><h2 class="h-sm">Set roles</h2>
      <div class="field"><label for="ro-u">Person’s user ID</label><input class="input" id="ro-u" name="uid" required><span class="help">Open the person in Members; the ID is in the address after #member/.</span></div>
      <div class="radio-row">${["admin", "reviewer", "trainer", "practitioner"].map((r) => html`<label><input type="checkbox" name="roles" value="${r}"> ${r}</label>`)}</div>
      <div class="field"><label for="ro-r">Reason (logged)</label><input class="input" id="ro-r" name="reason" required minlength="5"></div>
      <button class="btn btn-primary" type="submit">Save roles</button></form>
    <div class="section-title"><h2>Current staff</h2></div>
    ${staff.length ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Roles</th></tr></thead><tbody>${staff.map((s) => html`<tr><td>${s.name || "—"}</td><td>${s.email || ""}</td><td>${(s.roles || []).join(", ")}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No staff yet.</p>`}`;
}

async function viewAudit() {
  const list = await q("audit", ["order", "at", "desc"], ["limit", 150]);
  return html`<div class="page-head"><h1>Audit log</h1><p>Every ruling, timeout, suspension, pause, override, payment change and consent change. Nothing here can be edited.</p></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Object</th><th>Reason</th></tr></thead><tbody>${list.map((a) => html`<tr><td>${fmtDateTime(a.at)}</td><td class="mono small">${String(a.actor).slice(0, 10)}</td><td>${a.action}</td><td class="mono small">${a.object || ""}</td><td class="small">${a.reason || ""}</td></tr>`)}</tbody></table></div>`;
}

async function viewHealth() {
  const [outage, jobs, events] = await Promise.all([get("system", "outage"), get("system", "jobs"), demoMode ? [] : fb.F.getDocs(fb.F.query(fb.F.collection(fb.db, "system", "health", "events"), fb.F.orderBy("at", "desc"), fb.F.limit(50))).then((s) => s.docs.map((d) => d.data())).catch(() => [])]);
  const o = outage || {};
  return html`<div class="page-head"><h1>Health</h1><p>If the platform is down or uploads are failing at a deadline, deadlines extend and no automatic violation is issued. Members are never punished for a fault of ours.</p></div>
    <section class="card stack"><div class="row-between"><h2 class="h-sm">Outage rule</h2>${o.active ? pill("bad", o.confirmed ? "On" : "On, needs your confirmation") : pill("ok", "Off")}</div>
      ${o.note ? html`<p class="small">${o.note}</p>` : ""}
      <div class="row"><button class="btn btn-sm ${o.active ? "" : "btn-danger"}" type="button" data-action="outage" data-on="${o.active && o.confirmed ? "0" : "1"}">${o.active && o.confirmed ? "Turn off" : o.active ? "Confirm it is on" : "Turn on"}</button>${o.active && !o.confirmed ? html`<button class="btn btn-sm btn-ghost" type="button" data-action="outage" data-on="0">Turn off</button>` : ""}</div></section>
    <div class="section-title"><h2>Scheduled jobs</h2></div>
    ${jobs ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Job</th><th>Last run</th><th>Result</th></tr></thead><tbody>${Object.entries(jobs).filter(([k]) => k !== "id").map(([k, j]) => html`<tr><td>${k}</td><td>${fmtDateTime(j.lastRunAt)}</td><td>${j.ok ? pill("ok", "OK") : html`${pill("bad", "Failed")} <span class="small">${j.error || ""}</span>`}</td></tr>`)}</tbody></table></div>` : html`<p class="empty">No runs recorded yet.</p>`}
    <div class="section-title"><h2>Recent events</h2></div>
    ${events.length ? html`<div class="list">${events.map((e) => html`<article class="item"><div><h4>${e.kind.replace(/_/g, " ")}</h4><p>${e.text}</p></div><span class="meta">${fmtDateTime(e.at)}</span></article>`)}</div>` : html`<p class="empty">No failures reported.</p>`}`;
}

async function viewInbox() {
  if (demoMode) return html`<div class="page-head"><h1>Messages</h1></div><p class="empty">Member messages appear here, newest first.</p>`;
  const { F, db } = fb;
  const snap = await F.getDocs(F.query(F.collectionGroup(db, "messages"), F.orderBy("at", "desc"), F.limit(100)));
  const msgs = snap.docs.map((d) => ({ thread: d.ref.parent.parent.id, ...d.data() }));
  const threads = [...new Set(msgs.map((x) => x.thread))];
  await Promise.all(threads.map(person));
  return html`<div class="page-head"><h1>Messages</h1><p>Member threads, newest first.</p></div>
    ${threads.length ? html`<div class="list">${threads.map((t) => { const last = msgs.find((x) => x.thread === t); return html`<article class="item"><div><h4>${(cache.get(t) || {}).name || t}</h4><p>${last.byStaff ? "You: " : ""}${last.text}</p><p class="meta">${fmtDateTime(last.at)}</p></div><button class="btn btn-sm" type="button" data-action="reply" data-uid="${t}">Reply</button></article>`; })}</div>` : html`<p class="empty">No messages.</p>`}`;
}

/* ------------------------------------------------------------------ */
/* Actions                                                              */
/* ------------------------------------------------------------------ */

const reasonInput = (label = "Written reason (logged)") => html`<div class="field"><label for="why">${label}</label><textarea class="input" id="why" name="reason" required minlength="5"></textarea></div>`;

const actions = {
  play: async (b) => {
    if (demoMode) { $("#player").innerHTML = String(html`<p class="empty">Demo: the clip would play here from a 10-minute signed link.</p>`); return; }
    await busy(b, async () => {
      const r = await call("getClipUrl", { kind: "submission", id: b.dataset.id });
      $("#player").innerHTML = String(html`<video src="${r.url}" controls autoplay muted playsinline></video><p class="small muted">Link expires in 10 minutes. Viewing is logged.</p>`);
    });
  },
  resubmit: (b) => sheet({ title: "Ask to resend the clip", body: html`<p class="small muted">No penalty when the first upload was valid and on time. Due within 2 hours.</p>${reasonInput("What is wrong with the clip")}`, submitLabel: "Ask", onSubmit: async (f) => { await act("requestResubmission", { submissionId: b.dataset.id, note: f.get("reason") }); toast("Asked."); } }),
  "request-evidence": (b) => sheet({ title: "Ask for dashboard evidence", body: html`<p class="small muted">The member sends balance and trade history straight from the firm’s or broker’s dashboard. We never hold a login.</p><div class="field"><label for="eh">Due in (hours)</label><input class="input" id="eh" name="hours" type="number" value="24" min="1" max="168"></div><div class="field"><label for="en">Note to the member</label><textarea class="input" id="en" name="note">Please send your balance and trade history for this week from your firm's dashboard.</textarea></div>`, submitLabel: "Send request", onSubmit: async (f) => { await act("requestEvidence", { uid: b.dataset.uid, submissionId: b.dataset.id || undefined, dueHours: Number(f.get("hours")), note: f.get("note") }); toast("Requested."); } }),
  "evidence-result": async (b) => {
    const r = await get("evidenceRequests", b.dataset.id);
    sheet({
      title: "Record the evidence check",
      body: html`${(r.files || []).length ? html`<ul>${r.files.map((f) => html`<li><button class="link-btn" type="button" data-file="${f}">${f.split("/").pop()}</button></li>`)}</ul>` : html`<p class="muted">No files received.</p>`}
        <div class="radio-row"><label><input type="radio" name="result" value="consistent" required> Consistent with the record</label><label><input type="radio" name="result" value="inconsistent"> Inconsistent</label><label><input type="radio" name="result" value="not_received"> Not received</label></div>
        <label class="check"><input type="checkbox" name="keep"><span>A ruling depends on these files: keep them. Otherwise they are deleted now.</span></label>${reasonInput("What you found")}`,
      submitLabel: "Save",
      onSubmit: async (f) => { await act("recordEvidenceResult", { requestId: r.id, result: f.get("result"), keep: f.get("keep") === "on", note: f.get("reason") }); await go(); },
    }).addEventListener("click", async (e) => {
      const fb2 = e.target.closest("[data-file]");
      if (!fb2 || demoMode) return;
      const res = await call("getClipUrl", { kind: "evidence", id: r.id, file: fb2.dataset.file });
      window.open(res.url, "_blank", "noopener");
    });
  },
  unlock: (b) => sheet({ title: "Unlock request", body: html`<div class="radio-row"><label><input type="radio" name="approve" value="1" required> Approve: the member writes a new version</label><label><input type="radio" name="approve" value="0"> Decline</label></div>${reasonInput("Note to the member")}`, submitLabel: "Decide", onSubmit: async (f) => { await act("decideUnlock", { requestId: b.dataset.id, approve: f.get("approve") === "1", note: f.get("reason") }); await go(); } }),
  dismiss: (b) => sheet({ title: "Dismiss the proposed violation", body: reasonInput(), submitLabel: "Dismiss", onSubmit: async (f) => { await act("dismissViolation", { violationId: b.dataset.id, reason: f.get("reason") }); location.hash = "#queue"; } }),
  reverse: (b) => sheet({ title: "Reverse a ruling", body: html`<p class="small muted">Reviewers can reverse an automatic ruling within 24 hours. Admins can override any ruling. Both are logged.</p>${reasonInput()}`, submitLabel: "Reverse", danger: true, onSubmit: async (f) => { await act("reverseViolation", { violationId: b.dataset.id, reason: f.get("reason") }); await go(); } }),
  "accept-plan": (b) => sheet({ title: "Accept and lock the plan", body: html`<p>Every category is filled. The plan locks today and can unlock after about a month.</p><div class="field"><label for="an">Note (optional)</label><textarea class="input" id="an" name="note"></textarea></div>`, submitLabel: "Accept and lock", onSubmit: async (f) => { await act("decidePlan", { planId: b.dataset.id, decision: "accept", note: f.get("note") || undefined }); location.hash = "#plans"; } }),
  "return-plan": (b) => sheet({ title: "Return the plan", body: html`<p class="small muted">Say exactly what is missing or cannot be enforced from a clip.</p><div class="field"><label for="rn">Note</label><textarea class="input" id="rn" name="note" required minlength="5"></textarea></div>`, submitLabel: "Return", onSubmit: async (f) => { await act("decidePlan", { planId: b.dataset.id, decision: "return", note: f.get("note") }); location.hash = "#plans"; } }),
  "close-slot": (b) => busy(b, async () => { await act("closeSlot", { slotId: b.dataset.id }); await go(); }),
  complete: async (b) => {
    const report = b.dataset.report ? await get("weeklyReports", b.dataset.report) : null;
    const f = report && report.figures;
    sheet({
      title: b.dataset.service === "chamber" ? "Weekly review" : "MindSpace session",
      wide: true,
      body: html`${f ? html`<div class="stat-row"><div class="stat"><div class="n">${f.clips.onTime}/${f.clips.late}/${f.clips.missing}</div><div class="l">clips on time / late / missing</div></div><div class="stat"><div class="n">${f.violationsByTier.minor}/${f.violationsByTier.serious}/${f.violationsByTier.critical}</div><div class="l">rulings M/S/C</div></div><div class="stat"><div class="n">${f.cleanStreak}</div><div class="l">clean days in a row</div></div></div>` : ""}
        <div class="radio-row"><label><input type="radio" name="outcome" value="done" required> Review done</label><label><input type="radio" name="outcome" value="no_show"> Did not attend</label><label><input type="radio" name="outcome" value="reschedule"> Reschedule</label></div>
        <div class="field"><label for="cn">${b.dataset.service === "chamber" ? "What the member did well, and the pattern to watch (the member reads this)" : "Your note (stored apart; only you and the admin can read it)"}</label><textarea class="input" id="cn" name="note" rows="4"></textarea></div>`,
      submitLabel: "Save",
      onSubmit: async (fd) => { await act("completeBooking", { bookingId: b.dataset.id, outcome: fd.get("outcome"), note: fd.get("note") || undefined }); await go(); },
    });
  },
  "decide-app": (b) => sheet({
    title: `Application · ${SERVICES[b.dataset.service].name}`,
    body: html`<div class="radio-row"><label><input type="radio" name="decision" value="accept" required> Accept</label><label><input type="radio" name="decision" value="decline"> Decline</label></div>
      <div class="field"><label for="dr">If declining, the reason (recorded, not shown to the member)</label><select class="input" id="dr" name="reason"><option value="">—</option>${["signals_wanted", "wants_someone_to_trade", "money_cannot_afford", "needs_income_soon", "expects_quick_money", "rejects_risk_statement", "capacity", "other"].map((r) => html`<option value="${r}">${r.replace(/_/g, " ")}</option>`)}</select></div>
      <div class="field"><label for="dn">Note (optional)</label><textarea class="input" id="dn" name="note"></textarea></div>`,
    submitLabel: "Save",
    onSubmit: async (f) => { if (f.get("decision") === "decline" && !f.get("reason")) throw new Error("Pick the decline reason."); await act("decideApplication", { applicationId: b.dataset.id, decision: f.get("decision"), reason: f.get("reason") || undefined, note: f.get("note") || undefined }); await go(); },
  }),
  "met-mindspace": (b) => busy(b, async () => { await act("markMetMindspace", { uid: b.dataset.uid }); await go(); }, "Recorded."),
  "clear-return": (b) => sheet({ title: "Clear to return", body: reasonInput("Note (logged; not your session notes)"), submitLabel: "Clear", onSubmit: async (f) => { await act("clearToReturn", { uid: b.dataset.uid, note: f.get("reason") }); await go(); } }),
  "clear-suspension": (b) => sheet({ title: "Clear suspension", body: html`<p class="small muted">For release 1 an admin marks the member cleared to return, after MindSpace.</p>${reasonInput()}`, submitLabel: "Clear", onSubmit: async (f) => { await act("clearSuspension", { uid: b.dataset.uid, note: f.get("reason") }); await go(); } }),
  "admin-state": (b) => sheet({ title: b.dataset.op === "pause" ? "Pause a service" : "Reinstate a service", body: html`<div class="field"><label for="as">Service</label><select class="input" id="as" name="service">${Object.keys(SERVICES).map((s) => html`<option value="${s}">${SERVICES[s].name}</option>`)}</select></div>${reasonInput()}`, submitLabel: "Save", onSubmit: async (f) => { await act("adminSetState", { uid: b.dataset.uid, service: f.get("service"), action: b.dataset.op, note: f.get("reason") }); await go(); } }),
  disqualify: (b) => sheet({ title: "Disqualify from the Chamber", danger: true, body: html`<div class="field"><label for="dq">Reason</label><select class="input" id="dq" name="code" required><option value="falsified_record">Falsifying a record</option><option value="abuse">Abusing members or the Chamber</option><option value="third_suspension">A third suspension</option><option value="trading_during_suspension">Trading during a suspension</option></select></div>${reasonInput()}`, submitLabel: "Disqualify", onSubmit: async (f) => { await act("disqualify", { uid: b.dataset.uid, reasonCode: f.get("code"), note: f.get("reason") }); await go(); } }),
  "export-member": (b) => sheet({ title: "Export member data", body: reasonInput("Reason (e.g. member request of date)"), submitLabel: "Export", onSubmit: async (f) => {
    const data = await act("exportMemberData", { uid: b.dataset.uid, reason: f.get("reason") });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = `member-${b.dataset.uid}-${dateKey()}.json`; a.click();
  } }),
  "delete-member": (b) => sheet({ title: "Delete member data", danger: true, body: html`<div class="radio-row"><label><input type="radio" name="scope" value="media" required> Clips and evidence only</label><label><input type="radio" name="scope" value="all"> Everything allowed (profile, login, notes)</label></div><p class="small muted">Rulings and the audit log stay where the lawyer advises they are needed to treat other members fairly.</p>${reasonInput()}`, submitLabel: "Delete", onSubmit: async (f) => { if (!(await confirmSheet("This cannot be undone", "Deleted files and profile details cannot be brought back.", "Delete", true))) return false; await act("deleteMemberData", { uid: b.dataset.uid, scope: f.get("scope"), reason: f.get("reason") }); location.hash = "#members"; } }),
  "trainer-profile": () => sheet({ title: "Your hours and Meet room", body: html`<div class="field"><label for="tn">Name members see</label><input class="input" id="tn" name="name" required value="${me.name || ""}"></div><div class="field"><label for="th">Hours you teach (EAT), comma separated</label><input class="input" id="th" name="hours" value="09:00, 10:00, 11:00"></div><div class="field"><label for="tm">Standing Google Meet link</label><input class="input" id="tm" name="meet" placeholder="https://meet.google.com/abc-defg-hij"></div>`, submitLabel: "Save", onSubmit: async (f) => { await act("saveTrainerProfile", { name: f.get("name"), hours: String(f.get("hours")).split(",").map((s) => s.trim()).filter(Boolean), meetLink: f.get("meet") || undefined }); await go(); } }),
  session: (b) => sheet({ title: "Update session", wide: true, body: html`<div class="radio-row">${b.dataset.kind === "x_space" ? html`<label><input type="radio" name="status" value="attended" required> Attended</label><label><input type="radio" name="status" value="absent"> Absent</label>` : html`<label><input type="radio" name="status" value="done" required> Done</label><label><input type="radio" name="status" value="missed"> No-show (session lost)</label><label><input type="radio" name="status" value="moved"> Move</label>`}</div>
    <div class="field"><label for="sc">What was covered</label><textarea class="input" id="sc" name="covered"></textarea></div><div class="field"><label for="so">What to observe before next time</label><textarea class="input" id="so" name="observe"></textarea></div>
    <div class="field"><label for="sn">New time (for a move, same week)</label><input class="input" id="sn" name="newStart" type="datetime-local"></div>
    <div class="field"><label for="sai">AI notes (only where the trainee’s consent is on file)</label><textarea class="input" id="sai" name="ai"></textarea></div>`, submitLabel: "Save", onSubmit: async (f) => { const ns = f.get("newStart"); await act("updateTrainingSession", { sessionId: b.dataset.id, status: f.get("status"), covered: f.get("covered") || undefined, observe: f.get("observe") || undefined, newStart: ns ? new Date(ns).toISOString() : undefined, aiNotes: f.get("ai") || undefined }); await go(); } }),
  combine: () => sheet({ title: "Small group", body: html`<p class="small muted">Two or three trainees at the same level and time. They are told beforehand; the fee does not change.</p><div class="field"><label for="cb">Session IDs, comma separated</label><input class="input" id="cb" name="ids" required></div>`, submitLabel: "Combine", onSubmit: async (f) => { await act("combineSessions", { sessionIds: String(f.get("ids")).split(",").map((s) => s.trim()).filter(Boolean) }); await go(); } }),
  progress: (b) => sheet({ title: "Progress check", wide: true, body: html`<p class="small muted">Comments only. There are no scores, points or marks anywhere.</p>${[["strategy", "Strategy"], ["psychology", "Psychology and behaviour"], ["risk", "Risk and reward management"], ["management", "Trade management"]].map(([k, l]) => html`<div class="field"><label for="pc-${k}">${l}</label><textarea class="input" id="pc-${k}" name="${k}" required></textarea></div>`)}`, submitLabel: "Save", onSubmit: async (f) => { await act("saveProgressCheck", { uid: b.dataset.uid, strategy: f.get("strategy"), psychology: f.get("psychology"), risk: f.get("risk"), management: f.get("management") }); } }),
  "next-step": (b) => sheet({ title: "Suggest Follow Your Edge", body: html`<p>It is the trainee’s decision, not a requirement.</p><div class="field"><label for="ns">Note (optional)</label><textarea class="input" id="ns" name="note"></textarea></div>`, submitLabel: "Suggest", onSubmit: async (f) => { await act("suggestNextStep", { uid: b.dataset.uid, note: f.get("note") || undefined }); } }),
  "mark-paid": (b) => sheet({ title: "Mark paid manually", body: html`<div class="field"><label for="mr">M-Pesa or bank reference</label><input class="input" id="mr" name="ref"></div>${reasonInput()}`, submitLabel: "Mark paid", onSubmit: async (f) => { await act("markPaidManually", { invoiceId: b.dataset.id, reference: f.get("ref") || undefined, reason: f.get("reason") }); await go(); } }),
  match: (b) => sheet({ title: "Match payment to invoice", body: html`<div class="field"><label for="mi">Invoice ID</label><input class="input" id="mi" name="invoice" required></div>${reasonInput()}`, submitLabel: "Match", onSubmit: async (f) => { await act("matchPayment", { paymentId: b.dataset.id, invoiceId: f.get("invoice"), reason: f.get("reason") }); await go(); } }),
  "register-c2b": (b) => busy(b, () => act("registerC2bUrls", {}), "Registered with Safaricom."),
  revoke: (b) => sheet({ title: "Revoke invitation", body: reasonInput(), submitLabel: "Revoke", danger: true, onSubmit: async (f) => { await act("revokeInvitation", { invitationId: b.dataset.id, reason: f.get("reason") }); await go(); } }),
  "close-case": (b) => sheet({ title: "Close case", body: reasonInput("Outcome"), submitLabel: "Close", onSubmit: async (f) => { await act("resolveCase", { caseId: b.dataset.id, note: f.get("reason") }); await go(); } }),
  "close-request": (b) => sheet({ title: "Close request", body: reasonInput("What was done"), submitLabel: "Close", onSubmit: async (f) => { await act("closeRequest", { requestId: b.dataset.id, note: f.get("reason") }); await go(); } }),
  outage: (b) => sheet({ title: b.dataset.on === "1" ? "Outage rule on" : "Outage rule off", body: reasonInput(), submitLabel: "Save", onSubmit: async (f) => { await act("setOutageMode", { active: b.dataset.on === "1", reason: f.get("reason") }); await go(); } }),
  reply: (b) => sheet({ title: `Reply to ${(cache.get(b.dataset.uid) || {}).name || "member"}`, body: html`<div class="field"><label for="rp">Message</label><textarea class="input" id="rp" name="text" required maxlength="2000"></textarea></div>`, submitLabel: "Send", onSubmit: async (f) => { const { F, db } = fb; await F.addDoc(F.collection(db, "threads", b.dataset.uid, "messages"), { from: me.uid, text: String(f.get("text")).trim(), at: F.serverTimestamp(), byStaff: true }); await go(); } }),
};

view.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || !actions[b.dataset.action]) return;
  e.preventDefault();
  actions[b.dataset.action](b);
});

view.addEventListener("submit", async (e) => {
  const form = e.target;
  const f = new FormData(form);
  const btn = e.submitter;
  if (form.id === "marks-form") {
    e.preventDefault();
    const marks = {};
    for (const [k, v] of f.entries()) if (k !== "note") marks[k] = v;
    await busy(btn, async () => {
      const r = await act("markSubmission", { submissionId: form.dataset.id, marks, note: f.get("note") || undefined });
      if (r && r.needsEvidence) actions["request-evidence"]({ dataset: { uid: form.dataset.uid, id: form.dataset.id } });
      if (r && r.violations && r.violations.length) location.hash = `#violation/${r.violations[0].violationId}`;
      else if (!(r && r.needsEvidence)) location.hash = "#queue";
    }, "Marks saved.");
  } else if (form.id === "confirm-form") {
    e.preventDefault();
    await busy(btn, async () => { await act("confirmViolation", { violationId: form.dataset.id, category: f.get("category"), tier: f.get("tier"), clipTimestamp: f.get("clipTimestamp") || undefined, note: f.get("note") || undefined }); location.hash = "#queue"; }, "Confirmed. The member has been told.");
  } else if (form.id === "intent-form") {
    e.preventDefault();
    await busy(btn, async () => { await act("intentRuling", { violationId: form.dataset.id, ruling: f.get("ruling"), note: f.get("note") }); location.hash = "#queue"; }, "Ruling recorded.");
  } else if (form.id === "slots-form") {
    e.preventDefault();
    const date = f.get("date");
    const slots = String(f.get("times")).split(",").map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => {
      const [h, mm] = t.split(":").map(Number);
      return { start: new Date(`${date}T${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+03:00`).toISOString(), minutes: Number(f.get("minutes")) };
    });
    await busy(btn, async () => { await act("publishSlots", { service: f.get("service"), slots }); await go(); }, `${slots.length} slots published.`);
  } else if (form.id === "invite-form") {
    e.preventDefault();
    await busy(btn, async () => {
      const r = await act("createInvitation", { name: f.get("name"), email: f.get("email"), reason: f.get("reason") });
      if (r && r.setupLink) sheet({ title: "Email not sent", body: html`<p>Email is not set up, so send this one-time setup link to the person yourself, privately:</p><p class="mono small">${r.setupLink}</p>` });
      await go();
    }, "Invitation created.");
  } else if (form.id === "roles-form") {
    e.preventDefault();
    await busy(btn, async () => { await act("setRoles", { uid: f.get("uid"), roles: f.getAll("roles"), reason: f.get("reason") }); await go(); }, "Roles saved.");
  } else if (form.dataset.setting) {
    e.preventDefault();
    await busy(btn, async () => { await act("updateSettings", { key: form.dataset.setting, value: readSetting(form.dataset.setting, f), reason: f.get("reason") }); await go(); }, "Saved, with history.");
  }
});

/* ------------------------------------------------------------------ */
/* Router and start                                                     */
/* ------------------------------------------------------------------ */

const ROUTES = {
  queue: [viewQueue, "reviewer"], review: [viewReview, "reviewer"], violation: [viewViolation, "reviewer"], plans: [viewPlans, "reviewer"], plan: [viewPlan, "reviewer"],
  calendar: [viewCalendar, "reviewer|practitioner"], members: [viewMembers, "reviewer|practitioner"], member: [viewMember, "reviewer|practitioner|trainer"],
  applications: [viewApplications, "admin|trainer"], training: [viewTraining, "trainer"], mindspace: [viewMindspace, "practitioner"],
  payments: [viewPayments, "admin"], invitations: [viewInvitations, "admin"], settings: [viewSettings, "admin"], reports: [viewReports, "admin"],
  cases: [viewCases, "admin"], staff: [viewStaff, "admin"], audit: [viewAudit, "admin"], health: [viewHealth, "admin"], inbox: [viewInbox, "admin|reviewer"],
};

function firstAllowed() { return Object.keys(ROUTES).find((k) => allowed(ROUTES[k][1]) && !["review", "violation", "plan", "member"].includes(k)) || "queue"; }

async function go() {
  const [name, arg] = (location.hash.replace(/^#/, "") || firstAllowed()).split("/");
  const r = ROUTES[name] && allowed(ROUTES[name][1]) ? name : firstAllowed();
  paintNav(r);
  try {
    mount(view, await ROUTES[r][0](arg));
  } catch (e) {
    mount(view, html`<p class="notice notice-bad"><span>!</span><span>Could not load this screen. ${friendly(e)}</span></p>`);
  }
}

window.addEventListener("hashchange", () => { go(); view.focus({ preventScroll: true }); });
$("#logout").innerHTML = ICON.logout;

function enrolScreen(user) {
  mount(view, html`<div class="narrow"><div class="page-head"><h1>Turn on two-step login</h1><p>Staff screens need a code from your phone at every login.</p></div>
    <form class="card stack" id="enrol-form"><div class="field"><label for="en-p">Your mobile number</label><input class="input" id="en-p" name="phone" placeholder="+2547…" required></div>
    <div class="field" hidden id="en-code-f"><label for="en-c">Code</label><input class="input" id="en-c" name="code" inputmode="numeric" maxlength="6"></div>
    <button class="btn btn-primary" type="submit">Send code</button><div id="recaptcha-box"></div></form></div>`);
  let verificationId = null;
  const verifier = new fb.A.RecaptchaVerifier(fb.auth, "recaptcha-box", { size: "invisible" });
  $("#enrol-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await busy(e.submitter, async () => {
      if (!verificationId) {
        const session = await fb.A.multiFactor(user).getSession();
        verificationId = await new fb.A.PhoneAuthProvider(fb.auth).verifyPhoneNumber({ phoneNumber: String(f.get("phone")).trim(), session }, verifier);
        $("#en-code-f").hidden = false;
        e.submitter.textContent = "Turn on";
        return;
      }
      const cred = fb.A.PhoneAuthProvider.credential(verificationId, String(f.get("code")).trim());
      await fb.A.multiFactor(user).enroll(fb.A.PhoneMultiFactorGenerator.assertion(cred), "Phone");
      toast("Two-step login is on. Please log in again.");
      await fb.A.signOut(fb.auth);
      setTimeout(() => { location.href = "/auth/#login"; }, 1200);
    }).catch((ex) => toast(friendly(ex), "bad"));
  });
}

async function start() {
  if (demoMode) {
    $("#demo-banner").hidden = false;
    $("#who").textContent = "Demo admin";
    $("#logout").addEventListener("click", () => { location.href = "/"; });
    await go();
    return;
  }
  fb = await firebase();
  $("#logout").addEventListener("click", async () => { await fb.A.signOut(fb.auth); location.href = "/"; });
  fb.A.onAuthStateChanged(fb.auth, async (user) => {
    if (!user) { location.href = "/auth/#login"; return; }
    const t = await user.getIdTokenResult(true);
    me = { uid: user.uid, roles: ["admin", "reviewer", "trainer", "practitioner"].filter((r) => t.claims[r] === true), name: user.displayName || user.email };
    if (!me.roles.length) { location.href = "/app/"; return; }
    $("#who").textContent = `${me.name || ""} · ${me.roles.join(", ")}`;
    const enrolled = fb.A.multiFactor(user).enrolledFactors.length > 0;
    if (!enrolled) { enrolScreen(user); return; }
    if (!(t.claims.firebase && t.claims.firebase.sign_in_second_factor)) {
      mount(view, html`<p class="notice notice-warn"><span>!</span><span>Log out and log in again with your password and phone code to open staff screens.</span></p>`);
      return;
    }
    await go();
  });
}

start().catch((e) => mount(view, html`<p class="notice notice-bad"><span>!</span><span>${friendly(e)}</span></p>`));
