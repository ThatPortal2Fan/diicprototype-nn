// Creates (or resets) a demo account with ~2 months of completed history and upcoming events,
// so the calculated buffers have data to work from. Dates are relative to when it runs: re-run it
// shortly before a demo.
//
//   node --env-file=.env.local scripts/seed-demo-account.mjs [username] [password]
//
// Re-running with the same account replaces all of its events.

import { initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, doc, getDocs, getFirestore, terminate, Timestamp, writeBatch } from 'firebase/firestore'

const USERNAME = (process.argv[2] ?? 'demo').trim().toLowerCase()
const PASSWORD = process.argv[3] ?? 'steadypace-demo'
// Same mapping as lib/auth.ts.
const EMAIL = `${USERNAME}@users.steadypace.example.com`

const PAST_WEEKS = 9
const FUTURE_WEEKS = 6
const MINUTE = 60_000
const WEEKDAYS = [1, 2, 3, 4, 5]

/**
 * Recurring events. `start` / `end` are [mean, std] in minutes of how far off the scheduled time the
 * real start / finish lands (the app fits a normal distribution to these and buffers ±1.5σ).
 * No `minutes` = an instant event (only a start). `manualStart` / `manualEnd` are the user's own buffer.
 */
const RECURRING = [
  { name: 'Bus to work', detail: 'Line 728', days: WEEKDAYS, at: '08:10', start: [4, 3] },
  { name: 'Team standup', detail: 'Office', days: WEEKDAYS, at: '09:30', minutes: 15, start: [2, 1.5], end: [7, 4], manualEnd: { fromMinutes: 0, toMinutes: 10 } },
  { name: 'School pick-up', detail: 'Escola Básica', days: WEEKDAYS, at: '16:00', start: [8, 5] },
  { name: 'Spinning class', detail: 'Gym', days: [2, 4], at: '19:00', minutes: 50, start: [-4, 2], end: [2, 2] },
  { name: '1:1 with manager', detail: 'Ana', days: [3], at: '14:00', minutes: 30, start: [3, 2], end: [9, 6] },
  { name: 'Physio', detail: 'Clínica Costa', days: [1], at: '18:30', minutes: 45, start: [14, 8], end: [16, 9], manualStart: { fromMinutes: 0, toMinutes: 20 } },
  { name: 'Grocery delivery', detail: 'Continente', days: [6], at: '10:00', start: [24, 17], manualStart: { fromMinutes: -10, toMinutes: 60 } },
  { name: 'Swimming lesson', detail: 'Tomás', days: [6], at: '11:30', minutes: 45, start: [1, 2], end: [6, 3] },
  { name: 'Sunday lunch', detail: 'Grandparents', days: [0], at: '13:00', minutes: 150, start: [18, 12], end: [40, 25] },
]

/** One-off events: `day` is days from today (negative = past, recorded as done). */
const ONE_OFFS = [
  { name: 'Haircut', detail: 'Barbearia Lisboa', day: -50, at: '12:30', minutes: 40, start: 5, end: 10 },
  { name: 'Car service', detail: 'Oficina Auto', day: -33, at: '08:30', minutes: 240, start: -5, end: 95 },
  { name: 'Birthday dinner', detail: 'Marta', day: -19, at: '20:00', minutes: 150, start: 25, end: 50 },
  { name: 'Dentist', detail: 'Dr. Silva', day: 3, at: '17:00', minutes: 45, manualStart: { fromMinutes: 0, toMinutes: 15 }, manualEnd: { fromMinutes: 0, toMinutes: 20 } },
  { name: 'Car inspection', detail: 'Centro IPO', day: 8, at: '09:00', minutes: 60, manualEnd: { fromMinutes: 0, toMinutes: 45 } },
  { name: 'Parent-teacher meeting', detail: 'Escola Básica', day: 11, at: '18:00', minutes: 30 },
  { name: 'Flight to Porto', detail: 'TP1946', day: 18, at: '07:40', manualStart: { fromMinutes: 0, toMinutes: 45 } },
]

// Seeded so every run produces the same history (relative to the run date).
function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const random = mulberry32(20261019)
function normal([mean, std]) {
  const u = 1 - random()
  const v = random()
  return Math.round(mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v))
}

/** Local time on `date` (a Date at midnight) at "HH:MM". */
function at(date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m).getTime()
}
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

