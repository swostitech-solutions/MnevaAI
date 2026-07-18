#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Mneva AI v2 - Complete Startup      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Check if Docker is running
echo -e "${YELLOW}[1/5]${NC} Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker not found. Please install Docker Desktop.${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Docker found${NC}\n"

# Start Docker services
echo -e "${YELLOW}[2/5]${NC} Starting Docker services (PostgreSQL, Redis, Qdrant)..."
docker-compose -f docker/docker-compose.yml up -d > /dev/null 2>&1

# Wait for services to be healthy
echo -e "${YELLOW}    Waiting for services to be ready...${NC}"
sleep 5

# Check each service
POSTGRES_READY=false
REDIS_READY=false
QDRANT_READY=false

for i in {1..30}; do
    # Check PostgreSQL
    if docker exec mneva-postgres pg_isready -U mneva_admin -d mneva &>/dev/null; then
        POSTGRES_READY=true
    fi
    
    # Check Redis
    if docker exec mneva-redis redis-cli ping &>/dev/null; then
        REDIS_READY=true
    fi
    
    # Check Qdrant
    if curl -s http://localhost:6333/health &>/dev/null; then
        QDRANT_READY=true
    fi
    
    if [ "$POSTGRES_READY" = true ] && [ "$REDIS_READY" = true ] && [ "$QDRANT_READY" = true ]; then
        break
    fi
    
    echo -e "    Waiting... (${i}/30)"
    sleep 1
done

if [ "$POSTGRES_READY" = true ]; then
    echo -e "${GREEN}  ✅ PostgreSQL ready${NC}"
else
    echo -e "${RED}  ❌ PostgreSQL failed${NC}"
fi

if [ "$REDIS_READY" = true ]; then
    echo -e "${GREEN}  ✅ Redis ready${NC}"
else
    echo -e "${RED}  ❌ Redis failed${NC}"
fi

if [ "$QDRANT_READY" = true ]; then
    echo -e "${GREEN}  ✅ Qdrant ready${NC}"
else
    echo -e "${RED}  ❌ Qdrant failed${NC}"
fi
echo ""

# Setup Backend
echo -e "${YELLOW}[3/5]${NC} Setting up Backend..."
cd backend

if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}    Installing dependencies...${NC}"
    npm install > /dev/null 2>&1
fi

# Run database migrations
echo -e "${YELLOW}    Running database migrations...${NC}"
npx prisma migrate deploy > /dev/null 2>&1

echo -e "${GREEN}✅ Backend ready${NC}\n"

# Setup Frontend
cd ../frontend

echo -e "${YELLOW}[4/5]${NC} Setting up Frontend..."
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}    Installing dependencies...${NC}"
    npm install > /dev/null 2>&1
fi

echo -e "${GREEN}✅ Frontend ready${NC}\n"

# Ready to start servers
cd ..

echo -e "${YELLOW}[5/5]${NC} Starting Application Servers..."
echo -e "${GREEN}✅ Setup complete!${NC}\n"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Starting Servers...              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Start backend in background
echo -e "${YELLOW}Starting Backend on :3001...${NC}"
cd backend
npm start > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}\n"

# Wait a bit for backend to be ready
sleep 3

# Start frontend in background
echo -e "${YELLOW}Starting Frontend on :5174...${NC}"
cd ../frontend
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}\n"

# Create summary
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║    🚀 Mneva AI v2 is Running!         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

echo -e "${GREEN}Services Running:${NC}"
echo -e "  📱 Frontend:    ${BLUE}http://localhost:5174${NC}"
echo -e "  🔌 Backend:     ${BLUE}http://localhost:3001${NC}"
echo -e "  🐘 PostgreSQL:  ${BLUE}localhost:5432${NC}"
echo -e "  🔴 Redis:       ${BLUE}localhost:6379${NC}"
echo -e "  🧠 Qdrant:      ${BLUE}http://localhost:6333${NC}\n"

echo -e "${YELLOW}To view logs:${NC}"
echo -e "  Backend:  ${BLUE}tail -f logs/backend.log${NC}"
echo -e "  Frontend: ${BLUE}tail -f logs/frontend.log${NC}\n"

echo -e "${YELLOW}To stop all services:${NC}"
echo -e "  1. Press Ctrl+C to stop servers${NC}"
echo -e "  2. Run: ${BLUE}docker-compose -f docker/docker-compose.yml down${NC}\n"

echo -e "${YELLOW}📖 For detailed guide, read: ${BLUE}STARTUP_GUIDE.md${NC}\n"

# Wait for Ctrl+C
wait $BACKEND_PID $FRONTEND_PID
