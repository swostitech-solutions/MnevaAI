# 🚀 Quick Start Guide - Mneva AI v2

## ⚡ 30-Second Start

```bash
# Make startup script executable
chmod +x start.sh

# Run the script
./start.sh
```

Done! App will be running at:
- 📱 **Frontend:** http://localhost:5174
- 🔌 **Backend API:** http://localhost:3001
- 🤖 **Socket.IO (Real-time):** Automatic via Vite proxy

---

## 📝 What Was Fixed

✅ **Port Conflicts** - Backend now on 3001, Frontend on 5174
✅ **Socket.IO CORS** - Now uses FRONTEND_URL from environment
✅ **Vite Proxy** - API calls proxied to backend automatically
✅ **Real-Time Communication** - WebSocket with polling fallback
✅ **Environment Variables** - All synchronized across frontend/backend
✅ **Docker Compose** - Updated with correct configuration

---

## 🔐 Add Your AI API Key

The app works without an API key (fallback mode), but to enable AI:

```bash
# 1. Get DeepSeek API key from https://platform.deepseek.com
# 2. Update backend/.env
DEEPSEEK_API_KEY=sk-your-key-here

# 3. Restart backend
cd backend && npm start
```

Check status:
```bash
curl http://localhost:3001/api/health
# Should show: "ai": true
```

---

## 🔍 Verify Everything Works

### ✅ Backend Healthy
```bash
curl http://localhost:3001/api/health
```
Should return:
```json
{
  "status": "ok",
  "service": "Mneva AI v2",
  "version": "2.0.0",
  "timestamp": "..."
}
```

### ✅ Frontend Loads
Open http://localhost:5174 in browser
- Should not show CORS errors
- Login page should load

### ✅ Socket.IO Connected
Open browser console (F12):
- Should see: `🔌 Socket connected`
- No connection errors

### ✅ All Services Running
```bash
docker ps
```
Should show:
- mneva-postgres (5432)
- mneva-redis (6379)
- mneva-qdrant (6333)

---

## 🛠️ Manual Setup (If Script Fails)

### Terminal 1: Infrastructure
```bash
docker-compose -f docker/docker-compose.yml up -d
# Wait for all services to be healthy
sleep 10
```

### Terminal 2: Backend
```bash
cd backend
npm install
npx prisma migrate deploy
npm start
```

### Terminal 3: Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 📊 Real-Time Features

The app now supports:

1. **Agent Chat** - Real-time message streaming via Socket.IO
   - Ask questions and get instant responses
   - Uses WebSocket for low latency

2. **Action Approval** - Instant UI updates
   - Agent suggests actions
   - User can approve/deny in real-time
   - Instant ledger updates

3. **Notifications** - Real-time alerts
   - System broadcasts events to user
   - No need to refresh browser

4. **Ledger Sync** - Live balance updates
   - Track transactions as they happen
   - Real-time account status

---

## 📁 File Structure Reference

```
mneva-prod/
├── STARTUP_GUIDE.md          ← Detailed setup guide
├── FIXES_APPLIED.md          ← Technical details of all fixes
├── start.sh                  ← Automated startup script
├── backend/
│   ├── .env                  ← Backend config (PORT=3001)
│   ├── .env.example          ← Template file
│   ├── src/
│   │   ├── server.js         ← Fixed Socket.IO CORS
│   │   ├── services/socketService.js
│   │   └── routes/           ← Agent, dashboard, finance, etc.
│   └── package.json
├── frontend/
│   ├── .env                  ← Frontend config
│   ├── .env.example          ← Template file
│   ├── vite.config.js        ← Fixed: Added proxy config
│   ├── src/
│   │   ├── services/socket.js ← Fixed: Better Socket.IO setup
│   │   ├── services/api.js
│   │   └── components/       ← React components
│   └── package.json
├── docker/
│   └── docker-compose.yml    ← Updated environment vars
└── logs/                     ← Server logs directory
```

---

## 🆘 Common Issues & Fixes

### Issue: "CORS origin denied"
**Fix:** Check frontend/.env has:
```env
VITE_SOCKET_URL=http://localhost:3001
```

### Issue: "Cannot GET /api/..."
**Fix:** Ensure backend is running and Vite proxy is configured:
```bash
# Check vite.config.js has proxy section
grep -A5 "proxy:" frontend/vite.config.js
```

### Issue: "Socket.io connect error"
**Fix:** 
1. Restart backend and frontend
2. Clear browser cache (Ctrl+Shift+Delete)
3. Check DevTools → Network → WS for connection errors

### Issue: "Port 3001 already in use"
**Fix:**
```bash
# Kill the process
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Or use different port
PORT=3002 npm start
```

### Issue: "Cannot connect to database"
**Fix:**
```bash
# Ensure PostgreSQL is running
docker ps | grep postgres

# Run migrations
cd backend && npx prisma migrate deploy
```

---

## 📞 Commands Cheat Sheet

```bash
# Start everything
./start.sh

# Or manually:
docker-compose -f docker/docker-compose.yml up -d  # Infrastructure
cd backend && npm start                             # Backend
cd frontend && npm run dev                          # Frontend

# Stop everything
docker-compose -f docker/docker-compose.yml down

# View logs
docker-compose -f docker/docker-compose.yml logs -f
tail -f logs/backend.log

# Check health
curl http://localhost:3001/api/health
curl http://localhost:6333/health
redis-cli ping

# Database
npx prisma studio              # Inspect database
npx prisma migrate reset       # Reset database (dev only!)

# Clear cache
redis-cli FLUSHALL            # Clear Redis
docker-compose down -v        # Delete all volumes
```

---

## 🎯 Next Steps

1. ✅ **Start the app:** `./start.sh`
2. ✅ **Open frontend:** http://localhost:5174
3. ✅ **Log in** (or create account)
4. ✅ **Add DeepSeek API key** to enable AI
5. ✅ **Test agent chat** - Should work in real-time
6. ✅ **Check Socket.IO** - DevTools Network tab

---

## 📚 Documentation

For more details, see:
- [STARTUP_GUIDE.md](./STARTUP_GUIDE.md) - Complete setup guide
- [FIXES_APPLIED.md](./FIXES_APPLIED.md) - Technical details
- [backend/.env.example](./backend/.env.example) - Backend config reference
- [frontend/.env.example](./frontend/.env.example) - Frontend config reference

---

**Status:** ✅ Ready to Use
**Last Updated:** 2026-06-29
**Real-Time:** ✅ Enabled
