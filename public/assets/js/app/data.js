// Member data: read from Firestore (only the member's own records, as the
// rules allow), or from sample data in demo mode.
import { demoMode, firebase, call } from "../lib/fb.js";
import { dateKey, addDays, toast } from "../lib/ui.js";

export const SERVICES = {
  build: { name: "Build Your Edge", sub: "Training & Mentorship", logo: "/assets/img/doors/build.svg" },
  chamber: { name: "Follow Your Edge", sub: "Trading Accountability Chamber", logo: "/assets/img/doors/follow.svg" },
  capital: { name: "Execute Your Edge", sub: "HexhaEdge Capital", logo: "/assets/img/doors/execute.svg" },
  mindspace: { name: "Talk Your Edge", sub: "MindSpace", logo: "/assets/img/doors/talk.svg" },
};

// Mirrors backend/src/engine.js PLAN_CATEGORIES (the server is the source of truth).
export const PLAN_CATEGORIES = [
  { key: "stop_rule", label: "Stop rule", kind: "text", help: "Where the stop goes and when it is placed." },
  { key: "risk_per_trade", label: "Size or risk per trade", kind: "text", help: "For example 1% of balance, or 0.10 lots." },
  { key: "daily_loss_limit", label: "Daily loss limit", kind: "text", help: "Amount or % at which you stop for the day." },
  { key: "trades_per_day", label: "Trades per day (maximum)", kind: "int" },
  { key: "instruments", label: "Allowed instruments", kind: "list", help: "One per line." },
  { key: "sessions", label: "Sessions you trade", kind: "list", help: "For example London 10:00–13:00 EAT. One per line." },
  { key: "setups", label: "Setups you trade", kind: "list", help: "Name each setup, one per line. The daily form picks from these." },
  { key: "adding_allowed", label: "Adding to positions allowed", kind: "bool" },
  { key: "partials_allowed", label: "Partial closes allowed", kind: "bool" },
  { key: "breakeven_allowed", label: "Moving to break-even allowed", kind: "bool" },
  { key: "losing_streak_limit", label: "Losing-streak limit (trades)", kind: "int" },
];
export const FIRM_CATEGORIES = [
  { key: "firm_name", label: "Prop firm" },
  { key: "firm_daily_loss", label: "Firm daily loss rule" },
  { key: "firm_max_loss", label: "Firm maximum loss rule" },
  { key: "firm_other_rules", label: "Other firm rules, in full" },
];
export const RULE_LABELS = {
  daily_loss_limit: "Broke the daily loss limit", max_loss_limit: "Broke the maximum loss limit", no_stop: "Traded with no stop",
  wider_stop: "Stop wider than plan", size_above_plan: "Size or risk above plan", record_mismatch: "Record does not match (SOD vs prior EOD)",
  firm_rule: "Broke a prop firm rule", early_close: "Closed early against plan", breakeven_against_plan: "Moved to break-even against plan",
  adding_against_plan: "Added to a position against plan", partials_against_plan: "Took partials against plan", outside_setups: "Traded outside declared setups",
  instrument_not_allowed: "Traded an instrument not in the plan", session_not_allowed: "Traded outside declared sessions", trades_over_limit: "More trades than allowed",
  losing_streak_limit: "Kept trading past the losing-streak limit", no_pretrade_analysis: "No pre-trade analysis", clip_not_submitted: "A clip was not submitted",
  late_clip: "Clip submitted late", clip_missing_part: "Clip missing a required part", missed_checkin: "Missed check-in",
  no_review_booked: "No weekly review booked by the cut-off", missed_review: "Missed a booked weekly review",
};
export const CONSENTS = {
  terms: { label: "Terms of use", required: true },
  privacy: { label: "Privacy notice", required: true },
  clips: { label: "Recording and storage of my trading clips", needs: "Follow Your Edge" },
  sessions_ai: { label: "Recording of sessions and AI note-taking", needs: "Build Your Edge notes from AI tools" },
  share_chamber_mindspace: { label: "Sharing my record between the Chamber and MindSpace" },
  training_agreement: { label: "Training Agreement", needs: "Build Your Edge" },
  risk_statement: { label: "Risk statement", needs: "Build Your Edge" },
};

/* ------------------------------------------------------------------ */
/* Live data                                                            */
/* ------------------------------------------------------------------ */

