FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
COPY scripts ./scripts
COPY .env.example ./.env.example
RUN mkdir -p logs
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