const now = Date.now()
const today = addDays(new Date(now), 0)
const monday = addDays(today, -((today.getDay() + 6) % 7))
const firstDay = addDays(monday, -7 * PAST_WEEKS)
const lastDay = addDays(monday, 7 * FUTURE_WEEKS - 1)
const createdAt = addDays(firstDay, -3).getTime()

/** Done with the given actual offsets if it finished before now, scheduled if it hasn't started, else skipped. */
function build({ name, detail, startAt, endAt, startOffset, endOffset, manualStart, manualEnd, series }) {
  const base = {
    name, detail, startAt, endAt, createdAt,
    repeatRule: series ? 'weekly' : 'none',
    repeatUntil: series?.until ?? null,
    seriesId: series?.id ?? null,
    manualStart: manualStart ?? null,
    manualEnd: manualEnd ?? null,
    shiftedMinutes: 0,
  }
  if (startAt >= now) return { ...base, status: 'scheduled', startedAt: null, completedAt: null }
  if (startOffset == null) return null
  const startedAt = startAt + startOffset * MINUTE
  const completedAt = endAt == null ? startedAt : Math.max(startedAt + 5 * MINUTE, endAt + endOffset * MINUTE)
  if (completedAt > now) return null
  return { ...base, status: 'done', startedAt, completedAt }
}

const events = []
for (const t of RECURRING) {
  for (const weekday of t.days) {
    const first = addDays(firstDay, (weekday - firstDay.getDay() + 7) % 7)
    const dates = []
    for (let d = first; d <= lastDay; d = addDays(d, 7)) dates.push(d)
    const series = { id: crypto.randomUUID(), until: at(dates.at(-1), t.at) }
    for (const date of dates) {
      // The odd missed week (holiday, sick day), only in the past.
      if (date < today && random() < 0.06) continue
      const startAt = at(date, t.at)
      const endAt = t.minutes ? startAt + t.minutes * MINUTE : null
      const event = build({
        ...t, startAt, endAt, series,
        startOffset: normal(t.start),
        endOffset: t.end ? normal(t.end) : null,
      })
      if (event) events.push(event)
    }
  }
}
for (const t of ONE_OFFS) {
  const startAt = at(addDays(today, t.day), t.at)
  const endAt = t.minutes ? startAt + t.minutes * MINUTE : null
  const event = build({ ...t, startAt, endAt, startOffset: t.start, endOffset: t.end })
  if (event) events.push(event)
}

const toTimestamp = (ms) => (ms == null ? null : Timestamp.fromMillis(ms))
const toDoc = (e) => ({
  ...e,
  startAt: toTimestamp(e.startAt),
  endAt: toTimestamp(e.endAt),
  startedAt: toTimestamp(e.startedAt),
  completedAt: toTimestamp(e.completedAt),
  repeatUntil: toTimestamp(e.repeatUntil),
  createdAt: toTimestamp(e.createdAt),
})

if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) throw new Error('Run with --env-file=.env.local')
const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
})

const auth = getAuth(app)
let credential
try {
  credential = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD)
  console.log(`Signed in as existing user "${USERNAME}"`)
} catch (err) {
  if (err.code !== 'auth/invalid-credential' && err.code !== 'auth/user-not-found') throw err
  try {
    credential = await createUserWithEmailAndPassword(auth, EMAIL, PASSWORD)
    console.log(`Created user "${USERNAME}"`)
  } catch (createErr) {
    if (createErr.code === 'auth/email-already-in-use') {
      throw new Error(`"${USERNAME}" already exists with a different password. Pass another username.`)
    }
    throw createErr
  }
}

const db = getFirestore(app)
const eventsRef = collection(db, 'users', credential.user.uid, 'events')
const existing = await getDocs(eventsRef)
const ops = [
  ...existing.docs.map((d) => (batch) => batch.delete(d.ref)),
  ...events.map((e) => (batch) => batch.set(doc(eventsRef), toDoc(e))),
]
for (let i = 0; i < ops.length; i += 400) {
  const batch = writeBatch(db)
  ops.slice(i, i + 400).forEach((op) => op(batch))
  await batch.commit()
}

const done = events.filter((e) => e.status === 'done').length
const fmt = (d) => d.toLocaleDateString('en-CA')
console.log(`Removed ${existing.size} old events; wrote ${done} done + ${events.length - done} upcoming (${fmt(firstDay)} to ${fmt(lastDay)}).`)
console.log(`Log in with username "${USERNAME}" and password "${PASSWORD}".`)
await terminate(db)
process.exit(0)
