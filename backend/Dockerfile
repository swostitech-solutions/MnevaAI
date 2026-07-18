FROM node:20-alpine
WORKDIR /app

# Tesseract OCR — system install (no traineddata file needed in repo)
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-eng

COPY package*.json ./
RUN npm ci --production
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
COPY scripts ./scripts
COPY .env.example ./.env.example
RUN mkdir -p logs storage/uploads
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