async function loadLive(uid) {
  const fb = await firebase();
  const { F, db } = fb;
  const own = (col, extra = [], n = 50) => F.getDocs(F.query(F.collection(db, col), F.where("uid", "==", uid), ...extra, F.limit(n)))
    .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
    .catch(() => []);
  const one = (path) => F.getDoc(F.doc(db, ...path)).then((s) => (s.exists() ? { id: s.id, ...s.data() } : null)).catch(() => null);
  const desc = (f) => F.orderBy(f, "desc");

  const [profile, consentsSnap, memberships, plans, obligations, submissions, violations, timeouts, suspensions, pauses, unlocks, evidence, bookings, reports, invoices, payments, notifications, progress, startingNote, rules, weightTable, fees, gates, buildCfg, outage, audit, sessions] = await Promise.all([
    one(["users", uid]),
    F.getDocs(F.collection(db, "users", uid, "consents")).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
    own("memberships", [], 10),
    own("plans", [desc("version")], 20),
    own("obligations", [desc("date")], 30),
    own("submissions", [desc("createdAt")], 40),
    own("violations", [desc("createdAt")], 60),
    own("timeouts", [desc("createdAt")], 40),
    own("suspensions", [desc("createdAt")], 10),
    own("pauses", [desc("createdAt")], 10),
    own("unlockRequests", [], 10),
    own("evidenceRequests", [], 10),
    own("bookings", [desc("start")], 30),
    own("weeklyReports", [desc("weekStart")], 8),
    own("invoices", [desc("createdAt")], 24),
    own("payments", [desc("createdAt")], 24),
    own("notifications", [desc("createdAt")], 40),
    own("progressChecks", [desc("createdAt")], 20),
    one(["startingNotes", uid]),
    one(["settings", "rules"]), one(["settings", "weightTable"]), one(["settings", "fees"]), one(["settings", "gates"]), one(["settings", "build"]),
    one(["system", "outage"]),
    F.getDocs(F.query(F.collection(db, "audit"), F.where("subjectUid", "==", uid), desc("at"), F.limit(60))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
    F.getDocs(F.query(F.collection(db, "trainingSessions"), F.where("participants", "array-contains", uid), F.orderBy("start", "desc"), F.limit(40))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []),
  ]);

  const now = new Date();
  const slotQ = (service) => F.getDocs(F.query(F.collection(db, "slots"), F.where("service", "==", service), F.where("status", "==", "open"), F.where("start", ">=", now), F.orderBy("start"), F.limit(40)))
    .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);
  const [chamberSlots, mindSlots] = await Promise.all([slotQ("chamber"), slotQ("mindspace")]);

  const consents = {};
  for (const c of consentsSnap) consents[c.id] = c;
  const ms = {};
  for (const m of memberships) ms[m.service] = m;
  const user = fb.auth.currentUser;
  return {
    demo: false,
    user: { uid, email: user.email, phone: user.phoneNumber, emailVerified: user.emailVerified, providers: user.providerData.map((p) => p.providerId) },
    profile, consents, memberships: ms, plans, obligations, submissions, violations, timeouts, suspensions, pauses,
    unlockRequests: unlocks, evidenceRequests: evidence, bookings, weeklyReports: reports, invoices, payments, notifications,
    progressChecks: progress, startingNote, trainingSessions: sessions, audit,
    openSlots: { chamber: chamberSlots, mindspace: mindSlots },
    settings: { rules: rules || {}, weightTable: weightTable || null, fees: fees || { chamberMonthlyKes: 7500, buildMonthlyUsd: 75, usdToKes: 129 }, gates: gates || {}, build: buildCfg || {} },
    outage: outage && outage.active ? outage : null,
  };
}

/* ------------------------------------------------------------------ */
/* Demo data: the three test states from the PRD                        */
/* ------------------------------------------------------------------ */

function at(dayOffset, hhmm) {
  const k = addDays(dateKey(), dayOffset);
  const [y, m, d] = k.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 3, mm));
}

