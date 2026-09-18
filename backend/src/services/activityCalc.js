import { prisma } from '../config/prisma.js'

// Shared by both places health data can be logged — the manual Health
// screen's "Log Health Data" form (POST /api/health-data/sync) and Ask AI's
// log_health_data tool (autonomyEngine.js) — so "steps → distance/calories"
// and "weight+height → BMI" behave identically no matter which one the user
// actually used. Originally this only existed inside the AI tool, which is
// exactly why filling the manual form left Duration/Calories Burned/Distance
// empty: that whole code path never ran the calculation.

// Pulls a plain number out of either a raw number or a free-text profile
// value like "68 kg" / "172 cm".
export function parseNumericValue(raw) {
  if (raw == null) return null
  if (typeof raw === 'number') return raw
  const match = String(raw).match(/(\d+(\.\d+)?)/)
  return match ? Number(match[1]) : null
}

// Height/weight to use for an activity calculation — whatever was just given
// in this call wins, then the AI Profile's onboarding-time figures as a last
// resort. Hints may be raw numbers, numeric strings, or free-text
// profile-style strings ("68 kg") — parseNumericValue handles all three.
export async function getBodyMetricsForActivity(userId, weightHint, heightHint) {
  let weightKg = parseNumericValue(weightHint)
  let heightCm = parseNumericValue(heightHint)
  if (weightKg && heightCm) return { weightKg, heightCm }
  const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { weight: true, height: true } })
  if (!weightKg) weightKg = parseNumericValue(profile?.weight)
  if (!heightCm) heightCm = parseNumericValue(profile?.height)
  return { weightKg, heightCm }
}

// MET (Metabolic Equivalent of Task) values, pace-adjusted for walking/
// running since those vary a lot with speed — everything else uses a flat
// table value. Same approach any fitness tracker uses to turn "how long"
// into "how many calories", combined with the person's own weight.
export function metForActivity(workoutType, distanceKm, durationMin) {
  const type = String(workoutType || '').trim().toLowerCase()
  const paceKph = distanceKm && durationMin ? distanceKm / (durationMin / 60) : null

  if (!type || type.includes('walk')) {
    if (paceKph == null) return 3.5
    if (paceKph < 4) return 2.8
    if (paceKph < 5.5) return 3.5
    if (paceKph < 6.5) return 4.3
    return 5.0
  }
  if (type.includes('run') || type.includes('jog') || type.includes('sprint')) {
    if (paceKph == null) return 8.3
    if (paceKph < 8) return 7.0
    if (paceKph < 9.5) return 8.3
    if (paceKph < 11) return 9.8
    return 11.8
  }
  const MET_TABLE = {
    cycle: 7.5, cycling: 7.5, bike: 7.5, biking: 7.5,
    swim: 7.0, swimming: 7.0,
    yoga: 2.5, stretching: 2.5,
    gym: 5.0, workout: 5.0, strength: 5.0, 'strength training': 5.0, weights: 5.0, weightlifting: 5.0,
    dance: 5.5, dancing: 5.5,
    hike: 6.0, hiking: 6.0,
    sport: 6.0, sports: 6.0, football: 7.0, basketball: 6.5, badminton: 5.5, tennis: 7.0, cricket: 5.0,
  }
  return MET_TABLE[type] ?? 4.5
}

export function computeBmi(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null
  const heightM = heightCm / 100
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10
}

// ~41.5% of height is the standard walking-stride estimate; 0.71m is a
// blended average when height isn't on file.
export function computeDistanceKmFromSteps(steps, heightCm) {
  const strideM = heightCm ? (heightCm * 0.415) / 100 : 0.71
  return Math.round(((steps * strideM) / 1000) * 100) / 100
}

export function computeCaloriesBurned(met, weightKg, durationMin) {
  return Math.round(met * weightKg * (durationMin / 60))
}
