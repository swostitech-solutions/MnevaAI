-- An EMI auto-derived from a Loan's own EMI fields gets loanId set; one the
-- user added directly (phone, credit card, product) with no loan behind it
-- keeps loanId null.
ALTER TABLE "Emi" ADD COLUMN "loanId" TEXT;

CREATE INDEX "Emi_loanId_idx" ON "Emi"("loanId");

ALTER TABLE "Emi" ADD CONSTRAINT "Emi_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
