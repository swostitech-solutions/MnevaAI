ALTER TABLE "Notification" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Notification_userId_sourceId_key" ON "Notification"("userId", "sourceId");

CREATE TABLE "DeviceNotificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "DeviceNotificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeviceNotificationToken_tokenHash_key" ON "DeviceNotificationToken"("tokenHash");
CREATE INDEX "DeviceNotificationToken_userId_idx" ON "DeviceNotificationToken"("userId");
ALTER TABLE "DeviceNotificationToken" ADD CONSTRAINT "DeviceNotificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
