// One-time backfill: give every pre-existing Loan a linked Emi row. Loans
// created before the Loan<->EMI link existed never got one (only
// POST/PATCH /loans create/upsert it going forward), so without this they'd
// stay invisible in the EMI tracker until someone happens to edit the loan.
// Safe to re-run — loans that already have a linked Emi are skipped.
import 'dotenv/config'
import { prisma } from '../src/config/prisma.js'
import { emiDataFromLoan } from '../src/routes/finance.js'

try {
  const loans = await prisma.loan.findMany({ where: { emis: { none: {} } } })
  let created = 0
  for (const loan of loans) {
    await prisma.emi.create({ data: emiDataFromLoan(loan) })
    created++
  }
  console.log(`Checked ${loans.length} loan(s) with no linked EMI; created ${created} Emi row(s).`)
} catch (error) {
  console.error(`Loan->EMI backfill failed: ${error.message}`)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
