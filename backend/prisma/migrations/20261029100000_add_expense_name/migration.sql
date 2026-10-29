-- A short name for the expense ("Groceries", "Cab to airport") so it can be
-- identified on its own, separate from its Category chip.
ALTER TABLE "Expense" ADD COLUMN "name" TEXT;
