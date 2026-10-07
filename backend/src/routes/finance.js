import express from 'express'
import { prisma } from '../config/prisma.js'
import { ledger } from '../services/ledgerService.js'

export const financeRouter = express.Router()

const emit = (io, userId, event, data) => { if (io) io.to(`u:${userId}`).emit(event, data) }

const toFloat = (v) => (v === undefined || v === null || v === '') ? undefined : Number(v)
const toInt = (v) => (v === undefined || v === null || v === '') ? undefined : parseInt(v, 10)
const toBool = (v) => (v === undefined || v === null || v === '') ? undefined : Boolean(v)
const toStr = (v) => (v === undefined || v === null) ? undefined : String(v).trim() || null
const toDate = (v) => (v === undefined || v === null || v === '') ? undefined : v

// Matches the fixed chip options in mneva/src/Screen/finance/LoanScreen.js
// exactly, and the enum create_loan's own tool schema already restricts the
// AI to in autonomyEngine.js — so this never conflicts with either caller,
// it just also enforces it server-side instead of trusting the client.
export const LOAN_TYPES = ['Personal Loan', 'Home Loan', 'Car Loan', 'Education Loan', 'Business Loan', 'Gold Loan', 'Other']
export const LOAN_STATUSES = ['Active', 'Closed', 'Pending']
export const LOAN_INTEREST_TYPES = ['Fixed', 'Floating']
export const LOAN_INTEREST_CALCULATIONS = ['Reducing Balance', 'Flat Rate']
export const LOAN_EMI_FREQUENCIES = ['Monthly', 'Bi-weekly', 'Quarterly']

