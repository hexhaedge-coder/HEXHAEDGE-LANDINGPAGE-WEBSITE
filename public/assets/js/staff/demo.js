// Sample records for the staff workspace demo. Nothing here is real.
import { dateKey, addDays } from "../lib/ui.js";

const today = dateKey();
const t = (dayOffset, hh, mm = 0) => {
  const [y, m, d] = addDays(today, dayOffset).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 3, mm));
};

const plan = {
  id: "p2", uid: "u1", version: 2, status: "locked", lockedOn: addDays(today, -12), accountType: "prop", accountLabel: "FundedNext 10k",
  sodDeadline: "09:30", eodDeadline: "21:30", synthetic: false,
  rules: { stop_rule: "Stop at entry, beyond the last swing", risk_per_trade: "0.5% of balance", daily_loss_limit: "2% of balance", trades_per_day: 3, instruments: ["XAUUSD", "US30"], sessions: ["London 10:00–13:00 EAT"], setups: ["Break and retest", "Liquidity sweep"], adding_allowed: false, partials_allowed: true, breakeven_allowed: false, losing_streak_limit: 2 },
  firmRules: { firm_name: "FundedNext", firm_daily_loss: "5% of starting balance", firm_max_loss: "10%", firm_other_rules: "No trading 2 minutes either side of red-folder news." },
};

