# Mneva AI v2 — Your AI Chief of Staff
### Built by Swostitech Solutions · Bengaluru, India

> *"Assistants suggest. A twin acts."*

Production-grade autonomous personal assistant — React 18 + Node.js/Express + Prisma/PostgreSQL + DeepSeek AI agents + Socket.IO real-time.

---

## 🏗️ Tech Stack

| Layer        | Technology                                                                 |
|--------------|----------------------------------------------------------------------------|
| Frontend     | React 18, Vite, Zustand, Framer Motion, TanStack Query, Recharts, Tailwind |
| Backend      | Node.js 20, Express, Socket.IO, JWT Auth, Winston                          |
| AI Engine    | DeepSeek chat models — 13 domain tools                                     |
| Real-time    | Socket.IO — agent streaming, action approve/deny, ledger sync              |
| Auth         | JWT + bcrypt — 7-day token, refresh flow                                   |
| Data         | PostgreSQL via Prisma                                                        |

---

## 🚀 Quick Start (5 minutes)

### Prerequisites
- Node 20+
- Docker Desktop

### Local setup
```bash
cp backend/.env.example backend/.env
# Fill in the required keys in backend/.env
cd docker && docker compose up -d
cd backend && npm install && npx prisma migrate deploy && npm run dev
```

### Required API keys
- DEEPSEEK_API_KEY (deepseek.com)
- VOYAGE_API_KEY (dash.voyageai.com — free tier available)

### Docker deploy
```bash
cd docker && docker compose up --build
```

| Service   | URL                              |
|-----------|----------------------------------|
| Frontend  | http://localhost:5173            |
| Backend   | http://localhost:3001            |
| API Health| http://localhost:3001/api/health |

### Create Your Account
Open the frontend and register a real user. The app no longer creates or uses a demo account automatically.

---

## 🤖 AI Agent — 13 Domain Tools

The Autonomy Engine uses DeepSeek with 13 tools covering all pitch deck capabilities:

| Tool                   | Domain        | Description                                    |
|------------------------|---------------|------------------------------------------------|
| `get_daily_brief`      | Core          | Morning brief — actions, insights, weather     |
| `query_bills`          | Finance       | Fetch bills by status (due, pending, paid)     |
| `initiate_payment`     | Finance       | UPI payment with biometric gate                |
| `get_portfolio`        | Finance       | Holdings, SIPs, CIBIL, net worth via AA        |
| `get_spending_summary` | Finance       | Category-wise spend + savings rate             |
| `get_emails`           | Comms         | Inbox with follow-up radar                     |
| `draft_reply`          | Comms         | Context-aware reply in user's tone             |
| `send_email`           | Comms         | Send approved drafts (Trust L2+)               |
| `get_health_data`      | Health        | Vitals, appointments, medications              |
| `book_cab`             | Life Ops      | Ola/Uber with driver + fare estimate           |
| `order_food`           | Life Ops      | Swiggy/Zomato order flow                       |
| `set_reminder`         | Core          | Commitment tracker + reminders                 |
| `personal_search`      | Core          | Cross-domain search — email, payments, health  |

---

## 🔒 Trust Level System (Autonomy Engine)

| Level | Name           | Behavior                                  |
|-------|----------------|-------------------------------------------|
| L1    | Observe        | Monitor silently, surface insights        |
| L2    | Suggest        | Draft actions awaiting approval           |
| **L3**| **Draft & Prep**| **Prepare complete actions — one tap**   |
| L4    | Inner Circle   | Execute goals autonomously                |

New users start at L1. Trust score grows from approved real actions.

---

## 📁 Full Project Structure

```
mneva-ai-v2/
├── backend/src/
│   ├── server.js                 # Express + Socket.IO
│   ├── agents/
│   │   └── autonomyEngine.js     # ⭐ DeepSeek AI + 13 tools
│   ├── routes/                   # 10 route groups
│   ├── services/
│   │   ├── ledgerService.js      # Signed action ledger
│   │   ├── socketService.js      # Real-time events
│   ├── models/
│   │   └── userStore.js          # User + auth store
│   └── middleware/               # JWT auth, error handler
│
└── frontend/src/
    ├── App.jsx                   # Router + auth guard
    ├── store/index.js            # Zustand — auth, UI, chat
    ├── services/
    │   ├── api.js                # All API endpoints
    │   └── socket.js             # Socket.IO hook
    └── components/
        ├── auth/LoginPage.jsx
        ├── layout/AppLayout.jsx  # Sidebar + topbar + search + notifs
        ├── dashboard/Dashboard.jsx  # Autonomy Engine brief
        ├── finance/Finance.jsx      # Bills + portfolio + charts
        ├── comms/Communications.jsx # Email + AI drafts
        ├── health/HealthPage.jsx    # Vitals + appts + meds
        ├── lifeops/LifeOps.jsx      # Cab + food + wishlist
        ├── chat/ChatPage.jsx        # ⭐ Full AI agent chat
        ├── twin/TwinDiary.jsx       # Signed action ledger
        └── settings/Settings.jsx   # Trust + toggles + integrations
```

---

## 🔌 Production Integrations

| Domain              | Real Integration                          |
|---------------------|-------------------------------------------|
| Bills               | BBPS / NPCI Account Aggregator            |
| UPI Payments        | Razorpay UPI / NPCI direct               |
| Emails              | Gmail API / Microsoft Graph              |
| Portfolio           | Zerodha Kite / Groww / Smallcase API     |
| Health              | Google Fit / Apple HealthKit / ABHA      |
| Cabs                | Ola Cabs API / Uber Business API         |
| Food                | Swiggy Partner API / Zomato API          |
| Pharmacy            | PharmEasy / 1mg API                      |
| Credit Score        | CIBIL API / Perfios                      |

---

## 🐳 Docker Deployment

```bash
# Add to .env: DATABASE_URL, DEEPSEEK_API_KEY, JWT_SECRET
cd docker
docker-compose up --build
# App available at http://localhost:5173
```

---

## 🛡️ Security

- JWT tokens (7-day expiry, refresh flow)
- Biometric gate flag for all payments ≥ ₹1,000
- Cryptographically signed action ledger (SHA-256)
- Helmet.js security headers
- CORS restricted to frontend origin
- Rate limiting (200 req/15 min)
- DPDP Act compliant data handling

---

## 📧 Contact

**Swostitech Solutions** · Bengaluru, India  
Built for the Indian urban professional — 50M+ TAM
