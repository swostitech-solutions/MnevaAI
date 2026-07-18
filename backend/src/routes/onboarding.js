import express from 'express'
import { prisma } from '../config/prisma.js'

export const onboardingRouter = express.Router()

const SECTIONS = ['about','work','interests','goals','lifestyle','health','finance','family','aiprefs','connections']

// All individual fields that count toward completion
const ALL_FIELDS = [
  // about (6)
  'nickname','dateOfBirth','city','country','language','gender',
  // work (6)
  'occupation','company','industry','professionalLevel','skills','careerGoals',
  // interests (2)
  'interests','followTopics',
  // goals (2)
  'goals','topGoal',
  // lifestyle (6)
  'wakeTime','sleepTime','workingHours','workMode','productiveTime','exerciseFrequency',
  // health (7)
  'height','weight','bloodGroup','diet','exerciseLevel','allergies','medicalConditions',
  // finance (5)
  'monthlyBudget','upiApps','investmentTypes','investmentPlatforms','financeCountry',
  // family (5)
  'familyReminders','familyMembers','schoolReminders','medicineReminders','vaccinationReminders',
  // aiprefs (4)
  'aiPersonality','responseLength','enableMemory','proactiveSuggestions',
  // connections (1)
  'connectedApps',
]
const TOTAL_FIELDS = ALL_FIELDS.length

function calcCompletionPct(profile) {
  let filled = 0
  ALL_FIELDS.forEach(key => {
    const v = profile[key]
    if (v === null || v === undefined || v === '') return
    if (Array.isArray(v) && v.length === 0) return
    if (typeof v === 'boolean') { if (v) filled++; return }
    filled++
  })
  return Math.round((filled / TOTAL_FIELDS) * 100)
}

function pickSectionFields(section, data) {
  switch (section) {
    case 'about':       return { nickname: data.nickname ?? null, dateOfBirth: data.dateOfBirth ?? null, gender: data.gender ?? null, country: data.country ?? null, city: data.city ?? null, timezone: data.timezone ?? null, language: data.language ?? null }
    case 'work':        return { occupation: data.occupation ?? null, company: data.company ?? null, industry: data.industry ?? null, professionalLevel: data.professionalLevel ?? null, skills: Array.isArray(data.skills) ? data.skills : [], learningTopics: Array.isArray(data.learningTopics) ? data.learningTopics : [], careerGoals: data.careerGoals ?? null }
    case 'interests':   return { interests: Array.isArray(data.interests) ? data.interests : [], followTopics: Array.isArray(data.followTopics) ? data.followTopics : [] }
    case 'goals':       return { goals: Array.isArray(data.goals) ? data.goals : [], topGoal: data.topGoal ?? null }
    case 'lifestyle':   return { wakeTime: data.wakeTime ?? null, sleepTime: data.sleepTime ?? null, workingHours: data.workingHours ?? null, exerciseFrequency: data.exerciseFrequency ?? null, workMode: data.workMode ?? null, productiveTime: data.productiveTime ?? null }
    case 'health':      return { height: data.height ?? null, weight: data.weight ?? null, bloodGroup: data.bloodGroup ?? null, diet: data.diet ?? null, exerciseLevel: data.exerciseLevel ?? null, medicalConditions: data.medicalConditions ?? null, allergies: data.allergies ?? null, healthConnect: data.healthConnect ?? null }
    case 'finance':     return { financeCountry: data.financeCountry ?? null, currency: data.currency ?? null, monthlyBudget: data.monthlyBudget ?? null, investmentExp: data.investmentExp ?? null, investmentPlatforms: Array.isArray(data.investmentPlatforms) ? data.investmentPlatforms : [], investmentTypes: Array.isArray(data.investmentTypes) ? data.investmentTypes : [], upiApps: Array.isArray(data.upiApps) ? data.upiApps : [], monitorBills: Boolean(data.monitorBills) }
    case 'family':      return { familyReminders: Boolean(data.familyReminders), familyMembers: Array.isArray(data.familyMembers) ? data.familyMembers : [], schoolReminders: Boolean(data.schoolReminders), medicineReminders: Boolean(data.medicineReminders), vaccinationReminders: Boolean(data.vaccinationReminders) }
    case 'aiprefs':     return { aiPersonality: data.aiPersonality || 'Friendly', responseLength: data.responseLength || 'Medium', aiVoice: data.aiVoice || 'None', enableMemory: data.enableMemory !== false, proactiveSuggestions: data.proactiveSuggestions !== false, dailySummary: data.dailySummary !== false, weeklyReport: Boolean(data.weeklyReport) }
    case 'connections': return { connectedApps: Array.isArray(data.connectedApps) ? data.connectedApps : [] }
    default: return {}
  }
}

// GET /api/onboarding/profile — only returns THIS user's profile
onboardingRouter.get('/profile', async (req, res) => {
  try {
    const [profile, user] = await Promise.all([
      prisma.userProfile.findUnique({ where: { userId: req.user.id } }),
      prisma.user.findUnique({ where: { id: req.user.id }, select: { onboardingDone: true } }),
    ])
    const completionPct = profile ? calcCompletionPct(profile) : 0
    res.json({ profile: profile ? { ...profile, completionPct } : null, onboardingDone: user?.onboardingDone || false })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/onboarding/section — save one section, recalculate completion %
onboardingRouter.post('/section', async (req, res) => {
  try {
    const { section, data } = req.body
    if (!section || !data) return res.status(400).json({ error: 'section and data required' })
    if (!SECTIONS.includes(section)) return res.status(400).json({ error: 'invalid section' })

    const existing = await prisma.userProfile.findUnique({ where: { userId: req.user.id } })
    const completedSections = Array.isArray(existing?.completedSections) ? [...existing.completedSections] : []
    if (!completedSections.includes(section)) completedSections.push(section)

    const fields = pickSectionFields(section, data)

    // Merge new fields with existing profile to calculate accurate completion
    const mergedProfile = { ...(existing || {}), ...fields }
    const completionPct = calcCompletionPct(mergedProfile)

    const profile = await prisma.userProfile.upsert({
      where:  { userId: req.user.id },
      update: { ...fields, completedSections, completionPct, updatedAt: new Date() },
      create: { userId: req.user.id, ...fields, completedSections, completionPct },
    })

    res.json({ profile, completionPct, completedSections })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/onboarding/memory — append AI memory entries for this user only
onboardingRouter.post('/memory', async (req, res) => {
  try {
    const { memories } = req.body
    if (!Array.isArray(memories)) return res.status(400).json({ error: 'memories[] required' })
    const existing = await prisma.userProfile.findUnique({ where: { userId: req.user.id } })
    const current = Array.isArray(existing?.aiMemories) ? existing.aiMemories : []
    const merged = [...current, ...memories].slice(-50) // keep last 50
    await prisma.userProfile.upsert({
      where:  { userId: req.user.id },
      update: { aiMemories: merged },
      create: { userId: req.user.id, aiMemories: merged },
    })
    res.json({ success: true, memoriesCount: merged.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// POST /api/onboarding/complete
onboardingRouter.post('/complete', async (req, res) => {
  try {
    await prisma.user.update({ where: { id: req.user.id }, data: { onboardingDone: true } })
    res.json({ success: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// GET /api/onboarding/context — full profile context for AI, scoped to this user
onboardingRouter.get('/context', async (req, res) => {
  try {
    const profile = await prisma.userProfile.findUnique({ where: { userId: req.user.id } })
    if (!profile) return res.json({ context: null })
    res.json({ context: profile })
  } catch (err) { res.status(500).json({ error: err.message }) }
})
