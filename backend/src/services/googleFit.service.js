import { google } from 'googleapis'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'

const FIT_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.nutrition.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'openid', 'email', 'profile',
]

const FIT_BASE = 'https://www.googleapis.com/fitness/v1/users/me'

function getOAuthClient(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  )
}

export function createFitAuthUrl(userId, redirectUri, platform = 'web') {
  const oauth2 = getOAuthClient(redirectUri)
  const state = Buffer.from(JSON.stringify({ userId, ts: Date.now(), platform }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return oauth2.generateAuthUrl({
    access_type: 'offline', prompt: 'consent',
    scope: FIT_SCOPES, state,
    redirect_uri: redirectUri,
  })
}

export async function exchangeFitCode(code, redirectUri) {
  const oauth2 = getOAuthClient(redirectUri)
  const { tokens } = await oauth2.getToken(code)
  return tokens
}

export async function saveFitTokens(userId, tokens, email = null) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const prefs = user?.preferences || {}
  prefs.googleFit = { tokens, email, connectedAt: new Date().toISOString(), disconnected: false }
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } })
}

export async function clearFitTokens(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const prefs = user?.preferences || {}
  prefs.googleFit = { tokens: null, email: null, disconnected: true }
  await prisma.user.update({ where: { id: userId }, data: { preferences: prefs } })
}

async function getFitAuthClient(user) {
  const tokens = user?.preferences?.googleFit?.tokens
  if (!tokens?.refresh_token && !tokens?.access_token) return null
  const redirectUri = process.env.GOOGLE_FIT_REDIRECT_URI || `${process.env.PUBLIC_URL || 'http://localhost:3001'}/api/googlefit/callback`
  const oauth2 = getOAuthClient(redirectUri)
  oauth2.setCredentials(tokens)
  // persist refreshed tokens automatically
  oauth2.on('tokens', async (newTokens) => {
    try {
      const fresh = await prisma.user.findUnique({ where: { id: user.id } })
      const prefs = fresh?.preferences || {}
      prefs.googleFit = { ...prefs.googleFit, tokens: { ...tokens, ...newTokens } }
      await prisma.user.update({ where: { id: user.id }, data: { preferences: prefs } })
    } catch { /* best-effort */ }
  })
  return oauth2
}

async function fitGet(auth, path, params = {}) {
  const url = new URL(`${FIT_BASE}${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const { token } = await auth.getAccessToken()
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Fit API ${res.status}`)
  }
  return res.json()
}

