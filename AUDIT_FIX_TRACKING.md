# Mneva AI Audit — Fix Tracking

Working doc for the "Issues to Fix" audit shared 2026-11-18. Updated as each item is actually fixed/verified — not a promise, a record of what's actually done. Status legend: ✅ Fixed & deployed · 🟡 Partial (quick-win only) · ⏭️ Deferred (needs native/APK or external action) · ⬜ Not started.

## Part A — Brochure vs Code (21)

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-06 | Google Fit shutdown | ⏭️ Deferred | Full fix needs Health Connect native module → new APK. Not started. |
| G-19 | Google OAuth verification | ⏭️ Deferred | Needs user to check Google Cloud Console (external, not code) before anything else. |
| G-04 | Plans/trial/limits/billing | ⏭️ Deferred | Full fix is a multi-week feature + Play Billing (native/APK). Quick-win not yet done. |
| G-20 | Production config audit | ✅ Fixed (commit 9939496) | Boot refuses to start in prod w/o signing/encryption keys; logs loud warning if GLOBAL_TEST_MODE_LEVEL set; added GET /api/health/config. **Found live: GLOBAL_TEST_MODE_LEVEL=4 is currently set on production** — flagged to user, awaiting decision on whether to unset it now. |
| G-05 | Export my data | ⬜ | |
| G-07 | Slack distribution/token storage | ⬜ | |
| G-18 | "End-to-end encryption" label | ⬜ | |
| G-03 | Twin Diary ledger coverage | ⬜ | |
| G-17 | Family plan seats/billing | ⬜ | |
| G-08 | Communications: one view, follow-ups | ⬜ | |
| G-14 | Payments/UPI/biometric | ⏭️ Skipped by user request | Explicitly told to skip this one. |
| G-15 | Portfolio/credit score data labeling | ⬜ | |
| G-12 | Daily Brief focus score/ranking | ⬜ | |
| G-13 | Trust levels manual set | ⬜ | |
| G-09 | Drive/Docs/Sheets file reading | ⬜ | |
| G-11 | Media & Discovery "real-time" claims | ⬜ | |
| G-16 | Health appointment reminders | ⬜ | |
| G-21 | Priorities answers not saved | ⬜ | |

## Part B — Speed (14) — not started yet
L-01 through L-14 — ⬜ all not started.

## Part C — Security & Quality (13) — not started yet
S-01 through S-13 — ⬜ all not started.

---
**Currently working on:** Part A High items, in order, skipping G-14. Next up: G-20.
