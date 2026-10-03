-- Everyday/ad-hoc spending (cash, card, UPI, etc.) — unlike Bills/EMIs/
-- Subscriptions these aren't recurring or tied to a provider, just an amount,
-- what it was for, and how it was paid.
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Expense_userId_idx" ON "Expense"("userId");

CREATE INDEX "Expense_date_idx" ON "Expense"("date");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
