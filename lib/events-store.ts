import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb, isFirebaseConfigured } from './firebase'
import { expandOccurrences, WINDOW_END, WINDOW_START } from './date-window'
import type { CalendarEvent, EventPatch, NewEventInput, Recurrence } from './types'

export interface EventsSnapshot {
  events: CalendarEvent[]
  status: 'loading' | 'ready' | 'error'
  error: string | null
  mode: 'firebase' | 'demo'
}

const MODE: EventsSnapshot['mode'] = isFirebaseConfigured ? 'firebase' : 'demo'
const COLLECTION = 'events'
const MINUTE = 60_000
const BATCH_LIMIT = 450

const serverSnapshot: EventsSnapshot = { events: [], status: 'loading', error: null, mode: MODE }

let snapshot: EventsSnapshot = serverSnapshot
let started = false
const listeners = new Set<() => void>()

function setSnapshot(next: Partial<EventsSnapshot>) {
  snapshot = { ...snapshot, ...next }
  listeners.forEach((listener) => listener())
}

function toMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis()
  if (typeof value === 'number') return value
  return null
}

const ts = (ms: number | null) => (ms === null ? null : Timestamp.fromMillis(ms))

function fromDoc(d: QueryDocumentSnapshot<DocumentData>): CalendarEvent {
  const data = d.data()
  const startAt = toMillis(data.startAt) ?? Date.now()
  const createdAt = toMillis(data.createdAt) ?? Date.now()
  return {
    id: d.id,
    name: String(data.name ?? 'Untitled'),
    startAt,
    endAt: toMillis(data.endAt) ?? startAt + 60 * MINUTE,
    deviationMinutes: typeof data.deviationMinutes === 'number' ? data.deviationMinutes : null,
    actualStartAt: toMillis(data.actualStartAt) ?? toMillis(data.startedAt),
    status: data.status ?? 'scheduled',
    seriesId: typeof data.seriesId === 'string' ? data.seriesId : null,
    recurrence: (data.recurrence as Recurrence) ?? 'none',
    createdAt,
    updatedAt: toMillis(data.updatedAt) ?? createdAt,
  }
}

function toDoc(e: Omit<CalendarEvent, 'id'>) {
  return {
    name: e.name,
    startAt: ts(e.startAt),
    endAt: ts(e.endAt),
    deviationMinutes: e.deviationMinutes,
    actualStartAt: ts(e.actualStartAt),
    status: e.status,
    seriesId: e.seriesId,
    recurrence: e.recurrence,
    createdAt: ts(e.createdAt),
    updatedAt: ts(e.updatedAt),
  }
}

function patchToDoc(patch: EventPatch & { updatedAt: number }) {
  const out: Record<string, string | number | null | Timestamp> = {}
  for (const [key, value] of Object.entries(patch)) {
    out[key] =
      key === 'startAt' || key === 'endAt' || key === 'actualStartAt' || key === 'updatedAt'
        ? ts(value as number | null)
        : (value as string | number | null)
  }
  return out
}

function sortEvents(list: CalendarEvent[]) {
  return [...list].sort((a, b) => a.startAt - b.startAt)
}

function buildOccurrences(input: NewEventInput): Omit<CalendarEvent, 'id'>[] {
  const duration = input.endAt - input.startAt
  const starts = expandOccurrences(input.startAt, input.recurrence, input.repeatUntil)
  const seriesId = input.recurrence === 'none' ? null : crypto.randomUUID()
  const now = Date.now()
  return starts.map((startAt) => ({
    name: input.name,
    startAt,
    endAt: startAt + duration,
    deviationMinutes: input.deviationMinutes,
    actualStartAt: null,
    status: 'scheduled',
    seriesId,
    recurrence: input.recurrence,
    createdAt: now,
    updatedAt: now,
  }))
}

