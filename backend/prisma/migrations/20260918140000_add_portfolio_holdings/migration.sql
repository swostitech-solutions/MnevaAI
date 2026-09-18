-- Investment portfolio holdings (stocks, mutual funds, SIPs, ETFs, bonds,
-- gold, crypto...) — manually tracked like every other Finance module here,
-- replacing the always-empty /api/finance/portfolio stub.
CREATE TABLE "PortfolioHolding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "platform" TEXT,
    "quantity" DOUBLE PRECISION,
    "avgBuyPrice" DOUBLE PRECISION,
    "currentPrice" DOUBLE PRECISION,
    "investedAmount" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL,
    "purchaseDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioHolding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortfolioHolding_userId_idx" ON "PortfolioHolding"("userId");

ALTER TABLE "PortfolioHolding" ADD CONSTRAINT "PortfolioHolding_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