function demoState(kind) {
  const today = dateKey();
  const base = {
    demo: kind,
    user: { uid: "demo", email: "amina@example.com", phone: "+254712345678", emailVerified: true, providers: ["phone"] },
    profile: { name: "Amina Wanjiru", email: "amina@example.com", phone: "+254712345678", timezone: "Africa/Nairobi", contactChannel: "whatsapp", background: { instruments: ["XAUUSD", "US30"], years: 2, accounts: ["prop"] }, metMindspace: kind !== "new", avatarUrl: null },
    consents: { terms: { given: true, version: "0.1" }, privacy: { given: true, version: "0.1" }, clips: { given: kind !== "new", version: "0.1" }, sessions_ai: { given: false }, share_chamber_mindspace: { given: kind === "chamber" } },
    memberships: {}, plans: [], obligations: [], submissions: [], violations: [], timeouts: [], suspensions: [], pauses: [],
    unlockRequests: [], evidenceRequests: [], bookings: [], weeklyReports: [], invoices: [], payments: [], progressChecks: [], startingNote: null, trainingSessions: [], audit: [],
    notifications: [{ id: "n0", title: "Welcome to HexhaEdge", body: "Your profile is ready. Start with a MindSpace conversation.", createdAt: at(-1, "09:00"), read: kind !== "new" }],
    openSlots: {
      chamber: [1, 2, 3].map((i) => ({ id: `cs${i}`, service: "chamber", start: at(i + 1, `${9 + i * 2}:00`), minutes: 20 })),
      mindspace: [1, 2, 4].map((i) => ({ id: `ms${i}`, service: "mindspace", start: at(i, `${10 + i}:30`), minutes: 50 })),
    },
    settings: { rules: { tierDays: { minor: 1, serious: 3, critical: 5 } }, fees: { chamberMonthlyKes: 7500, buildMonthlyUsd: 75, usdToKes: 129 }, gates: {}, build: { xSpaceLink: "https://x.com/i/spaces/example" } },
    outage: null,
  };
  const plan = {
    id: "p2", uid: "demo", version: 2, status: "locked", lockedOn: addDays(today, -12), accountType: "prop", accountLabel: "FundedNext 10k",
    sodDeadline: "09:30", eodDeadline: "21:30", timezone: "Africa/Nairobi", synthetic: false,
    rules: { stop_rule: "Stop at entry, beyond the last swing", risk_per_trade: "0.5% of balance", daily_loss_limit: "2% of balance", trades_per_day: 3, instruments: ["XAUUSD", "US30"], sessions: ["London 10:00–13:00 EAT", "New York 16:30–19:00 EAT"], setups: ["Break and retest", "Liquidity sweep"], adding_allowed: false, partials_allowed: true, breakeven_allowed: false, losing_streak_limit: 2 },
    firmRules: { firm_name: "FundedNext", firm_daily_loss: "5% of starting balance", firm_max_loss: "10%", firm_other_rules: "No trading 2 minutes either side of red-folder news." },
  };
  if (kind === "chamber") {
    base.memberships = {
      chamber: { service: "chamber", state: "timeout", paymentStatus: "paid", paidUntil: addDays(today, 18), planId: "p2", lastEod: { balance: 10240.5, equity: 10240.5, date: addDays(today, -1) } },
      build: { service: "build", state: "active", paymentStatus: "paid", paidUntil: addDays(today, 9), trainerUid: "t1", trainingHour: "10:00", suggestChamber: false },
      mindspace: { service: "mindspace", state: "active" },
    };
    base.plans = [plan];
    base.obligations = [
      { id: "o0", date: today, planId: "p2", accountLabel: plan.accountLabel, sodDue: at(0, "09:30"), eodDue: at(0, "21:30"), sodStatus: "on_time", eodStatus: "pending" },
      { id: "o1", date: addDays(today, -1), planId: "p2", sodStatus: "on_time", eodStatus: "on_time" },
      { id: "o2", date: addDays(today, -2), planId: "p2", sodStatus: "late", eodStatus: "on_time" },
      { id: "o3", date: addDays(today, -3), planId: "p2", sodStatus: "on_time", eodStatus: "on_time" },
    ];
    base.violations = [
      { id: "v1", tradingDate: addDays(today, -2), category: "trades_over_limit", tier: "serious", status: "confirmed", evidence: { detail: "4 trades taken; plan allows 3" }, timeoutId: "t1", createdAt: at(-2, "22:00"), response: null },
      { id: "v2", tradingDate: addDays(today, -2), category: "late_clip", tier: "minor", status: "reversed", auto: true, evidence: { detail: "SOD received 12 minutes late" }, reverseReason: "Upload started before the deadline (network drop).", createdAt: at(-2, "10:00") },
    ];
    base.timeouts = [{ id: "t1", tier: "serious", days: 3, start: addDays(today, -1), end: addDays(today, 1), status: "active", daysRemaining: 2 }];
    base.bookings = [{ id: "b1", service: "chamber", start: at(2, "11:00"), minutes: 20, status: "booked", weekKey: today }];
    base.weeklyReports = [{ id: "r1", weekStart: addDays(today, -7), weekEnd: addDays(today, -1), figures: { clips: { onTime: 9, late: 1, missing: 0 }, violationsByTier: { minor: 0, serious: 1, critical: 0 }, cleanStreak: 1, timeouts: [{ tier: "serious" }], balanceLine: [{ date: addDays(today, -3), kind: "eod", balance: 10180 }, { date: addDays(today, -2), kind: "eod", balance: 10095 }, { date: addDays(today, -1), kind: "eod", balance: 10240.5 }] } }];
    base.invoices = [{ id: "i1", service: "chamber", amountKes: 7500, status: "paid", periodStart: addDays(today, -12), periodEnd: addDays(today, 18), reference: "HX7K2Q9M", dueOn: addDays(today, -12), receipt: "SKR4H7XQ2P" }, { id: "i2", service: "build", amountKes: 9675, status: "paid", periodStart: addDays(today, -21), periodEnd: addDays(today, 9), reference: "HXP3M8RT", dueOn: addDays(today, -21), receipt: "SKQ1L2ZB7C" }];
    base.trainingSessions = [
      { id: "s1", start: at(1, "10:00"), minutes: 45, status: "scheduled", meetLink: "https://meet.google.com/abc-defg-hij", kind: "one_to_one" },
      { id: "s0", start: at(-1, "10:00"), minutes: 45, status: "done", covered: "Marking the London range; waiting for the retest close.", observe: "Watch how price behaves at yesterday's high before entering.", kind: "one_to_one" },
    ];
    base.progressChecks = [{ id: "pc1", date: addDays(today, -9), strategy: "Setups are clearer; entries still early on the retest.", psychology: "Calmer after losses this week.", risk: "Risk per trade consistent at 0.5%.", management: "Leaving trades alone more; still moving stops by hand." }];
    base.startingNote = { know: "Basic structure, support and resistance.", expect: "To stop overtrading.", feel: "Nervous after blowing an account in August." };
    base.notifications.unshift({ id: "n1", title: "Timeout: 3 trading days", body: "Rule: More trades than allowed. No trading until the end date. Keep sending your SOD and EOD clips.", createdAt: at(-2, "22:05"), read: false });
  }
  if (kind === "paused") {
    base.memberships = {
      chamber: { service: "chamber", state: "paused", paymentStatus: "paid", paidUntil: addDays(today, 5), planId: "p2", clearedToReturn: false, stateBeforePause: "active" },
      capital: { service: "capital", state: "invited" },
      mindspace: { service: "mindspace", state: "active" },
    };
    base.plans = [plan];
    base.pauses = [{ id: "pa1", requestedOn: addDays(today, -4), byMember: true, returnedOn: null }];
    base.timeouts = [{ id: "t2", tier: "minor", days: 1, start: addDays(today, -4), end: addDays(today, -4), status: "frozen", frozenRemaining: 1 }];
    base.invoices = [{ id: "i3", service: "chamber", amountKes: 7500, status: "paid", periodStart: addDays(today, -25), periodEnd: addDays(today, 5), reference: "HXW9C4DA", dueOn: addDays(today, -25) }];
    base.notifications.unshift({ id: "n2", title: "HexhaEdge Capital: invited", body: "You have been invited. Details are in your email.", createdAt: at(-1, "12:00"), read: false });
  }
  return base;
}

/* ------------------------------------------------------------------ */

export async function loadMember(uid) {
  if (demoMode) return demoState(new URLSearchParams(location.search).get("demo") || "chamber");
  return loadLive(uid);
}

/** Calls a server function, or pretends to in demo mode. */
export async function act(name, data) {
  if (demoMode) {
    await new Promise((r) => setTimeout(r, 350));
    toast("Demo mode: nothing was saved.");
    return { ok: true, demo: true };
  }
  return call(name, data);
}

export function currentUserId() {
  return firebase().then((fb) => (fb.auth.currentUser ? fb.auth.currentUser.uid : null));
}