function seedDemoEvents(): CalendarEvent[] {
  const now = Date.now()
  const hour = 60 * MINUTE
  const nextHour = Math.ceil(now / hour) * hour
  const today9 = new Date(now)
  today9.setHours(9, 0, 0, 0)

  const standup = buildOccurrences({
    name: 'Team standup',
    startAt: today9.getTime() - 7 * 24 * hour,
    endAt: today9.getTime() - 7 * 24 * hour + 15 * MINUTE,
    deviationMinutes: null,
    recurrence: 'weekdays',
    repeatUntil: today9.getTime() + 14 * 24 * hour,
  }).map((e, i) => {
    const past = e.endAt < now
    const lateBy = [4, 7, 3, 9, 6][i % 5]
    return {
      ...e,
      id: crypto.randomUUID(),
      status: past ? ('done' as const) : ('scheduled' as const),
      actualStartAt: past ? e.startAt + lateBy * MINUTE : null,
    }
  })

  const single = (name: string, offsetHours: number, durationMin: number, dev: number | null) => {
    const startAt = nextHour + offsetHours * hour
    return {
      id: crypto.randomUUID(),
      name,
      startAt,
      endAt: startAt + durationMin * MINUTE,
      deviationMinutes: dev,
      actualStartAt: null,
      status: 'scheduled' as const,
      seriesId: null,
      recurrence: 'none' as const,
      createdAt: now,
      updatedAt: now,
    }
  }

  return sortEvents([
    ...standup,
    single('Morning run', 1, 45, -10),
    single('Lunch with Sam', 27, 60, 15),
    single('Dentist', 70, 30, null),
  ])
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true

  if (MODE === 'demo') {
    setSnapshot({ events: seedDemoEvents(), status: 'ready' })
    return
  }

  const q = query(
    collection(getDb(), COLLECTION),
    where('startAt', '>=', Timestamp.fromMillis(WINDOW_START)),
    where('startAt', '<=', Timestamp.fromMillis(WINDOW_END)),
    orderBy('startAt', 'asc'),
  )
  onSnapshot(
    q,
    (snap) => setSnapshot({ events: snap.docs.map(fromDoc), status: 'ready', error: null }),
    (err) => setSnapshot({ status: 'error', error: err.message }),
  )
}

export function subscribeEvents(listener: () => void) {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
  }
}

export const getEventsSnapshot = () => snapshot
export const getEventsServerSnapshot = () => serverSnapshot

/** Creates the event, plus every recurrence inside the Oct 2026 – Dec 2027 window. Returns how many were created. */
export async function createEvents(input: NewEventInput) {
  const occurrences = buildOccurrences(input)
  if (MODE === 'demo') {
    setSnapshot({
      events: sortEvents([
        ...snapshot.events,
        ...occurrences.map((o) => ({ ...o, id: crypto.randomUUID() })),
      ]),
    })
    return occurrences.length
  }
  const db = getDb()
  for (let i = 0; i < occurrences.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const o of occurrences.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(collection(db, COLLECTION)), toDoc(o))
    }
    await batch.commit()
  }
  return occurrences.length
}

export async function updateEvent(id: string, patch: EventPatch) {
  const full = { ...patch, updatedAt: Date.now() }
  if (MODE === 'demo') {
    setSnapshot({
      events: sortEvents(snapshot.events.map((e) => (e.id === id ? { ...e, ...full } : e))),
    })
    return
  }
  await updateDoc(doc(getDb(), COLLECTION, id), patchToDoc(full))
}

/** Records the real start time for the deviation calculation; the planned start is left untouched. */
export function startEventNow(event: CalendarEvent) {
  return updateEvent(event.id, { status: 'in_progress', actualStartAt: Date.now() })
}

export function completeEvent(event: CalendarEvent) {
  return updateEvent(event.id, { status: 'done' })
}

export async function removeEvent(event: CalendarEvent) {
  if (MODE === 'demo') {
    setSnapshot({ events: snapshot.events.filter((e) => e.id !== event.id) })
    return
  }
  await deleteDoc(doc(getDb(), COLLECTION, event.id))
}

export async function removeSeries(seriesId: string) {
  if (MODE === 'demo') {
    setSnapshot({ events: snapshot.events.filter((e) => e.seriesId !== seriesId) })
    return
  }
  const db = getDb()
  const snap = await getDocs(query(collection(db, COLLECTION), where('seriesId', '==', seriesId)))
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    snap.docs.slice(i, i + BATCH_LIMIT).forEach((d) => batch.delete(d.ref))
    await batch.commit()
  }
}