// Lender/Bank Name is a real-world institution name (SBI, HDFC Bank, Punjab
// & Sind Bank, M/s. XYZ Finance Ltd.) — letters only, but with the
// punctuation those actually use. No digits, unlike a loan name/label.
const LENDER_NAME_RE = /^[A-Za-zÀ-￿\s.&'-]+$/
// Loan account numbers are alphanumeric in practice — banks prefix them
// with letters (confirmed against production data: "HL2024887732" is a
// real-looking HDFC home-loan account number) — so this can't be
// digits-only. Just blocks spaces/symbols and obviously-wrong lengths.
const ACCOUNT_NUMBER_RE = /^[A-Za-z0-9]{4,20}$/

// Validates a loan's full, merged field set — not just whatever one request
// happened to touch — so a PATCH that only changes one field still catches
// a cross-field problem like an EMI end date that's now before an
// unrelated, already-stored start date. Returns the first problem found, or
// null if everything checks out. Shared by POST/PATCH /loans below and the
// create_loan AI tool (autonomyEngine.js), which creates a Loan via Prisma
// directly and so needs its own call into this — same reason emiDataFromLoan
// above is exported.
export function validateLoanData(d) {
  if (!d.name || !String(d.name).trim()) return 'name is required'
  if (!LOAN_TYPES.includes(d.loanType)) return `loanType must be one of: ${LOAN_TYPES.join(', ')}`
  if (!d.lenderName || !String(d.lenderName).trim()) return 'lenderName is required'
  if (!LENDER_NAME_RE.test(d.lenderName.trim())) return 'lenderName must contain letters only (no digits)'
  if (d.accountNumber != null && String(d.accountNumber).trim() && !ACCOUNT_NUMBER_RE.test(String(d.accountNumber).trim())) {
    return 'accountNumber must be 4-20 letters/digits, with no spaces or symbols'
  }
  if (d.status != null && !LOAN_STATUSES.includes(d.status)) return `status must be one of: ${LOAN_STATUSES.join(', ')}`

  if (!(d.originalAmount > 0)) return 'originalAmount must be a positive number'
  if (!(d.outstandingAmount >= 0)) return 'outstandingAmount must be zero or a positive number'
  if (d.outstandingAmount > d.originalAmount) return 'outstandingAmount cannot be more than originalAmount'
  if (d.amountPaid != null && !(d.amountPaid >= 0)) return 'amountPaid must be zero or a positive number'
  if (d.processingFee != null && !(d.processingFee >= 0)) return 'processingFee must be zero or a positive number'
  if (d.otherCharges != null && !(d.otherCharges >= 0)) return 'otherCharges must be zero or a positive number'

  if (!(d.interestRate >= 0) || d.interestRate > 100) return 'interestRate must be between 0 and 100'
  if (!LOAN_INTEREST_TYPES.includes(d.interestType)) return `interestType must be one of: ${LOAN_INTEREST_TYPES.join(', ')}`
  if (!LOAN_INTEREST_CALCULATIONS.includes(d.interestCalculation)) return `interestCalculation must be one of: ${LOAN_INTEREST_CALCULATIONS.join(', ')}`

  if (!(d.emiAmount > 0)) return 'emiAmount must be a positive number'
  if (d.emiFrequency != null && !LOAN_EMI_FREQUENCIES.includes(d.emiFrequency)) return `emiFrequency must be one of: ${LOAN_EMI_FREQUENCIES.join(', ')}`

  const emiStart = d.emiStartDate ? new Date(d.emiStartDate) : null
  if (!emiStart || isNaN(emiStart.getTime())) return 'emiStartDate is required and must be a valid date'
  if (d.nextEmiDate != null) {
    const nextEmi = new Date(d.nextEmiDate)
    if (isNaN(nextEmi.getTime())) return 'nextEmiDate is not a valid date'
    if (nextEmi <= emiStart) return 'nextEmiDate must be after emiStartDate'
  }
  if (d.emiEndDate != null) {
    const emiEnd = new Date(d.emiEndDate)
    if (isNaN(emiEnd.getTime())) return 'emiEndDate is not a valid date'
    if (emiEnd <= emiStart) return 'emiEndDate must be after emiStartDate'
  }

  if (!Number.isInteger(d.numberOfEmis) || d.numberOfEmis <= 0) return 'numberOfEmis must be a positive whole number'
  if (d.emisPaid != null) {
    if (!Number.isInteger(d.emisPaid) || d.emisPaid < 0) return 'emisPaid must be zero or a positive whole number'
    if (d.emisPaid > d.numberOfEmis) return 'emisPaid cannot be more than numberOfEmis'
  }
  if (d.emisRemaining != null) {
    if (!Number.isInteger(d.emisRemaining) || d.emisRemaining < 0) return 'emisRemaining must be zero or a positive whole number'
    if (d.emisRemaining > d.numberOfEmis) return 'emisRemaining cannot be more than numberOfEmis'
  }

  const loanStart = d.loanStartDate ? new Date(d.loanStartDate) : null
  if (!loanStart || isNaN(loanStart.getTime())) return 'loanStartDate is required and must be a valid date'
  if (d.loanMaturityDate != null) {
    const maturity = new Date(d.loanMaturityDate)
    if (isNaN(maturity.getTime())) return 'loanMaturityDate is not a valid date'
    if (maturity <= loanStart) return 'loanMaturityDate must be after loanStartDate'
  }

  if (d.paymentDay != null && (!Number.isInteger(d.paymentDay) || d.paymentDay < 1 || d.paymentDay > 31)) return 'paymentDay must be between 1 and 31'
  if (d.prepaymentCharges != null && !(d.prepaymentCharges >= 0)) return 'prepaymentCharges must be zero or a positive number'

  return null
}

// A Loan already collects its own full EMI schedule (emiAmount, frequency,
// dates, installment counts) — this mirrors those fields into a real Emi
// row so the loan's EMI actually shows up in the EMI tracker too, instead
// of being invisible outside the Loan screen. The Emi.loanId link is what
// marks it as derived (see guards on PATCH/DELETE /emis/:id below).
export function emiDataFromLoan(loan) {
  return {
    userId: loan.userId,
    name: `${loan.name} EMI`,
    emiType: 'Loan EMI',
    provider: loan.lenderName,
    description: loan.purpose || null,
    totalAmount: loan.originalAmount,
    financedAmount: loan.originalAmount,
    emiAmount: loan.emiAmount,
    interestRate: loan.interestRate,
    processingFee: loan.processingFee,
    numberOfInstallments: loan.numberOfEmis,
    installmentsPaid: loan.emisPaid,
    installmentsRemaining: loan.emisRemaining,
    startDate: loan.emiStartDate,
    nextPaymentDate: loan.nextEmiDate,
    endDate: loan.emiEndDate,
    frequency: loan.emiFrequency,
    autoDebit: loan.autoDebit,
    paymentAccount: loan.paymentAccount,
    paymentDay: loan.paymentDay,
    status: loan.status === 'Closed' ? 'Completed' : loan.status,
    notes: loan.notes,
    loanId: loan.id,
  }
}

// ── Loans ────────────────────────────────────────────────────────────────────

financeRouter.get('/loans', async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ loans })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.post('/loans', async (req, res) => {
  try {
    const b = req.body
    if (!b.name?.trim() || !b.loanType || !b.lenderName?.trim() || b.originalAmount === undefined
      || b.outstandingAmount === undefined || b.interestRate === undefined || !b.interestType
      || !b.interestCalculation || b.emiAmount === undefined || b.numberOfEmis === undefined
      || !b.loanStartDate || !b.emiStartDate) {
      return res.status(400).json({ error: 'name, loanType, lenderName, originalAmount, outstandingAmount, interestRate, interestType, interestCalculation, emiAmount, numberOfEmis, loanStartDate and emiStartDate are required' })
    }
    const data = {
      userId: req.user.id,
      name: b.name.trim(),
      loanType: b.loanType,
      lenderName: b.lenderName.trim(),
      accountNumber: toStr(b.accountNumber),
      purpose: toStr(b.purpose),
      status: b.status || 'Active',
      originalAmount: toFloat(b.originalAmount),
      outstandingAmount: toFloat(b.outstandingAmount),
      amountPaid: toFloat(b.amountPaid) ?? 0,
      processingFee: toFloat(b.processingFee),
      otherCharges: toFloat(b.otherCharges),
      interestRate: toFloat(b.interestRate),
      interestType: b.interestType,
      interestCalculation: b.interestCalculation,
      emiAmount: toFloat(b.emiAmount),
      emiFrequency: b.emiFrequency || 'Monthly',
      emiStartDate: b.emiStartDate,
      nextEmiDate: toDate(b.nextEmiDate),
      emiEndDate: toDate(b.emiEndDate),
      numberOfEmis: toInt(b.numberOfEmis),
      emisPaid: toInt(b.emisPaid) ?? 0,
      emisRemaining: toInt(b.emisRemaining),
      loanStartDate: b.loanStartDate,
      loanMaturityDate: toDate(b.loanMaturityDate),
      autoDebit: toBool(b.autoDebit) ?? false,
      paymentAccount: toStr(b.paymentAccount),
      paymentDay: toInt(b.paymentDay),
      prepaymentAllowed: toBool(b.prepaymentAllowed),
      prepaymentCharges: toFloat(b.prepaymentCharges),
      notes: toStr(b.notes),
      attachmentDocId: toStr(b.attachmentDocId),
    }
    const validationError = validateLoanData(data)
    if (validationError) return res.status(400).json({ error: validationError })
    const loan = await prisma.loan.create({ data })
    emit(req.app.get('io'), req.user.id, 'loan:created', loan)
    const linkedEmi = await prisma.emi.create({ data: emiDataFromLoan(loan) })
    emit(req.app.get('io'), req.user.id, 'emi:created', linkedEmi)
    res.status(201).json({ loan })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.patch('/loans/:id', async (req, res) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    const b = req.body
    const patch = {
      ...(b.name !== undefined && { name: b.name.trim() }),
      ...(b.loanType !== undefined && { loanType: b.loanType }),
      ...(b.lenderName !== undefined && { lenderName: b.lenderName.trim() }),
      ...(b.accountNumber !== undefined && { accountNumber: toStr(b.accountNumber) }),
      ...(b.purpose !== undefined && { purpose: toStr(b.purpose) }),
      ...(b.status !== undefined && { status: b.status }),
      ...(b.originalAmount !== undefined && { originalAmount: toFloat(b.originalAmount) }),
      ...(b.outstandingAmount !== undefined && { outstandingAmount: toFloat(b.outstandingAmount) }),
      ...(b.amountPaid !== undefined && { amountPaid: toFloat(b.amountPaid) }),
      ...(b.processingFee !== undefined && { processingFee: toFloat(b.processingFee) }),
      ...(b.otherCharges !== undefined && { otherCharges: toFloat(b.otherCharges) }),
      ...(b.interestRate !== undefined && { interestRate: toFloat(b.interestRate) }),
      ...(b.interestType !== undefined && { interestType: b.interestType }),
      ...(b.interestCalculation !== undefined && { interestCalculation: b.interestCalculation }),
      ...(b.emiAmount !== undefined && { emiAmount: toFloat(b.emiAmount) }),
      ...(b.emiFrequency !== undefined && { emiFrequency: b.emiFrequency }),
      ...(b.emiStartDate !== undefined && { emiStartDate: b.emiStartDate }),
      ...(b.nextEmiDate !== undefined && { nextEmiDate: toDate(b.nextEmiDate) }),
      ...(b.emiEndDate !== undefined && { emiEndDate: toDate(b.emiEndDate) }),
      ...(b.numberOfEmis !== undefined && { numberOfEmis: toInt(b.numberOfEmis) }),
      ...(b.emisPaid !== undefined && { emisPaid: toInt(b.emisPaid) }),
      ...(b.emisRemaining !== undefined && { emisRemaining: toInt(b.emisRemaining) }),
      ...(b.loanStartDate !== undefined && { loanStartDate: b.loanStartDate }),
      ...(b.loanMaturityDate !== undefined && { loanMaturityDate: toDate(b.loanMaturityDate) }),
      ...(b.autoDebit !== undefined && { autoDebit: toBool(b.autoDebit) }),
      ...(b.paymentAccount !== undefined && { paymentAccount: toStr(b.paymentAccount) }),
      ...(b.paymentDay !== undefined && { paymentDay: toInt(b.paymentDay) }),
      ...(b.prepaymentAllowed !== undefined && { prepaymentAllowed: toBool(b.prepaymentAllowed) }),
      ...(b.prepaymentCharges !== undefined && { prepaymentCharges: toFloat(b.prepaymentCharges) }),
      ...(b.notes !== undefined && { notes: toStr(b.notes) }),
      ...(b.attachmentDocId !== undefined && { attachmentDocId: toStr(b.attachmentDocId) }),
    }
    // Validated against the merged result, not just this request's fields —
    // a PATCH that only touches e.g. notes must still fail if it would
    // leave some other already-stored field (an enum, a date order) broken.
    const validationError = validateLoanData({ ...existing, ...patch })
    if (validationError) return res.status(400).json({ error: validationError })
    const loan = await prisma.loan.update({ where: { id: req.params.id }, data: patch })
    emit(req.app.get('io'), req.user.id, 'loan:updated', loan)

    // Keep the linked EMI in sync with the loan's own EMI fields — upsert
    // rather than assume it exists, since a loan created before this
    // feature shipped won't have one yet (its first edit backfills it).
    const existingEmi = await prisma.emi.findFirst({ where: { loanId: loan.id } })
    const linkedEmi = existingEmi
      ? await prisma.emi.update({ where: { id: existingEmi.id }, data: emiDataFromLoan(loan) })
      : await prisma.emi.create({ data: emiDataFromLoan(loan) })
    emit(req.app.get('io'), req.user.id, existingEmi ? 'emi:updated' : 'emi:created', linkedEmi)

    res.json({ loan })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.delete('/loans/:id', async (req, res) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    // Fetch the linked EMI's id before deleting — the DB foreign key cascade
    // (onDelete: Cascade) removes it automatically, but the open EMI screen
    // still needs its own socket event to drop the row live.
    const linkedEmi = await prisma.emi.findFirst({ where: { loanId: req.params.id }, select: { id: true } })
    await prisma.loan.delete({ where: { id: req.params.id } })
    emit(req.app.get('io'), req.user.id, 'loan:deleted', { id: req.params.id })
    if (linkedEmi) emit(req.app.get('io'), req.user.id, 'emi:deleted', { id: linkedEmi.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── EMIs ─────────────────────────────────────────────────────────────────────

financeRouter.get('/emis', async (req, res) => {
  try {
    const emis = await prisma.emi.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ emis })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.post('/emis', async (req, res) => {
  try {
    const b = req.body
    if (!b.name?.trim() || !b.emiType || !b.provider?.trim() || b.totalAmount === undefined
      || b.financedAmount === undefined || b.emiAmount === undefined || b.numberOfInstallments === undefined
      || !b.startDate) {
      return res.status(400).json({ error: 'name, emiType, provider, totalAmount, financedAmount, emiAmount, numberOfInstallments and startDate are required' })
    }
    const emi = await prisma.emi.create({
      data: {
        userId: req.user.id,
        name: b.name.trim(),
        emiType: b.emiType,
        provider: b.provider.trim(),
        description: toStr(b.description),
        totalAmount: toFloat(b.totalAmount),
        downPayment: toFloat(b.downPayment),
        financedAmount: toFloat(b.financedAmount),
        emiAmount: toFloat(b.emiAmount),
        interestRate: toFloat(b.interestRate),
        processingFee: toFloat(b.processingFee),
        totalPayable: toFloat(b.totalPayable),
        numberOfInstallments: toInt(b.numberOfInstallments),
        installmentsPaid: toInt(b.installmentsPaid) ?? 0,
        installmentsRemaining: toInt(b.installmentsRemaining),
        startDate: b.startDate,
        nextPaymentDate: toDate(b.nextPaymentDate),
        endDate: toDate(b.endDate),
        frequency: b.frequency || 'Monthly',
        paymentMethod: toStr(b.paymentMethod),
        autoDebit: toBool(b.autoDebit) ?? false,
        paymentAccount: toStr(b.paymentAccount),
        paymentDay: toInt(b.paymentDay),
        status: b.status || 'Active',
        productName: toStr(b.productName),
        orderReference: toStr(b.orderReference),
        notes: toStr(b.notes),
      },
    })
    emit(req.app.get('io'), req.user.id, 'emi:created', emi)
    res.status(201).json({ emi })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.patch('/emis/:id', async (req, res) => {
  try {
    const existing = await prisma.emi.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    // A loan-derived EMI (see emiDataFromLoan) would just drift out of sync
    // with its loan if edited directly here — the loan is the source of
    // truth for it, so changes go through PATCH /loans/:id instead.
    if (existing.loanId) return res.status(400).json({ error: 'This EMI is linked to a loan — edit the loan instead.' })
    const b = req.body
    const emi = await prisma.emi.update({
      where: { id: req.params.id },
      data: {
        ...(b.name !== undefined && { name: b.name.trim() }),
        ...(b.emiType !== undefined && { emiType: b.emiType }),
        ...(b.provider !== undefined && { provider: b.provider.trim() }),
        ...(b.description !== undefined && { description: toStr(b.description) }),
        ...(b.totalAmount !== undefined && { totalAmount: toFloat(b.totalAmount) }),
        ...(b.downPayment !== undefined && { downPayment: toFloat(b.downPayment) }),
        ...(b.financedAmount !== undefined && { financedAmount: toFloat(b.financedAmount) }),
        ...(b.emiAmount !== undefined && { emiAmount: toFloat(b.emiAmount) }),
        ...(b.interestRate !== undefined && { interestRate: toFloat(b.interestRate) }),
        ...(b.processingFee !== undefined && { processingFee: toFloat(b.processingFee) }),
        ...(b.totalPayable !== undefined && { totalPayable: toFloat(b.totalPayable) }),
        ...(b.numberOfInstallments !== undefined && { numberOfInstallments: toInt(b.numberOfInstallments) }),
        ...(b.installmentsPaid !== undefined && { installmentsPaid: toInt(b.installmentsPaid) }),
        ...(b.installmentsRemaining !== undefined && { installmentsRemaining: toInt(b.installmentsRemaining) }),
        ...(b.startDate !== undefined && { startDate: b.startDate }),
        ...(b.nextPaymentDate !== undefined && { nextPaymentDate: toDate(b.nextPaymentDate) }),
        ...(b.endDate !== undefined && { endDate: toDate(b.endDate) }),
        ...(b.frequency !== undefined && { frequency: b.frequency }),
        ...(b.paymentMethod !== undefined && { paymentMethod: toStr(b.paymentMethod) }),
        ...(b.autoDebit !== undefined && { autoDebit: toBool(b.autoDebit) }),
        ...(b.paymentAccount !== undefined && { paymentAccount: toStr(b.paymentAccount) }),
        ...(b.paymentDay !== undefined && { paymentDay: toInt(b.paymentDay) }),
        ...(b.status !== undefined && { status: b.status }),
        ...(b.productName !== undefined && { productName: toStr(b.productName) }),
        ...(b.orderReference !== undefined && { orderReference: toStr(b.orderReference) }),
        ...(b.notes !== undefined && { notes: toStr(b.notes) }),
      },
    })
    emit(req.app.get('io'), req.user.id, 'emi:updated', emi)
    res.json({ emi })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.delete('/emis/:id', async (req, res) => {
  try {
    const existing = await prisma.emi.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    if (existing.loanId) return res.status(400).json({ error: 'This EMI is linked to a loan — delete the loan instead.' })
    await prisma.emi.delete({ where: { id: req.params.id } })
    emit(req.app.get('io'), req.user.id, 'emi:deleted', { id: req.params.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Subscriptions ────────────────────────────────────────────────────────────

financeRouter.get('/subscriptions', async (req, res) => {
  try {
    const subscriptions = await prisma.subscription.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ subscriptions })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.post('/subscriptions', async (req, res) => {
  try {
    const b = req.body
    if (!b.name?.trim() || !b.category || b.amount === undefined || !b.billingCycle || !b.startDate) {
      return res.status(400).json({ error: 'name, category, amount, billingCycle and startDate are required' })
    }
    const subscription = await prisma.subscription.create({
      data: {
        userId: req.user.id,
        name: b.name.trim(),
        category: b.category,
        provider: toStr(b.provider),
        description: toStr(b.description),
        amount: toFloat(b.amount),
        currency: b.currency || 'INR',
        billingCycle: b.billingCycle,
        tax: toFloat(b.tax),
        totalCharged: toFloat(b.totalCharged),
        startDate: b.startDate,
        nextBillingDate: toDate(b.nextBillingDate),
        renewalDate: toDate(b.renewalDate),
        cancellationDate: toDate(b.cancellationDate),
        paymentMethod: toStr(b.paymentMethod),
        paymentAccount: toStr(b.paymentAccount),
        autoRenewal: toBool(b.autoRenewal) ?? true,
        status: b.status || 'Active',
        trialPeriod: toBool(b.trialPeriod) ?? false,
        trialEndDate: toDate(b.trialEndDate),
        reminderBeforeRenewal: toInt(b.reminderBeforeRenewal),
        notes: toStr(b.notes),
      },
    })
    emit(req.app.get('io'), req.user.id, 'subscription:created', subscription)
    res.status(201).json({ subscription })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.patch('/subscriptions/:id', async (req, res) => {
  try {
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    const b = req.body
    const subscription = await prisma.subscription.update({
      where: { id: req.params.id },
      data: {
        ...(b.name !== undefined && { name: b.name.trim() }),
        ...(b.category !== undefined && { category: b.category }),
        ...(b.provider !== undefined && { provider: toStr(b.provider) }),
        ...(b.description !== undefined && { description: toStr(b.description) }),
        ...(b.amount !== undefined && { amount: toFloat(b.amount) }),
        ...(b.currency !== undefined && { currency: b.currency }),
        ...(b.billingCycle !== undefined && { billingCycle: b.billingCycle }),
        ...(b.tax !== undefined && { tax: toFloat(b.tax) }),
        ...(b.totalCharged !== undefined && { totalCharged: toFloat(b.totalCharged) }),
        ...(b.startDate !== undefined && { startDate: b.startDate }),
        ...(b.nextBillingDate !== undefined && { nextBillingDate: toDate(b.nextBillingDate) }),
        ...(b.renewalDate !== undefined && { renewalDate: toDate(b.renewalDate) }),
        ...(b.cancellationDate !== undefined && { cancellationDate: toDate(b.cancellationDate) }),
        ...(b.paymentMethod !== undefined && { paymentMethod: toStr(b.paymentMethod) }),
        ...(b.paymentAccount !== undefined && { paymentAccount: toStr(b.paymentAccount) }),
        ...(b.autoRenewal !== undefined && { autoRenewal: toBool(b.autoRenewal) }),
        ...(b.status !== undefined && { status: b.status }),
        ...(b.trialPeriod !== undefined && { trialPeriod: toBool(b.trialPeriod) }),
        ...(b.trialEndDate !== undefined && { trialEndDate: toDate(b.trialEndDate) }),
        ...(b.reminderBeforeRenewal !== undefined && { reminderBeforeRenewal: toInt(b.reminderBeforeRenewal) }),
        ...(b.notes !== undefined && { notes: toStr(b.notes) }),
      },
    })
    emit(req.app.get('io'), req.user.id, 'subscription:updated', subscription)
    res.json({ subscription })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.delete('/subscriptions/:id', async (req, res) => {
  try {
    const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    await prisma.subscription.delete({ where: { id: req.params.id } })
    emit(req.app.get('io'), req.user.id, 'subscription:deleted', { id: req.params.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Bills ────────────────────────────────────────────────────────────────────

financeRouter.get('/bills', async (req, res) => {
  try {
    const bills = await prisma.bill.findMany({
      where: { userId: req.user.id },
      orderBy: { dueDate: 'asc' },
    })
    res.json(bills)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.post('/bills', async (req, res) => {
  try {
    const b = req.body
    if (!b.name?.trim() || !b.category || !b.dueDate) {
      return res.status(400).json({ error: 'name, category and dueDate are required' })
    }
    const bill = await prisma.bill.create({
      data: {
        userId: req.user.id,
        name: b.name.trim(),
        category: b.category,
        provider: toStr(b.provider),
        accountNumber: toStr(b.accountNumber),
        description: toStr(b.description),
        expectedAmount: toFloat(b.expectedAmount),
        lastBillAmount: toFloat(b.lastBillAmount),
        minAmount: toFloat(b.minAmount),
        maxAmount: toFloat(b.maxAmount),
        currency: b.currency || 'INR',
        billingCycle: b.billingCycle || 'Monthly',
        billDate: toDate(b.billDate),
        dueDate: b.dueDate,
        nextDueDate: toDate(b.nextDueDate),
        gracePeriod: toInt(b.gracePeriod),
        paymentMethod: toStr(b.paymentMethod),
        paymentAccount: toStr(b.paymentAccount),
        autoPay: toBool(b.autoPay) ?? false,
        autoPayDate: toDate(b.autoPayDate),
        status: b.status || 'Upcoming',
        lateFee: toFloat(b.lateFee),
        tax: toFloat(b.tax),
        reminderDays: toInt(b.reminderDays),
        notes: toStr(b.notes),
        attachmentDocId: toStr(b.attachmentDocId),
      },
    })
    emit(req.app.get('io'), req.user.id, 'bill:created', bill)
    res.status(201).json({ bill })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.patch('/bills/:id', async (req, res) => {
  try {
    const existing = await prisma.bill.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    const b = req.body
    const bill = await prisma.bill.update({
      where: { id: req.params.id },
      data: {
        ...(b.name !== undefined && { name: b.name.trim() }),
        ...(b.category !== undefined && { category: b.category }),
        ...(b.provider !== undefined && { provider: toStr(b.provider) }),
        ...(b.accountNumber !== undefined && { accountNumber: toStr(b.accountNumber) }),
        ...(b.description !== undefined && { description: toStr(b.description) }),
        ...(b.expectedAmount !== undefined && { expectedAmount: toFloat(b.expectedAmount) }),
        ...(b.lastBillAmount !== undefined && { lastBillAmount: toFloat(b.lastBillAmount) }),
        ...(b.minAmount !== undefined && { minAmount: toFloat(b.minAmount) }),
        ...(b.maxAmount !== undefined && { maxAmount: toFloat(b.maxAmount) }),
        ...(b.currency !== undefined && { currency: b.currency }),
        ...(b.billingCycle !== undefined && { billingCycle: b.billingCycle }),
        ...(b.billDate !== undefined && { billDate: toDate(b.billDate) }),
        ...(b.dueDate !== undefined && { dueDate: b.dueDate }),
        ...(b.nextDueDate !== undefined && { nextDueDate: toDate(b.nextDueDate) }),
        ...(b.gracePeriod !== undefined && { gracePeriod: toInt(b.gracePeriod) }),
        ...(b.paymentMethod !== undefined && { paymentMethod: toStr(b.paymentMethod) }),
        ...(b.paymentAccount !== undefined && { paymentAccount: toStr(b.paymentAccount) }),
        ...(b.autoPay !== undefined && { autoPay: toBool(b.autoPay) }),
        ...(b.autoPayDate !== undefined && { autoPayDate: toDate(b.autoPayDate) }),
        ...(b.status !== undefined && { status: b.status }),
        ...(b.lateFee !== undefined && { lateFee: toFloat(b.lateFee) }),
        ...(b.tax !== undefined && { tax: toFloat(b.tax) }),
        ...(b.reminderDays !== undefined && { reminderDays: toInt(b.reminderDays) }),
        ...(b.notes !== undefined && { notes: toStr(b.notes) }),
        ...(b.attachmentDocId !== undefined && { attachmentDocId: toStr(b.attachmentDocId) }),
      },
    })
    emit(req.app.get('io'), req.user.id, 'bill:updated', bill)
    res.json({ bill })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.delete('/bills/:id', async (req, res) => {
  try {
    const existing = await prisma.bill.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    await prisma.bill.delete({ where: { id: req.params.id } })
    emit(req.app.get('io'), req.user.id, 'bill:deleted', { id: req.params.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Expenses (everyday spending — cash/card/UPI/online) ────────────────────────

financeRouter.get('/expenses', async (req, res) => {
  try {
    const expenses = await prisma.expense.findMany({
      where: { userId: req.user.id },
      orderBy: { date: 'desc' },
    })
    res.json({ expenses })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.post('/expenses', async (req, res) => {
  try {
    const b = req.body
    const amount = toFloat(b.amount)
    if (amount === undefined || !(amount > 0) || !b.paymentMethod) {
      return res.status(400).json({ error: 'amount and paymentMethod are required' })
    }
    const expense = await prisma.expense.create({
      data: {
        userId: req.user.id,
        amount,
        category: toStr(b.category),
        paymentMethod: b.paymentMethod,
        note: toStr(b.note),
        date: b.date ? new Date(b.date) : new Date(),
      },
    })
    emit(req.app.get('io'), req.user.id, 'expense:created', expense)
    res.status(201).json({ expense })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.patch('/expenses/:id', async (req, res) => {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    const b = req.body
    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        ...(b.amount !== undefined && { amount: toFloat(b.amount) }),
        ...(b.category !== undefined && { category: toStr(b.category) }),
        ...(b.paymentMethod !== undefined && { paymentMethod: b.paymentMethod }),
        ...(b.note !== undefined && { note: toStr(b.note) }),
        ...(b.date !== undefined && { date: new Date(b.date) }),
      },
    })
    emit(req.app.get('io'), req.user.id, 'expense:updated', expense)
    res.json({ expense })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.delete('/expenses/:id', async (req, res) => {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    await prisma.expense.delete({ where: { id: req.params.id } })
    emit(req.app.get('io'), req.user.id, 'expense:deleted', { id: req.params.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Fixed Deposits ───────────────────────────────────────────────────────────

financeRouter.get('/fixed-deposits', async (req, res) => {
  try {
    const fixedDeposits = await prisma.fixedDeposit.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ fixedDeposits })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.post('/fixed-deposits', async (req, res) => {
  try {
    const b = req.body
    if (!b.name?.trim() || !b.bankName?.trim() || b.principalAmount === undefined
      || b.interestRate === undefined || !b.startDate || !b.maturityDate) {
      return res.status(400).json({ error: 'name, bankName, principalAmount, interestRate, startDate and maturityDate are required' })
    }
    const fixedDeposit = await prisma.fixedDeposit.create({
      data: {
        userId: req.user.id,
        name: b.name.trim(),
        bankName: b.bankName.trim(),
        accountNumber: toStr(b.accountNumber),
        status: b.status || 'Active',
        principalAmount: toFloat(b.principalAmount),
        interestRate: toFloat(b.interestRate),
        compoundingFrequency: b.compoundingFrequency || 'Quarterly',
        interestPayout: b.interestPayout || 'On Maturity',
        startDate: b.startDate,
        maturityDate: b.maturityDate,
        tenureMonths: toInt(b.tenureMonths),
        maturityAmount: toFloat(b.maturityAmount),
        interestEarned: toFloat(b.interestEarned),
        autoRenewal: toBool(b.autoRenewal) ?? false,
        nominee: toStr(b.nominee),
        paymentAccount: toStr(b.paymentAccount),
        prematureWithdrawalAllowed: toBool(b.prematureWithdrawalAllowed),
        prematureWithdrawalPenalty: toFloat(b.prematureWithdrawalPenalty),
        notes: toStr(b.notes),
        attachmentDocId: toStr(b.attachmentDocId),
      },
    })
    emit(req.app.get('io'), req.user.id, 'fd:created', fixedDeposit)
    res.status(201).json({ fixedDeposit })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.patch('/fixed-deposits/:id', async (req, res) => {
  try {
    const existing = await prisma.fixedDeposit.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    const b = req.body
    const fixedDeposit = await prisma.fixedDeposit.update({
      where: { id: req.params.id },
      data: {
        ...(b.name !== undefined && { name: b.name.trim() }),
        ...(b.bankName !== undefined && { bankName: b.bankName.trim() }),
        ...(b.accountNumber !== undefined && { accountNumber: toStr(b.accountNumber) }),
        ...(b.status !== undefined && { status: b.status }),
        ...(b.principalAmount !== undefined && { principalAmount: toFloat(b.principalAmount) }),
        ...(b.interestRate !== undefined && { interestRate: toFloat(b.interestRate) }),
        ...(b.compoundingFrequency !== undefined && { compoundingFrequency: b.compoundingFrequency }),
        ...(b.interestPayout !== undefined && { interestPayout: b.interestPayout }),
        ...(b.startDate !== undefined && { startDate: b.startDate }),
        ...(b.maturityDate !== undefined && { maturityDate: b.maturityDate }),
        ...(b.tenureMonths !== undefined && { tenureMonths: toInt(b.tenureMonths) }),
        ...(b.maturityAmount !== undefined && { maturityAmount: toFloat(b.maturityAmount) }),
        ...(b.interestEarned !== undefined && { interestEarned: toFloat(b.interestEarned) }),
        ...(b.autoRenewal !== undefined && { autoRenewal: toBool(b.autoRenewal) }),
        ...(b.nominee !== undefined && { nominee: toStr(b.nominee) }),
        ...(b.paymentAccount !== undefined && { paymentAccount: toStr(b.paymentAccount) }),
        ...(b.prematureWithdrawalAllowed !== undefined && { prematureWithdrawalAllowed: toBool(b.prematureWithdrawalAllowed) }),
        ...(b.prematureWithdrawalPenalty !== undefined && { prematureWithdrawalPenalty: toFloat(b.prematureWithdrawalPenalty) }),
        ...(b.notes !== undefined && { notes: toStr(b.notes) }),
        ...(b.attachmentDocId !== undefined && { attachmentDocId: toStr(b.attachmentDocId) }),
      },
    })
    emit(req.app.get('io'), req.user.id, 'fd:updated', fixedDeposit)
    res.json({ fixedDeposit })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.delete('/fixed-deposits/:id', async (req, res) => {
  try {
    const existing = await prisma.fixedDeposit.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    await prisma.fixedDeposit.delete({ where: { id: req.params.id } })
    emit(req.app.get('io'), req.user.id, 'fd:deleted', { id: req.params.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Portfolio Holdings ───────────────────────────────────────────────────────

financeRouter.get('/portfolio/holdings', async (req, res) => {
  try {
    const holdings = await prisma.portfolioHolding.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ holdings })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.post('/portfolio/holdings', async (req, res) => {
  try {
    const b = req.body
    if (!b.name?.trim() || !b.type || b.investedAmount === undefined || b.currentValue === undefined) {
      return res.status(400).json({ error: 'name, type, investedAmount and currentValue are required' })
    }
    const holding = await prisma.portfolioHolding.create({
      data: {
        userId: req.user.id,
        name: b.name.trim(),
        type: b.type,
        platform: toStr(b.platform),
        quantity: toFloat(b.quantity),
        avgBuyPrice: toFloat(b.avgBuyPrice),
        currentPrice: toFloat(b.currentPrice),
        investedAmount: toFloat(b.investedAmount),
        currentValue: toFloat(b.currentValue),
        purchaseDate: toDate(b.purchaseDate),
        notes: toStr(b.notes),
      },
    })
    emit(req.app.get('io'), req.user.id, 'portfolio:created', holding)
    res.status(201).json({ holding })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.patch('/portfolio/holdings/:id', async (req, res) => {
  try {
    const existing = await prisma.portfolioHolding.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    const b = req.body
    const holding = await prisma.portfolioHolding.update({
      where: { id: req.params.id },
      data: {
        ...(b.name !== undefined && { name: b.name.trim() }),
        ...(b.type !== undefined && { type: b.type }),
        ...(b.platform !== undefined && { platform: toStr(b.platform) }),
        ...(b.quantity !== undefined && { quantity: toFloat(b.quantity) }),
        ...(b.avgBuyPrice !== undefined && { avgBuyPrice: toFloat(b.avgBuyPrice) }),
        ...(b.currentPrice !== undefined && { currentPrice: toFloat(b.currentPrice) }),
        ...(b.investedAmount !== undefined && { investedAmount: toFloat(b.investedAmount) }),
        ...(b.currentValue !== undefined && { currentValue: toFloat(b.currentValue) }),
        ...(b.purchaseDate !== undefined && { purchaseDate: toDate(b.purchaseDate) }),
        ...(b.notes !== undefined && { notes: toStr(b.notes) }),
      },
    })
    emit(req.app.get('io'), req.user.id, 'portfolio:updated', holding)
    res.json({ holding })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.delete('/portfolio/holdings/:id', async (req, res) => {
  try {
    const existing = await prisma.portfolioHolding.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    await prisma.portfolioHolding.delete({ where: { id: req.params.id } })
    emit(req.app.get('io'), req.user.id, 'portfolio:deleted', { id: req.params.id })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/finance/portfolio — aggregate summary, computed from real holdings
// (previously a hardcoded stub returning all zeros/empty — "not backed by
// real accounts", since there is no live brokerage integration; holdings are
// tracked manually instead, the same way every other Finance module here is).
financeRouter.get('/portfolio', async (req, res) => {
  try {
    const holdings = await prisma.portfolioHolding.findMany({
      where: { userId: req.user.id },
      orderBy: { currentValue: 'desc' },
    })
    const totalInvested = holdings.reduce((sum, h) => sum + (h.investedAmount || 0), 0)
    const totalCurrent = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0)
    const returnPct = totalInvested > 0 ? Math.round(((totalCurrent - totalInvested) / totalInvested) * 1000) / 10 : 0
    res.json({
      totalInvested,
      totalCurrent,
      returnPct,
      netWorth: totalCurrent,
      holdings: holdings.map(h => ({ id: h.id, name: h.name, type: h.type, value: h.currentValue })),
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
// Real spend: everyday Expense entries logged this month, plus Bills
// actually marked Paid this month and this month's due EMI/Subscription
// installments. Expense used to not exist as a table, so this was inferred
// entirely from Bills/EMIs/Subscriptions — real ad-hoc spending (cash, UPI,
// card) never showed up here at all.
financeRouter.get('/spending', async (req, res) => {
  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const dueThisMonth = (date) => {
      if (!date) return false
      const d = new Date(date)
      return d >= monthStart && d < monthEnd
    }

    const [paidBills, emis, subs, expenses] = await Promise.all([
      prisma.bill.findMany({ where: { userId: req.user.id, status: 'Paid', updatedAt: { gte: monthStart, lt: monthEnd } } }),
      prisma.emi.findMany({ where: { userId: req.user.id, status: 'Active' } }),
      prisma.subscription.findMany({ where: { userId: req.user.id, status: 'Active' } }),
      prisma.expense.findMany({ where: { userId: req.user.id, date: { gte: monthStart, lt: monthEnd } } }),
    ])

    const categoryTotals = {}
    const addCategory = (name, amount) => { if (amount) categoryTotals[name] = (categoryTotals[name] || 0) + amount }

    for (const exp of expenses) addCategory(exp.category || 'Other', exp.amount)
    for (const bill of paidBills) addCategory(bill.category || 'Bills', bill.lastBillAmount ?? bill.expectedAmount ?? 0)

    let emiTotal = 0
    for (const emi of emis) {
      const due = emi.frequency === 'Monthly' ? (!emi.nextPaymentDate || dueThisMonth(emi.nextPaymentDate)) : dueThisMonth(emi.nextPaymentDate)
      if (due) emiTotal += emi.emiAmount || 0
    }
    addCategory('EMIs', emiTotal)

    let subTotal = 0
    for (const sub of subs) {
      const due = sub.billingCycle === 'Monthly' ? (!sub.nextBillingDate || dueThisMonth(sub.nextBillingDate)) : dueThisMonth(sub.nextBillingDate)
      if (due) subTotal += sub.amount || 0
    }
    addCategory('Subscriptions', subTotal)

    const categories = Object.entries(categoryTotals)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
    const total = categories.reduce((sum, c) => sum + c.amount, 0)

    res.json({
      period: req.query.period || 'month',
      total,
      budget: 0,
      savingsRate: 0,
      categories,
      insights: [],
    })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.post('/pay', async (req, res) => {
  try {
    const amount = Number(req.body.amount) || 0
    if (amount >= 1000) {
      const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { preferences: true } })
      const gateOn = user?.preferences?.privacy?.biometricGate !== false
      if (gateOn && req.body.biometricConfirmed !== true) {
        return res.status(403).json({ error: 'biometric_required', message: 'Biometric confirmation is required for payments ≥ ₹1,000.' })
      }
    }
    const entry = await ledger.add({
      userId: req.user.id,
      tool: 'initiate_payment',
      input: req.body,
      result: { status: 'pending_approval' },
      status: 'pending_approval',
    })
    if (req.body.billId) {
      const bill = await prisma.bill.findUnique({ where: { id: req.body.billId } })
      if (bill && bill.userId === req.user.id) {
        const updated = await prisma.bill.update({ where: { id: bill.id }, data: { status: 'Paid' } })
        emit(req.app.get('io'), req.user.id, 'bill:updated', updated)
      }
    }
    res.json({ actionId: entry.id, status: 'pending_approval', ...req.body })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default financeRouter
