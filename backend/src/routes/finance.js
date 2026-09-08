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
    const loan = await prisma.loan.create({
      data: {
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
      },
    })
    emit(req.app.get('io'), req.user.id, 'loan:created', loan)
    res.status(201).json({ loan })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.patch('/loans/:id', async (req, res) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    const b = req.body
    const loan = await prisma.loan.update({
      where: { id: req.params.id },
      data: {
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
      },
    })
    emit(req.app.get('io'), req.user.id, 'loan:updated', loan)
    res.json({ loan })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

financeRouter.delete('/loans/:id', async (req, res) => {
  try {
    const existing = await prisma.loan.findUnique({ where: { id: req.params.id } })
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (existing.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' })
    await prisma.loan.delete({ where: { id: req.params.id } })
    emit(req.app.get('io'), req.user.id, 'loan:deleted', { id: req.params.id })
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

// ── Portfolio / Spending (unchanged, still not backed by real accounts) ──────

financeRouter.get('/portfolio', (_req, res) =>
  res.json({
    totalInvested: 0,
    totalCurrent: 0,
    returnPct: 0,
    cibilScore: null,
    cibilGrade: null,
    netWorth: 0,
    holdings: [],
    accounts: [],
  }),
)
financeRouter.get('/spending', (req, res) =>
  res.json({
    period: req.query.period || 'month',
    total: 0,
    budget: 0,
    savingsRate: 0,
    categories: [],
    insights: [],
  }),
)

financeRouter.post('/pay', async (req, res) => {
  try {
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
