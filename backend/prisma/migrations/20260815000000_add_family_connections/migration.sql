CREATE TABLE IF NOT EXISTS "FamilyConnection" (
  "id"           TEXT NOT NULL,
  "requesterId"  TEXT NOT NULL,
  "receiverId"   TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FamilyConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FamilyConnection_requesterId_receiverId_key" ON "FamilyConnection"("requesterId", "receiverId");
CREATE INDEX IF NOT EXISTS "FamilyConnection_requesterId_idx" ON "FamilyConnection"("requesterId");
CREATE INDEX IF NOT EXISTS "FamilyConnection_receiverId_idx"  ON "FamilyConnection"("receiverId");

ALTER TABLE "FamilyConnection" ADD CONSTRAINT "FamilyConnection_requesterId_fkey"
  FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FamilyConnection" ADD CONSTRAINT "FamilyConnection_receiverId_fkey"
  FOREIGN KEY ("receiverId")  REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
