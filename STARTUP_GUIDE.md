# 🚀 Mneva AI v2 - Complete Startup Guide

## ✅ Fixed Issues (Real-Time Application)

### 1. **CORS Configuration Fixed** ✅
   - Socket.IO now properly configured to accept connections from `localhost:5174`
   - Dynamic CORS origin support for frontend URL changes

### 2. **Frontend-Backend Connection Fixed** ✅
   - Vite proxy configured for `/api` routes to backend (`:3001`)
   - WebSocket proxy enabled for Socket.IO real-time communication
   - Frontend now uses relative API paths with proper fallbacks

### 3. **Port Configuration Fixed** ✅
   - Backend: **Port 3001** (was 4001)
   - Frontend: **Port 5174** (correct)
   - All environment variables synchronized

### 4. **Real-Time Features Enabled** ✅
   - Socket.IO configured with WebSocket + Polling transports
   - Reconnection handling with exponential backoff
   - Agent query streaming via Socket.IO
   - Action approval/denial via real-time events
   - Ledger sync via WebSocket

### 5. **Environment Variables Fixed** ✅
   - Backend `.env` updated with correct ports
   - Frontend `.env` configured for API proxy
   - DeepSeek API key placeholder ready for actual key

---

## 📋 Prerequisites

- **Node.js** 18+ 
- **Docker & Docker Compose** (for PostgreSQL, Redis, Qdrant)
- **PostgreSQL** 16+
- **Redis** 7+
- **Qdrant** 1.13+

---

## 🔧 Setup Instructions

### Step 1: Start Infrastructure Services

```bash
# From the project root, start Docker containers
docker-compose -f docker/docker-compose.yml up -d

# Verify services are running
docker ps
```

**Expected output:**
- ✅ mneva-postgres (Port 5432)
- ✅ mneva-redis (Port 6379)
- ✅ mneva-qdrant (Port 6333)

---

### Step 2: Setup Backend

```bash
cd backend

# Install dependencies
npm install

# Run database migrations
npx prisma migrate deploy

# Start backend server
npm start
```

**Expected output:**
```
🚀 Mneva AI v2 running on :3001
📦 Redis: ✅ Ready
🧠 Qdrant: ✅ Ready
🤖 DeepSeek AI: ⚠️ Set DEEPSEEK_API_KEY
📡 Socket.IO ready
```

---

### Step 3: Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

**Expected output:**
```
  VITE v... dev server running at:
  ➜  Local:   http://localhost:5174/
  ➜  Network: ...
```

---

## 🔌 Real-Time Features Testing

### 1. Test Backend Health

```bash
curl http://localhost:3001/api/health

# Response should show:
{
  "status": "ok",
  "service": "Mneva AI v2",
  "version": "2.0.0",
  "ai": false,  // true when valid API key is added
  "timestamp": "2026-06-29T..."
}
```

### 2. Test Socket.IO Connection

Open browser console at `http://localhost:5174`:

```javascript
// Check if socket connected
console.log('Socket connected:', window.__SOCKET?.connected)

// Should see in console:
// "🔌 Socket connected"
```

### 3. Test Real-Time Agent Query

The app supports:
- ✅ **Socket-based agent chat** - Real-time streaming
- ✅ **Action approval/denial** - Instant UI updates
- ✅ **Ledger sync** - Real-time balance updates
- ✅ **Notifications** - Broadcast to user

---

## 🔑 Add DeepSeek API Key

1. **Get an API key:**
   - Go to https://platform.deepseek.com
   - Create an account and add credits
   - Generate an API key

2. **Update backend/.env:**
   ```bash
   DEEPSEEK_API_KEY=sk-your-actual-key-here
   ```

3. **Restart backend:**
   ```bash
   cd backend && npm start
   ```

4. **Verify:**
   ```bash
   curl http://localhost:3001/api/health
   
   # Should show: "ai": true ✅
   ```

---

## 📊 Real-Time Application Features

### Agent Communication (Socket.IO)
```javascript
socket.emit('agent:query', {
  messages: [{ role: 'user', content: 'What is my balance?' }],
  conversationId: 'conv-123'
})

socket.on('agent:thinking', (data) => {
  // Show thinking indicator
})

socket.on('agent:reply', (data) => {
  // Display AI response in real-time
})
```

### Action Approval Workflow
```javascript
socket.emit('action:approve', { actionId: 'action-456' })

socket.on('action:confirmed', (data) => {
  // Update UI with approved action
})
```

### Ledger Updates
```javascript
socket.emit('ledger:fetch')

socket.on('ledger:data', ({ entries }) => {
  // Real-time balance and transaction updates
})
```

---

## 🐛 Troubleshooting

### Socket.IO Connection Failed

**Problem:** `Unable to connect to backend`

**Solution:**
```bash
# Check backend is running on port 3001
lsof -i :3001

# Check CORS configuration in backend/.env
# Should have: FRONTEND_URL=http://localhost:5174

# Check vite.config.js proxy settings
cat frontend/vite.config.js
```

### Port Already in Use

```bash
# Kill process on port 3001
lsof -i :3001 | grep LISTEN | awk '{print $2}' | xargs kill -9

# Or use different port
PORT=3002 npm start
```

### Database Connection Error

```bash
# Verify PostgreSQL is running
docker ps | grep postgres

# Check DATABASE_URL in backend/.env
# Should be: postgresql://mneva_admin:Mneva%4012345@localhost:5432/mneva

# Test connection
psql postgresql://mneva_admin:Mneva%4012345@localhost:5432/mneva
```

### Qdrant Not Connected

```bash
# Verify Qdrant is running
docker ps | grep qdrant

# Check QDRANT_URL in backend/.env
# Should be: http://localhost:6333

# Test connection
curl http://localhost:6333/health
```

---

## 📈 Performance Monitoring

### Check Real-Time Status

**Backend:**
```bash
# View logs with real-time updates
tail -f backend/logs/mneva.log

# Check active socket connections
curl http://localhost:3001/api/health
```

**Frontend:**
```bash
# Open DevTools Console (F12)
# Look for Socket.IO connection logs
# Should see: "🔌 Socket connected"
```

### Memory & CPU Usage

```bash
# Monitor Docker containers
docker stats

# Monitor Node process
ps aux | grep node
```

---

## 🚢 Deployment Checklist

- [ ] DeepSeek API key configured with valid credentials
- [ ] Environment variables reviewed and updated
- [ ] PostgreSQL database backed up
- [ ] SSL certificates configured (if using HTTPS)
- [ ] CORS origins updated for production domain
- [ ] Rate limits reviewed and adjusted
- [ ] Logging level set appropriately
- [ ] Monitoring and alerting configured

---

## 📞 Quick Commands

```bash
# Start everything
docker-compose -f docker/docker-compose.yml up -d && \
cd backend && npm install && npx prisma migrate deploy && npm start &
cd frontend && npm install && npm run dev

# Stop everything
docker-compose -f docker/docker-compose.yml down

# View logs
docker-compose -f docker/docker-compose.yml logs -f

# Reset database
docker-compose -f docker/docker-compose.yml down -v
docker-compose -f docker/docker-compose.yml up -d
```

---

**Last Updated:** 2026-06-29  
**Status:** ✅ All Critical Issues Fixed - Real-Time Application Ready
