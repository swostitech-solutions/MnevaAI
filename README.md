# Mneva AI — Your AI Chief of Staff
### Built by Swostitech Solutions · Bengaluru, India

> *"Assistants suggest. A twin acts."*

An autonomous personal assistant: a React Native (Expo) mobile app talking to a
Node.js/Express + Prisma/PostgreSQL backend, with an OpenAI-powered agent at
its center that earns the right to act on its own over time instead of
asking every time.

---

## 🏗️ Tech Stack

| Layer        | Technology                                                                 |
|--------------|-----------------------------------------------------------------------------|
| Mobile app   | React Native (Expo), React Navigation                                      |
| Backend      | Node.js, Express, Socket.IO, JWT Auth, Winston                             |
| Data         | PostgreSQL via Prisma, Redis (sessions + BullMQ queues)                    |
| AI Engine    | OpenAI (`gpt-5-mini` by default — `OPENAI_MODEL` in `.env`)                |
| Memory       | Qdrant (vector store) + Voyage AI (embeddings)                             |
| Web search   | Tavily                                                                      |
| Voice        | Groq Whisper (STT, with an OpenAI fallback)                                |
| Email        | Gmail API, Microsoft Graph (Outlook) — OAuth, polled via BullMQ            |
| Other connections | Google Calendar/Contacts/Fit, Slack (OAuth)                          |
| Transactional email | Resend                                                               |
| Hosting      | Hostinger VPS, deployed via GitHub Actions on push to `main`               |

---

## 🚀 Local backend setup

```bash
cd backend
cp .env.example .env
# fill in DATABASE_URL, REDIS_URL, JWT_SECRET, TOKEN_ENCRYPTION_KEY,
# OPENAI_API_KEY and whichever OAuth client IDs you're testing against
npm install
npx prisma migrate deploy
npm run dev
```

The mobile app lives in `mneva/` (Expo). See `mneva/package.json` for its
own scripts; it talks to the backend over `EXPO_PUBLIC_API_URL`.

Production deploys are handled by `.github/workflows/ci.yml`: a push to
`main` runs the backend's checks (syntax, `prisma validate`, the test
suite), then SSHes into the VPS to pull, reinstall, run any pending Prisma
migrations, and restart the `mneva-backend` systemd service. There is no
Render or Docker deployment path anymore — those were used earlier in the
project and are no longer how this ships.

---

## 🤖 The Autonomy Engine

One agent loop (`backend/src/agents/autonomyEngine.js`) with a large,
domain-spanning toolset (Finance, Communications, Health, Family, Life Ops,
and more) — not a fixed small list, since tools get added as domains do.
Every tool call is logged to a signed, hash-chained ledger ("Twin Diary")
so what the agent did is always auditable after the fact.

### Trust levels (per domain, not global)

Finance, Communications, Health and Family each track their own trust
level independently — approving suggestions in one domain doesn't unlock
autonomy in another.

| Level | Name           | Behavior                                    |
|-------|----------------|----------------------------------------------|
| L1    | Observe        | Monitor silently, surface insights            |
| L2    | Suggest        | Draft actions awaiting approval               |
| L3    | Draft & Prep   | Prepare complete actions — one tap to confirm |
| L4    | Inner Circle   | Execute within that domain without asking     |

A domain starts at L1 and is promoted based on real usage (actions
observed, accept rate) — see `backend/src/services/pendingActions.service.js`.
A user can always drop a domain back down themselves from Settings; moving
up is earned, not set directly.

---

## 🔒 What's actually real vs. manual entry

Being specific here matters — a past internal audit found cases where a
screen's copy implied more automation than the code behind it had. As of
this README's last pass:

- **Real, live integrations**: Gmail, Outlook/Microsoft Graph, Google
  Calendar, Google Contacts, Slack — all OAuth-connected, polled/synced in
  the background.
- **Manual entry, AI-assisted**: Finance (bills, EMIs, portfolio holdings,
  subscriptions), Health (vitals, medications, appointments) — the user
  enters these; there's no bank/broker/health-provider data feed. The
  agent reasons over what's been entered, it doesn't fetch it from a
  third party.
- **Payments**: `initiate_payment` exists as a tracked/ledgered action, but
  there's no live UPI/bank rail behind it and biometric approval isn't yet
  cryptographically verified server-side — treat anything payment-related
  as not production-ready.

If you're changing a screen that describes what Mneva can do, check this
section (and the code it points at) first, and update it here as part of
the same change rather than letting it drift again.

---

## 🛡️ Security notes

- JWT auth (bcrypt password hashing), single-active-session enforcement.
- OAuth tokens (Google, Outlook, Slack) encrypted at rest; a growing set of
  other sensitive columns is being brought under the same scheme.
- Signed, hash-chained action ledger (Twin Diary) — every autonomous/
  approved action is recorded and independently verifiable.
- Helmet security headers, CORS restricted to the app's own origins,
  per-user rate limiting.
- See `AUDIT_FIX_TRACKING.md` for the live, honest status of every known
  gap between what's built and what's been claimed — it's a working
  document, not a promise.

---

## 📧 Contact

**Swostitech Solutions** · Bengaluru, India
