CREATE TABLE IF NOT EXISTS "Loan" (
  "id"                  TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "name"                TEXT NOT NULL,
  "loanType"            TEXT NOT NULL,
  "lenderName"          TEXT NOT NULL,
  "accountNumber"       TEXT,
  "purpose"             TEXT,
  "status"              TEXT NOT NULL DEFAULT 'Active',
  "originalAmount"      DOUBLE PRECISION NOT NULL,
  "outstandingAmount"   DOUBLE PRECISION NOT NULL,
  "amountPaid"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "processingFee"       DOUBLE PRECISION,
  "otherCharges"        DOUBLE PRECISION,
  "interestRate"        DOUBLE PRECISION NOT NULL,
  "interestType"        TEXT NOT NULL,
  "interestCalculation" TEXT NOT NULL,
  "emiAmount"           DOUBLE PRECISION NOT NULL,
  "emiFrequency"        TEXT NOT NULL DEFAULT 'Monthly',
  "emiStartDate"        TIMESTAMP(3) NOT NULL,
  "nextEmiDate"         TIMESTAMP(3),
  "emiEndDate"          TIMESTAMP(3),
  "numberOfEmis"        INTEGER NOT NULL,
  "emisPaid"            INTEGER NOT NULL DEFAULT 0,
  "emisRemaining"       INTEGER,
  "loanStartDate"       TIMESTAMP(3) NOT NULL,
  "loanMaturityDate"    TIMESTAMP(3),
  "autoDebit"           BOOLEAN NOT NULL DEFAULT false,
  "paymentAccount"      TEXT,
  "paymentDay"          INTEGER,
  "prepaymentAllowed"   BOOLEAN,
  "prepaymentCharges"   DOUBLE PRECISION,
  "notes"               TEXT,
  "attachmentDocId"     TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Loan_userId_idx" ON "Loan"("userId");

ALTER TABLE "Loan" ADD CONSTRAINT "Loan_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Emi" (
  "id"                    TEXT NOT NULL,
  "userId"                TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "emiType"               TEXT NOT NULL,
  "provider"              TEXT NOT NULL,
  "description"           TEXT,
  "totalAmount"           DOUBLE PRECISION NOT NULL,
  "downPayment"           DOUBLE PRECISION,
  "financedAmount"        DOUBLE PRECISION NOT NULL,
  "emiAmount"             DOUBLE PRECISION NOT NULL,
  "interestRate"          DOUBLE PRECISION,
  "processingFee"         DOUBLE PRECISION,
  "totalPayable"          DOUBLE PRECISION,
  "numberOfInstallments"  INTEGER NOT NULL,
  "installmentsPaid"      INTEGER NOT NULL DEFAULT 0,
  "installmentsRemaining" INTEGER,
  "startDate"             TIMESTAMP(3) NOT NULL,
  "nextPaymentDate"       TIMESTAMP(3),
  "endDate"               TIMESTAMP(3),
  "frequency"             TEXT NOT NULL DEFAULT 'Monthly',
  "paymentMethod"         TEXT,
  "autoDebit"             BOOLEAN NOT NULL DEFAULT false,
  "paymentAccount"        TEXT,
  "paymentDay"            INTEGER,
  "status"                TEXT NOT NULL DEFAULT 'Active',
  "productName"           TEXT,
  "orderReference"        TEXT,
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Emi_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Emi_userId_idx" ON "Emi"("userId");

ALTER TABLE "Emi" ADD CONSTRAINT "Emi_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Subscription" (
  "id"                    TEXT NOT NULL,
  "userId"                TEXT NOT NULL,
  "name"                  TEXT NOT NULL,
  "category"              TEXT NOT NULL,
  "provider"              TEXT,
  "description"           TEXT,
  "amount"                DOUBLE PRECISION NOT NULL,
  "currency"              TEXT NOT NULL DEFAULT 'INR',
  "billingCycle"          TEXT NOT NULL DEFAULT 'Monthly',
  "tax"                   DOUBLE PRECISION,
  "totalCharged"          DOUBLE PRECISION,
  "startDate"             TIMESTAMP(3) NOT NULL,
  "nextBillingDate"       TIMESTAMP(3),
  "renewalDate"           TIMESTAMP(3),
  "cancellationDate"      TIMESTAMP(3),
  "paymentMethod"         TEXT,
  "paymentAccount"        TEXT,
  "autoRenewal"           BOOLEAN NOT NULL DEFAULT true,
  "status"                TEXT NOT NULL DEFAULT 'Active',
  "trialPeriod"           BOOLEAN NOT NULL DEFAULT false,
  "trialEndDate"          TIMESTAMP(3),
  "reminderBeforeRenewal" INTEGER,
  "notes"                 TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Subscription_userId_idx" ON "Subscription"("userId");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "Bill" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "category"        TEXT NOT NULL,
  "provider"        TEXT,
  "accountNumber"   TEXT,
  "description"     TEXT,
  "expectedAmount"  DOUBLE PRECISION,
  "lastBillAmount"  DOUBLE PRECISION,
  "minAmount"       DOUBLE PRECISION,
  "maxAmount"       DOUBLE PRECISION,
  "currency"        TEXT NOT NULL DEFAULT 'INR',
  "billingCycle"    TEXT NOT NULL DEFAULT 'Monthly',
  "billDate"        TIMESTAMP(3),
  "dueDate"         TIMESTAMP(3) NOT NULL,
  "nextDueDate"     TIMESTAMP(3),
  "gracePeriod"     INTEGER,
  "paymentMethod"   TEXT,
  "paymentAccount"  TEXT,
  "autoPay"         BOOLEAN NOT NULL DEFAULT false,
  "autoPayDate"     TIMESTAMP(3),
  "status"          TEXT NOT NULL DEFAULT 'Upcoming',
  "lateFee"         DOUBLE PRECISION,
  "tax"             DOUBLE PRECISION,
  "reminderDays"    INTEGER,
  "notes"           TEXT,
  "attachmentDocId" TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Bill_userId_idx" ON "Bill"("userId");

ALTER TABLE "Bill" ADD CONSTRAINT "Bill_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
