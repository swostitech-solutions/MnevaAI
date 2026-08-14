-- Add sourceId and priority to Notification if they don't exist yet
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Notification' AND column_name='sourceId') THEN
    ALTER TABLE "Notification" ADD COLUMN "sourceId" TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Notification' AND column_name='priority') THEN
    ALTER TABLE "Notification" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Create unique index if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_userId_sourceId_key" ON "Notification"("userId", "sourceId");

-- Create DeviceNotificationToken table if it doesn't exist
CREATE TABLE IF NOT EXISTS "DeviceNotificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "DeviceNotificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceNotificationToken_tokenHash_key" ON "DeviceNotificationToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "DeviceNotificationToken_userId_idx" ON "DeviceNotificationToken"("userId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name='DeviceNotificationToken_userId_fkey'
  ) THEN
    ALTER TABLE "DeviceNotificationToken" ADD CONSTRAINT "DeviceNotificationToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