async function fitPost(auth, path, body) {
  const { token } = await auth.getAccessToken()
  const res = await fetch(`${FIT_BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || `Fit API ${res.status}`)
  }
  return res.json()
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

export async function fetchSteps(auth, startMs, endMs) {
  const data = await fitPost(auth, '/dataset:aggregate', {
    aggregateBy: [{
      dataTypeName: 'com.google.step_count.delta',
      dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
    }],
    bucketByTime: { durationMillis: 86400000 },
    startTimeMillis: startMs, endTimeMillis: endMs,
  })
  return (data.bucket || []).map(b => {
    const points = b.dataset?.[0]?.point || []
    const steps = points.reduce((sum, p) => sum + (p.value?.[0]?.intVal || 0), 0)
    return { date: new Date(Number(b.startTimeMillis)).toISOString().slice(0, 10), steps }
  })
}

export async function fetchHeartRate(auth, startMs, endMs) {
  const data = await fitPost(auth, '/dataset:aggregate', {
    aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
    bucketByTime: { durationMillis: Math.max(endMs - startMs, 1) },
    startTimeMillis: startMs, endTimeMillis: endMs,
  })
  const points = (data.bucket || []).flatMap(b => b.dataset?.[0]?.point || [])
  if (!points.length) return null
  const vals = points.map(p => p.value?.[0]?.fpVal || 0).filter(Boolean)
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null
}

export async function fetchSleep(auth, startMs, endMs) {
  try {
    const data = await fitGet(auth, '/sessions', {
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      activityType: 72, // sleep
    })
    const sessions = data.session || []
    const totalMs = sessions.reduce((sum, s) => sum + (Number(s.endTimeMillis) - Number(s.startTimeMillis)), 0)
    return totalMs > 0 ? Math.round((totalMs / 3600000) * 10) / 10 : null
  } catch { return null }
}

export async function fetchCalories(auth, startMs, endMs) {
  const data = await fitPost(auth, '/dataset:aggregate', {
    aggregateBy: [{ dataTypeName: 'com.google.calories.expended' }],
    bucketByTime: { durationMillis: endMs - startMs },
    startTimeMillis: startMs, endTimeMillis: endMs,
  })
  const val = data.bucket?.[0]?.dataset?.[0]?.point?.[0]?.value?.[0]?.fpVal
  return val ? Math.round(val) : null
}

export async function fetchWeight(auth, startMs, endMs) {
  const data = await fitPost(auth, '/dataset:aggregate', {
    aggregateBy: [{ dataTypeName: 'com.google.weight' }],
    bucketByTime: { durationMillis: 86400000 }, // daily buckets — avoids "aggregate duration too large"
    startTimeMillis: startMs, endTimeMillis: endMs,
  })
  const points = (data.bucket || []).flatMap(b => b.dataset?.[0]?.point || [])
  if (!points.length) return null
  const latest = points[points.length - 1]
  // summary type returns [min, avg, max] — use avg (index 1), fallback to index 0
  const val = latest?.value?.[1]?.fpVal || latest?.value?.[0]?.fpVal
  return val ? Math.round(val * 10) / 10 : null
}

export async function fetchHeight(auth, startMs, endMs) {
  // Google Fit aggregate API limit: max ~90 days per request with daily buckets
  // Search in 90-day chunks going backwards until we find a data point
  const CHUNK = 90 * 86400000
  let chunkEnd = endMs
  while (chunkEnd > startMs) {
    const chunkStart = Math.max(chunkEnd - CHUNK, startMs)
    try {
      const data = await fitPost(auth, '/dataset:aggregate', {
        aggregateBy: [{ dataTypeName: 'com.google.height' }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: chunkStart, endTimeMillis: chunkEnd,
      })
      const points = (data.bucket || []).flatMap(b => b.dataset?.[0]?.point || [])
      if (points.length) {
        const latest = points[points.length - 1]
        // summary type returns [min, avg, max] — use avg (index 1), fallback to index 0
        const val = latest?.value?.[1]?.fpVal || latest?.value?.[0]?.fpVal
        if (val) return Math.round(val * 100) // metres → cm
      }
    } catch { /* chunk failed, try next */ }
    chunkEnd = chunkStart
  }
  return null
}

// exported for debug route
export async function fetchHeightRaw(auth, startMs, endMs) {
  return fitPost(auth, '/dataset:aggregate', {
    aggregateBy: [{ dataTypeName: 'com.google.height' }],
    bucketByTime: { durationMillis: Math.max(endMs - startMs, 1) },
    startTimeMillis: startMs, endTimeMillis: endMs,
  })
}

export async function getFitAuthClientForUser(user) {
  return getFitAuthClient(user)
}

// ── Main health data builder ──────────────────────────────────────────────────

export async function getHealthData(user) {
  const prefs = user?.preferences || {}
  const fitConnected = !prefs.googleFit?.disconnected && !!(prefs.googleFit?.tokens?.refresh_token || prefs.googleFit?.tokens?.access_token)
  const synced = prefs.healthSync || null
  const today = new Date().toISOString().slice(0, 10)
  const syncedToday = synced?.date === today

  // Try Google Fit REST API first
  if (fitConnected) {
    try {
      const auth = await getFitAuthClient(user)
      if (auth) {
        const now = Date.now()
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
        const todayStartMs = todayStart.getTime()
        const weekStartMs = todayStartMs - 6 * 86400000

        const [weeklyStepsRaw, heartRate, sleep, calories, weight, height] = await Promise.allSettled([
          fetchSteps(auth, weekStartMs, now),
          fetchHeartRate(auth, todayStartMs, now),
          fetchSleep(auth, todayStartMs - 86400000, now),
          fetchCalories(auth, todayStartMs, now),
          fetchWeight(auth, now - 30 * 86400000, now),
          fetchHeight(auth, now - 365 * 86400000, now),
        ])

        const weeklySteps = weeklyStepsRaw.status === 'fulfilled' ? weeklyStepsRaw.value : []
        const todaySteps = weeklySteps.find(d => d.date === today)?.steps || 0
        const stepGoal = 10000
        const hr = heartRate.status === 'fulfilled' ? heartRate.value : null
        const sl = sleep.status === 'fulfilled' ? sleep.value : null
        const cal = calories.status === 'fulfilled' ? calories.value : null
        const wt = weight.status === 'fulfilled' ? weight.value : null
        const ht = height.status === 'fulfilled' ? height.value : null
        return {
          period: 'today', lastUpdated: new Date().toISOString(), source: 'google_fit',
          heartRate: hr ? { value: hr, status: hr < 60 ? 'Low' : hr > 100 ? 'High' : 'Normal', unit: 'bpm' } : null,
          steps: { value: todaySteps, goal: stepGoal, pct: Math.min(100, Math.round((todaySteps / stepGoal) * 100)) },
          sleep: sl ? { value: sl, quality: sl >= 7 ? 'Good' : sl >= 5 ? 'Fair' : 'Poor', unit: 'hrs' } : null,
          calories: cal ? { consumed: cal, goal: 2000, unit: 'kcal' } : null,
          weight: wt ? { value: wt, unit: 'kg' } : null,
          height: ht ? { value: ht, unit: 'cm' } : null,
          weeklySteps: weeklySteps.map(d => ({ day: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(d.date).getDay()], steps: d.steps, date: d.date })),
        }
      }
    } catch (fitErr) {
      logger.warn('Google Fit API fetch failed, falling through:', fitErr.message)
    }
    // Fit is connected but auth client unavailable — return empty shell so UI shows connected state
    return {
      period: 'today', lastUpdated: new Date().toISOString(), source: 'google_fit',
      heartRate: null, steps: { value: 0, goal: 10000, pct: 0 },
      sleep: null, calories: null, weight: null, weeklySteps: [],
    }
  }

  // Fall back to manually synced data (iOS Shortcut / Apple Health / manual input)
  if (synced) {
    const stepGoal = 10000
    const steps = synced.steps || 0
    const hr = synced.heartRate || null
    const sl = synced.sleep || null
    const cal = synced.calories || null
    const wt = synced.weight || null
    const ht = synced.height || null
    return {
      period: 'today', lastUpdated: synced.lastSynced || new Date().toISOString(),
      source: synced.source || 'manual',
      heartRate: hr ? { value: hr, status: hr < 60 ? 'Low' : hr > 100 ? 'High' : 'Normal', unit: 'bpm' } : null,
      steps: { value: steps, goal: stepGoal, pct: Math.min(100, Math.round((steps / stepGoal) * 100)) },
      sleep: sl ? { value: sl, quality: sl >= 7 ? 'Good' : sl >= 5 ? 'Fair' : 'Poor', unit: 'hrs' } : null,
      calories: cal ? { consumed: cal, goal: 2000, unit: 'kcal' } : null,
      weight: wt ? { value: wt, unit: 'kg' } : null,
      height: ht ? { value: ht, unit: 'cm' } : null,
      weeklySteps: [],
      syncedToday,
    }
  }

  throw new Error('no_health_data')
}
