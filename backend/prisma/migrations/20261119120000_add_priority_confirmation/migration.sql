-- CreateTable
CREATE TABLE "PriorityConfirmation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriorityConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriorityConfirmation_userId_idx" ON "PriorityConfirmation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PriorityConfirmation_userId_itemKey_key" ON "PriorityConfirmation"("userId", "itemKey");

-- AddForeignKey
ALTER TABLE "PriorityConfirmation" ADD CONSTRAINT "PriorityConfirmation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
