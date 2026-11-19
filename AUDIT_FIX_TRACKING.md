# Mneva AI Audit — Fix Tracking

Working doc for the "Issues to Fix" audit shared 2026-11-18. Updated as each item is actually fixed/verified — not a promise, a record of what's actually done. Status legend: ✅ Fixed & deployed · 🟡 Partial (quick-win only) · ⏭️ Deferred (needs native/APK or external action) · ⬜ Not started.

## Part A — Brochure vs Code (21)

| # | Item | Status | Notes |
|---|------|--------|-------|
| G-06 | Google Fit shutdown | ⏭️ Deferred | Full fix needs Health Connect native module → new APK. Not started. |
| G-19 | Google OAuth verification | ⏭️ Deferred | Needs user to check Google Cloud Console (external, not code) before anything else. |
| G-04 | Plans/trial/limits/billing | ⏭️ Deferred | Full fix is a multi-week feature + Play Billing (native/APK). Quick-win not yet done. |
| G-20 | Production config audit | ✅ Fixed (commit 9939496) | Boot refuses to start in prod w/o signing/encryption keys; logs loud warning if GLOBAL_TEST_MODE_LEVEL set; added GET /api/health/config. **Found live: GLOBAL_TEST_MODE_LEVEL=4 is currently set on production** — flagged to user, awaiting decision on whether to unset it now. |
| G-05 | Export my data | ✅ Fixed (commit fa6dfcd) | Real BullMQ job: zips tasks/finance/family/health/documents-list/notifications/trust/ledger/chat, emails via Resend, tokens stripped, 1/day limit, logged to ledger. Not included: Qdrant memory-text, actual document file binaries (metadata only) — noted as known scope limit. User should test by tapping Export in Settings. |
| G-07 | Slack distribution/token storage | 🟡 Partial (commit 42831cc) | Token encryption + token_revoked/app_uninstalled handler done & migrated (0 plaintext found). Distribution check + Events Subscription URL wiring are external Slack dashboard actions — user needs to do those. |
| G-18 | "End-to-end encryption" label | ✅ Fixed (commit 0b413f1) | Settings label now "Vault: end-to-end encrypted on your device"; footnote corrected. Toggle stays locked/always-on (still gates Vault.js). No backend change needed — no API text made the false claim. |
| G-03 | Twin Diary ledger coverage | ✅ Fixed (commit 77c004c) | Added ledger logging to: task create, task status update, meeting-done, meeting-cancelled (routes/tasks.js), Communications email send, document upload/delete, and AI's mark_meeting_done tool. New taxonomy entries added. |
| G-17 | Family plan seats/billing | 🟡 Partial (commit 210086d) | Quick-win labeling only ("Coming soon" badge on Family card, "Planned launch pricing" banner). Full fix (FamilyGroup entity, pooled usage) blocked on G-04 (billing doesn't exist) — deferred together. |
| G-08 | Communications: one view, follow-ups | 🟡 Partial (commit 57993c9) | Follow-up/commitment tracking now also scans Outlook sent mail (new provider column + migration, reuses the same AI classifier). Merged Gmail+Outlook+Slack inbox UI with provider chips NOT done (user chose to scope this out) — separate screens stay as-is. No in-app wording needed a fix (overclaim was brochure-only, not found in-app). |
| G-14 | Payments/UPI/biometric | ⏭️ Skipped by user request | Explicitly told to skip this one. |
| G-15 | Portfolio/credit score data labeling | ✅ Fixed (commit 2b416fb) | get_portfolio tool description no longer claims Account Aggregator/CIBIL. ConnectedAccounts' "coming soon" chips were already correct from an earlier fix. Added "manually entered" note to Portfolio screen. |
| G-12 | Daily Brief focus score/ranking | ✅ Fixed (commit c938792) | Dashboard's top-3 priority cards now ranked by a real urgency score (time-until-due + overdue + urgent-email/meeting-request boost) instead of fixed category order. FocusRing's captions were already honestly profile-scoped, no fix needed there. |
| G-13 | Trust levels manual set | ✅ Fixed (commit b6eaea9) | Removed dead /trust/upgrade + /trust/level (wrote the unused global trustLevel field). Added PATCH /trust/domain-level: lowering a domain is always allowed, raising is rejected (level is earned, not set). Settings.js Trust tab: tapping any level below current now drops straight to it with a confirm dialog — "Drop here" link on each lower level card. |
| G-09 | Drive/Docs/Sheets file reading | ⬜ | |
| G-11 | Media & Discovery "real-time" claims | ⬜ | |
| G-16 | Health appointment reminders | ⬜ | |
| G-21 | Priorities answers not saved | ⬜ | |

## Part B — Speed (14) — not started yet
L-01 through L-14 — ⬜ all not started.

## Part C — Security & Quality (13) — not started yet
S-01 through S-13 — ⬜ all not started.

---
**Currently working on:** Part A Medium items. Next up: G-09.
