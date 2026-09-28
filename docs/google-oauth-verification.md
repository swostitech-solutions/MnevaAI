# Google OAuth verification and CASA: Mneva

What to submit in Google Cloud Console → **Google Auth Platform** (OAuth consent screen) to get Mneva's Google scopes verified, and what to prepare for the CASA security assessment required by the restricted scopes.

Last checked against the code: 28 September 2026.

---

## 1. Consent screen ("Branding") fields

| Field | Value |
|---|---|
| App name | Mneva AI (must match the Play Store listing and the name users see on the consent screen) |
| User support email | support@swostitech.com |
| App logo | 120×120 PNG of the Mneva icon (`mneva/assets/icon.png`, resized) |
| App home page | `https://<your-domain>/`. The backend serves the homepage at `/` (`backend/src/public/index.html`); see §4 for the domain |
| Privacy policy | `https://<your-domain>/privacy-policy` (currently `https://mneva-backend-v2.onrender.com/privacy-policy`) |
| Terms of service | `https://<your-domain>/terms` (currently `https://mneva-backend-v2.onrender.com/terms`) |
| Authorized domains | Your own domain (e.g. `swostitech.com`) plus the domain that hosts the OAuth redirect URIs |
| Developer contact | support@swostitech.com |

---

## 2. Scopes to register, exactly as the code requests them

Only register these scopes; Google rejects submissions whose registered scopes differ from what the app requests.

| Scope | Category | Requested in |
|---|---|---|
| `openid`, `email`, `profile`, `userinfo.email` | Non-sensitive | All connect flows |
| `https://www.googleapis.com/auth/gmail.readonly` | **Restricted** | `backend/src/services/gmail.service.js` |
| `https://www.googleapis.com/auth/gmail.send` | Sensitive | `backend/src/services/gmail.service.js` |
| `https://www.googleapis.com/auth/calendar.events` | Sensitive | `calendar.service.js`, `gmail.service.js` |
| `https://www.googleapis.com/auth/contacts.readonly` | Sensitive | `googleContacts.service.js` |
| `https://www.googleapis.com/auth/drive.metadata.readonly` | **Restricted** | `backend/src/routes/gdrive.js` |
| `https://www.googleapis.com/auth/tasks` | Sensitive | `backend/src/routes/gtasks.js` |
| `fitness.activity.read`, `fitness.heart_rate.read`, `fitness.sleep.read`, `fitness.nutrition.read`, `fitness.body.read` | Sensitive (health) | `googleFit.service.js` |

Removed on 28 September 2026 because the code never used them: `gmail.modify`, `drive.readonly`, `documents.readonly`, `spreadsheets.readonly`, `presentations.readonly`.

---

## 3. Scope justifications (paste into the "How will the scopes be used?" boxes)

**gmail.readonly**
> Mneva is a personal assistant app. When the user connects Gmail, Mneva reads their inbox to (1) show their recent emails in the app's Mail screen, (2) identify emails that need attention (bills, deadlines, direct questions) and surface them in the user's Morning Briefing and Priorities, and (3) read an email's full body when the user asks Mneva to summarise it or draft a reply. We need read access to message content, not just metadata, because summaries, urgency detection and reply drafts depend on the message text. A narrower scope (gmail.metadata) only exposes headers and cannot support these features. Email content is sent to our AI provider (OpenAI) only to produce the summary or draft the user sees, and is never used for advertising or to train models.

**gmail.send**
> Mneva drafts email replies for the user. The user reviews the draft in the app and taps Send, and Mneva sends it from their Gmail account. Mneva also has "trust levels": by default every email needs the user's approval. Once the user has approved enough of Mneva's drafts, Mneva *offers* an "Inner Circle" level in Settings → Trust. The offer explains that Mneva will then send emails from their Gmail without asking first. It only turns on if the user taps "Allow", and they can turn it off from the same screen at any time. Every email sent is recorded in the app's Twin Diary. We only send email; we never modify, label or delete the user's existing mail.

**drive.metadata.readonly**
> Mneva's Google Workspace screens (Docs, Sheets, Slides and Drive) list the user's recent files: name, type, last-modified date and a link that opens the file in Google's own app. Mneva does not read file contents. We need metadata for all of the user's files, not only files created by Mneva, so drive.file is not sufficient. drive.metadata.readonly is the narrowest scope that lists existing files.

**calendar.events**
> Mneva shows the user's upcoming events in their daily briefing and priorities, reminds them before events, and creates events or Google Meet meetings when the user asks it to schedule something.

**contacts.readonly**
> Mneva shows the user's Google Contacts in its Contacts screen and uses them so that requests like "email Priya" or "remind me to call Dad" resolve to the right person. Read-only; Mneva never edits contacts.

**tasks**
> Mneva shows the user's Google Tasks alongside their other to-dos and lets them create and complete tasks from the app, keeping both in sync.

**fitness.\*.read**
> Mneva's Health screen shows the user's steps, heart rate, sleep, nutrition and body measurements from Google Fit, and uses them in the daily briefing (for example, "you slept 5 hours, consider a lighter day"). All access is read-only.