const DB = {
  users: [
    { id: "u1", name: "Amina Wanjiru", phone: "+254712345678", email: "amina@example.com", metMindspace: true },
    { id: "u2", name: "Brian Otieno", phone: "+254722000111", email: "brian@example.com", metMindspace: true },
    { id: "u3", name: "Cynthia Mwangi", phone: "+254733222333", email: "cynthia@example.com", metMindspace: false },
  ],
  memberships: [
    { id: "u1_chamber", uid: "u1", service: "chamber", state: "timeout", paymentStatus: "paid" },
    { id: "u1_build", uid: "u1", service: "build", state: "active", paymentStatus: "paid", trainerUid: "demo", trainingHour: "10:00", paidUntil: addDays(today, 9) },
    { id: "u2_chamber", uid: "u2", service: "chamber", state: "paused", paymentStatus: "paid" },
    { id: "u2_capital", uid: "u2", service: "capital", state: "invited" },
    { id: "u3_build", uid: "u3", service: "build", state: "applicant" },
  ],
  plans: [plan, { ...plan, id: "p9", uid: "u2", version: 1, status: "review", submittedAt: t(-1, 18), accountType: "personal", accountLabel: "Exness personal", rules: { ...plan.rules, losing_streak_limit: undefined } }],
  submissions: [
    { id: "s1", uid: "u1", planId: "p2", obligationId: "o0", tradingDate: today, kind: "sod", clipSeconds: 11, balance: 10240.5, equity: 10240.5, timing: "on_time", match: { match: true, reason: "match" }, flags: [], reviewStatus: "pending", priority: 2, createdAt: t(0, 9, 12), uploadedAt: t(0, 9, 12) },
    { id: "s0", uid: "u1", planId: "p2", obligationId: "o1", tradingDate: addDays(today, -1), kind: "eod", clipSeconds: 10, balance: 10240.5, equity: 10240.5, timing: "on_time", flags: [], reviewStatus: "pending", priority: 2, createdAt: t(-1, 21, 5), uploadedAt: t(-1, 21, 5),
      form: { noTrade: false, trades: [{ setup: "Break and retest", instrument: "XAUUSD", plannedEntry: 2391.2, actualEntry: 2391.6, plannedStop: 2387.0, actualStop: 2387.0, plannedSize: 0.1, actualSize: 0.1, result: 145.5, analysis: "London high broke, retest held on the 5m close." }] } },
  ],
  violations: [
    { id: "v7", uid: "u2", planId: "p3", tradingDate: addDays(today, -1), category: "record_mismatch", tier: "critical", status: "issued", needsIntent: true, evidence: { detail: "Balance moved by -42.10 since the last EOD", submissionId: "s9" }, createdAt: t(-1, 9, 40), weightTableVersion: 1 },
    { id: "v1", uid: "u1", tradingDate: addDays(today, -2), category: "trades_over_limit", tier: "serious", status: "confirmed", createdAt: t(-2, 22) },
  ],
  timeouts: [{ id: "t1", uid: "u1", tier: "serious", days: 3, start: addDays(today, -1), end: addDays(today, 1), status: "active", createdAt: t(-2, 22) }],
  unlockRequests: [{ id: "ur1", uid: "u1", planId: "p2", reason: "firm_rule_change", text: "FundedNext changed the news rule to 5 minutes.", status: "open", createdAt: t(-1, 15) }],
  evidenceRequests: [],
  slots: [{ id: "sl1", service: "chamber", staffUid: "demo", start: t(2, 11), minutes: 20, status: "open" }],
  bookings: [{ id: "b1", uid: "u1", service: "chamber", staffUid: "demo", start: t(0, 15), minutes: 20, status: "booked" }],
  applications: [{ id: "a1", uid: "u3", service: "build", status: "pending", createdAt: t(-1, 10), answers: { experience: "Six months on gold, demo then a small live account.", goal: "A process I can repeat.", time: "10:00 most weekdays.", money: "Yes, savings I can afford to lose.", expectations: "Fewer impulsive trades.", preferredHour: "10:00" } }],
  trainingSessions: [{ id: "u1_x", uid: "u1", participants: ["u1"], trainerUid: "demo", start: t(1, 10), minutes: 45, status: "scheduled", kind: "one_to_one" }],
  trainers: [{ id: "demo", name: "Volin", hours: ["09:00", "10:00"], meetLink: "https://meet.google.com/abc-defg-hij" }],
  invoices: [{ id: "i9", uid: "u2", service: "chamber", amountKes: 7500, dueOn: addDays(today, 2), reference: "HXW9C4DA", status: "unpaid" }],
  payments: [{ id: "c2b_SKQ1", source: "c2b", receipt: "SKQ1L2ZB7C", amountPaid: 7500, billRef: "AMINA", status: "unmatched" }],
  invitations: [{ id: "iv1", uid: "u2", name: "Brian Otieno", email: "brian@example.com", status: "sent" }],
  cases: [], requests: [],
  staff: [{ id: "demo", name: "Volin", email: "volin@example.com", roles: ["admin", "reviewer", "trainer", "practitioner"] }],
  audit: [{ id: "x1", actor: "system", action: "violation.confirmed", object: "violations/v1", reason: null, at: t(-2, 22) }],
  settingsHistory: [], weeklyReports: [], obligations: [],
  system: [{ id: "outage", active: false }, { id: "jobs", quarterHourly: { lastRunAt: t(0, 9, 45), ok: true }, createDailyObligations: { lastRunAt: t(0, 0, 5), ok: true } }],
  settings: [],
};

function val(o, path) { return path.split(".").reduce((x, k) => (x ? x[k] : undefined), o); }
function ms(v) { return v instanceof Date ? +v : typeof v === "string" ? v : v; }

export const demoStaff = {
  async query(col, parts) {
    let list = (DB[col] || []).slice();
    for (const p of parts) {
      if (p[0] === "where") {
        const [, f, op, v] = p;
        list = list.filter((x) => {
          const a = val(x, f);
          if (op === "==") return a === v;
          if (op === "in") return v.includes(a);
          if (op === "array-contains") return Array.isArray(a) && a.includes(v);
          if (op === ">=") return ms(a) >= ms(v);
          return true;
        });
      } else if (p[0] === "order") {
        const [, f, dir] = p;
        list.sort((a, b) => (ms(val(a, f)) > ms(val(b, f)) ? 1 : -1) * (dir === "desc" ? -1 : 1));
      } else if (p[0] === "limit") list = list.slice(0, p[1]);
    }
    return list;
  },
  async get(col, id) { return (DB[col] || []).find((x) => x.id === id) || null; },
};
