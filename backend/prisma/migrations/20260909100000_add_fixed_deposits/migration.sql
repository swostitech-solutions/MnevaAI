CREATE TABLE IF NOT EXISTS "FixedDeposit" (
  "id"                         TEXT NOT NULL,
  "userId"                     TEXT NOT NULL,
  "name"                       TEXT NOT NULL,
  "bankName"                   TEXT NOT NULL,
  "accountNumber"              TEXT,
  "status"                     TEXT NOT NULL DEFAULT 'Active',
  "principalAmount"            DOUBLE PRECISION NOT NULL,
  "interestRate"                DOUBLE PRECISION NOT NULL,
  "compoundingFrequency"       TEXT NOT NULL DEFAULT 'Quarterly',
  "interestPayout"             TEXT NOT NULL DEFAULT 'On Maturity',
  "startDate"                  TIMESTAMP(3) NOT NULL,
  "maturityDate"               TIMESTAMP(3) NOT NULL,
  "tenureMonths"               INTEGER,
  "maturityAmount"             DOUBLE PRECISION,
  "interestEarned"             DOUBLE PRECISION,
  "autoRenewal"                BOOLEAN NOT NULL DEFAULT false,
  "nominee"                    TEXT,
  "paymentAccount"             TEXT,
  "prematureWithdrawalAllowed" BOOLEAN,
  "prematureWithdrawalPenalty" DOUBLE PRECISION,
  "notes"                      TEXT,
  "attachmentDocId"            TEXT,
  "createdAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FixedDeposit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FixedDeposit_userId_idx" ON "FixedDeposit"("userId");

ALTER TABLE "FixedDeposit" ADD CONSTRAINT "FixedDeposit_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
