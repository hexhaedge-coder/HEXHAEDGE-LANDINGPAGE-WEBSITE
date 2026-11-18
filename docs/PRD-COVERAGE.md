# PRD coverage

How each requirement in the HexhaEdge Platform PRD (18 Nov 2026) is built. "Proposed" rows from the PRD are
built as switchable settings so Volin can confirm or change them without code changes.

## Platform-wide

| ID | Where |
| --- | --- |
| P-1 Kenyan number + email, SMS code; password optional | `public/auth/`, `createProfile`; password set in Settings |
| P-2 One profile per person; lockout after failed codes | Email uniqueness checked in `createProfile`; Firebase SMS throttling + 15-min local lock |
| P-3 Roles on the profile, several memberships | Custom claims (`setRoles`); `memberships/{uid}_{service}` |
| P-4, P-5 Profile fields; single place to edit | `users/{uid}`; dashboard Settings |
| P-6, P-7 Consent per purpose, versioned, withdrawable; withdrawal pauses the service | `setConsent`, `users/{uid}/consents`, `consentEvents`; `SERVICE_NEEDS` in `profile.js` |
| P-8 Gates as settings | `settings/gates`, Rule settings → Gates |
| P-9 to P-13 M-Pesa STK + C2B, statuses, invoices, manual confirmation | `payments.js`, Billing, admin Payments |
| P-14, P-15 Channels; facts, no pressure wording | `notify.js` |
| P-16 Audit log | `audit` collection, every function |
| P-17 Admin console | `/staff/` Admin section |
| P-18 Plain English | All copy. Brand lines in Swahili/Sheng: none were supplied, so none were invented |

## Landing page and dashboard

Hero (black band, corner logo, theme switch, Log in, Create profile), 14-second logo assembly with the four
door logos popping in order, reduced-motion and slow-device still versions, one-line headline, exact intro,
Capital kept out of the hero, four services with "what it is not" and one CTA, How it works, Reality check,
cream/dark theme, footer with Terms/Privacy/Risk and registration placeholder.
Dashboard: floating dock (Overview, Services, Billing, Messages, Settings), service cards with states,
MindSpace first-door banner, Chamber view (locked plan + unlock date, today's SOD/EOD, timeout pips that are
red while counting and always show a number, weekly review booking, weekly report), billing, and the three
test states (`?demo=new`, `?demo=chamber`, `?demo=paused`).

**Note:** the prototype artifact link could not be opened from the build session, so the layout follows the
PRD's description. The door emblems in `public/assets/img/doors/` are placeholders: replace them with the
official branch logos (same file names) and everything updates. The Reality check uses the CMA figure for
2025 losses (KSh 7.12 billion); swap in the prototype's figure if it differs.

## Doors

| Area | Where |
| --- | --- |
| B-1 intake, five questions, decline reasons | `applyToService`, `decideApplication` |
| B-2 Training Agreement + Risk Statement before paying | consents `training_agreement`, `risk_statement` |
| B-3 trainer matching by free hour | `trainerOptions`, `chooseTrainer` |
| B-4 Mon–Thu sessions, Meet link, Friday X Space attendance | `daily` job (`trainingSchedule`); trainer's standing Meet room |
| B-5 move with notice; no-show loses the session | `requestMove`, `updateTrainingSession` |
| B-6 session note; AI notes only with consent | `updateTrainingSession` checks `sessions_ai` |
| B-7 starting note; progress checks, comments only | `saveStartingNote`, `saveProgressCheck` |
| B-8 small groups | `combineSessions` |
| B-9, B-10 USD 75 at admin rate, instalments, fee kept without a gap, stop with 7 days' notice | `payments.js`, `engine.feeFor`, `leaveService` |
| B-11 missed-session prompt to trainer, never a penalty | `daily` job, Mondays |
| B-12 suggest the Chamber | `suggestNextStep` |
| Chamber steps 1–4, states, C-1 to C-16 | `chamber.js`, `jobs.js`, `engine.js` |
| R-1 to R-6 rules engine | `engine.js` (+ 16 tests); every evaluation audited |
| Scheduled jobs and notification schedule | `jobs.js` (8 schedules, Nairobi time) |
| W-1 to W-8 reviewer workspace | `/staff/` Queue, Review, Violation, Plans, Calendar |
| A-1 to A-8 admin workspace | `/staff/` Members, Settings, Cases, Invitations, Payments, Reports |
| M-1 member transparency | Chamber view, My activity log |
| X-1 to X-5 HexhaEdge Capital (provisional) | `createInvitation`, `revokeInvitation`; "By invitation" / "Invited" card |
| T-1 to T-6 MindSpace (provisional) | slots/bookings, `metMindspace`, `mindspaceNotes` apart, escalation box (draft) |

## Non-functional

N-1 mobile first, installable (manifest + service worker); staff screens for laptop · N-2 fast first paint
(no build, non-blocking fonts, 19 KB logo, cached repeat visits), resumable uploads with progress, still
animation for slow devices · N-3 to N-5 see `SECURITY.md` · N-7 backups: export command in SETUP · N-8 outage
rule · N-9 retention job · N-10 WCAG: keyboard, visible focus, contrast-checked colours, reduced motion,
pips with numbers · N-11 failure alerts to admin · N-12 Nairobi time everywhere.

## Working answers built in (change in Rule settings)

| Open or proposed item | Built as |
| --- | --- |
| Missed booking / missed review = Minor timeout | On; switchable |
| Cancel later than 12 h = miss | 12 h setting |
| Upload started before deadline, finished within 30 min = on time | 30 min setting |
| Unreadable clip: resubmit within 2 h, no penalty | `requestResubmission` |
| One SOD/EOD pair per account | One obligation per locked plan |
| Several violations in a day: run together, count once at highest tier | Engine |
| Pause during timeout freezes remaining days | Engine `freezeTimeout`/`resumeTimeout` |
| Reviewer unavailable: reassign, no penalty | `reassignStaff` |
| Late payment: booking restricted, clips continue, no timeout | Payment check job |
| Clean stretch shortens review | 20 clean trading days → 10 min (setting) |
| Suspension count lifetime or expiring | Counted since the last clearance; third suspension opens an admin case |
| Member response before ruling takes effect | Response is stored; admin can override (open item) |
| Monthly Chamber fee | KES 7,500 placeholder (recommended in the PRD) |
| Retention | Clips 180 days, evidence 14 days (placeholders for the lawyer) |

## Still open (from the PRD)

Chamber fee and goodwill wording · weekly review rule confirmation · evidence rule for slip vs falsification ·
MindSpace six questions (who decides fit to trade, does the door apply to all) · Execute Your Edge five
questions · exit fee and records · capacity beyond 5 · retention periods · Build notice period, invoice
timing, trainer count · lawyer review (fee, wording, consent, data handling, hosting, ODPC registration,
Capital name) · business registration details · official door logos.