---

## 4. Domain and homepage

- Google requires every authorized domain to be **verified in Google Search Console** by the project owner. `mneva-backend-v2.onrender.com` is a Render subdomain, which may not be verifiable as your own domain. The safest option is to host the homepage and privacy policy on a domain you own (for example `mneva.swostitech.com`) and point the OAuth redirect URIs at a subdomain of it (a custom domain on the Render service).
- The homepage must be public (no login), describe what Mneva does, and link to the privacy policy.
- After moving to a custom domain, update `GOOGLE_*_REDIRECT_URI` / `PUBLIC_URL` on Render, the redirect URIs on the OAuth client, and `PRIVACY_POLICY_URL` in `mneva/src/api/client.js`.

---

## 5. Demo video (unlisted YouTube link)

Record on a real Android phone with the production build and the **production OAuth client**. Google rejects videos that don't show the real consent screen.

1. Open Mneva and sign in. Show the app name on the launch screen.
2. Go to Connected Accounts → **Connect Gmail**. Show the full Google consent screen and **slowly scroll through the listed permissions**. Make sure the browser address bar with the OAuth client ID (`client_id=…`) is visible at least once.
3. Approve. Show the Mail screen listing emails (**gmail.readonly**).
4. Open an email → "Summarise" (**gmail.readonly**) → "Draft reply" → review → **Send** (**gmail.send**). Show the sent email in Gmail's Sent folder.
5. Home → Morning Briefing / Priorities showing an important email.
6. Connect Calendar → show events on Home, then create an event from the app and show it in Google Calendar (**calendar.events**).
7. Connect Contacts → show the Contacts screen (**contacts.readonly**).
8. Connect Drive → open Docs / Sheets / Slides screens listing files; tap one to open it in Google's app (**drive.metadata.readonly**).
9. Connect Google Tasks → show tasks; create or complete one and show it in Google Tasks (**tasks**).
10. Connect Google Fit → Health screen showing steps, sleep and heart rate (**fitness.\***).
11. Settings → Trust → Communication: show the "Allow Inner Circle?" offer with its explanation, and the "Turn off" control once it's on. If the test account hasn't reached it, show the level screen and say that sending without asking needs this explicit opt-in.
12. Settings → Account → disconnect and Delete Account, then open the privacy policy link.

Keep it to 3–5 minutes, in English, with no editing that hides the consent screen.

---

## 6. CASA assessment (required for gmail.readonly and drive.metadata.readonly)

After the brand and scope review, Google emails you a CASA request. Tier 2 is normally required.

1. Pick an authorized lab from the App Defense Alliance CASA list (https://appdefensealliance.dev/casa) and start a Tier 2 assessment.
2. The lab scans the backend (`https://mneva-backend-v2.onrender.com`) and usually the Android APK, and sends you a findings report.
3. Fix the findings, request a rescan, and the lab sends Google a Letter of Validation.
4. Repeat every 12 months to keep the restricted scopes.

### Security fixes already made for the assessment (28 September 2026)
- OAuth `state` is HMAC-signed and expires after 15 minutes in all six Google flows (`backend/src/services/oauthState.js`). Previously a forged state could attach an attacker's Google account to someone else's Mneva account.
- CORS no longer reflects arbitrary origins, `null`, or any `*.onrender.com` site.
- `/api/debug/openai` is disabled in production.
- `/api/notify/push` refuses requests unless `NOTIFY_WEBHOOK_SECRET` is set.
- The OTP is no longer returned in API responses or logs in production when email sending fails. Previously `/forgot-password` could hand anyone a reset code.
- Wrong-OTP guesses are limited to 5 per code, login failures to 10 per email per 15 minutes, and OTPs use a cryptographic RNG.
- `npm audit fix` applied. The remaining 3 "high" advisories are in the Prisma CLI (build-time only).

- Inner Circle (L4, acting without asking, including sending email) is never entered automatically; it's offered and needs an explicit "Allow". Users who had reached L4 automatically are moved back to L3 with the offer shown (migration `20260928120000_require_inner_circle_consent`).
- In production, 500 responses no longer expose internal error text (the original is logged).
- Verification and password-reset OTPs are stored as keyed hashes, not plaintext.
- `toPublicUser` no longer returns `resetToken`, `resetTokenExp` or `currentSessionId`.
- `android:allowBackup` is off.
- A public homepage (`/`) and a full terms page (`/terms`) are live, replacing a one-line terms page with a personal email address.

### Remaining items to decide on
- **Access token lifetime:** `JWT_EXPIRES_IN=7d`. Scanners prefer 1 hour or less. The mobile app refreshes tokens automatically, and its socket now picks up refreshed tokens, so `1h` is safe for mobile. The web dashboard (`frontend/`) has **no refresh logic**, so its users would be logged out every hour until it gets one.
- **Request body limit:** 50 MB on every route. Many screens (Ask AI, Vault, Bills, FD, Loan) upload files as base64 JSON, so lowering it globally would break them. It's a low-severity finding; the proper fix is moving those uploads to multipart and then lowering the limit.
