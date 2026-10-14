import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { getDb, isFirebaseConfigured } from './firebase'
import type { CalendarEvent, NewEventInput } from './types'

export interface EventsSnapshot {
  events: CalendarEvent[]
  status: 'loading' | 'ready' | 'error'
  error: string | null
  mode: 'firebase' | 'demo'
}

const MODE: EventsSnapshot['mode'] = isFirebaseConfigured ? 'firebase' : 'demo'
const COLLECTION = 'events'
const MINUTE = 60_000

const serverSnapshot: EventsSnapshot = {
  events: [],
  status: 'loading',
  error: null,
  mode: MODE,
}

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

function fromDoc(d: QueryDocumentSnapshot<DocumentData>): CalendarEvent {
  const data = d.data()
  return {
    id: d.id,
    name: String(data.name ?? 'Untitled'),
    startAt: toMillis(data.startAt),
    endAt: toMillis(data.endAt),
    deviationMinutes:
      typeof data.deviationMinutes === 'number' ? data.deviationMinutes : null,
    status: data.status ?? 'scheduled',
    startedAt: toMillis(data.startedAt),
    shiftedMinutes: Number(data.shiftedMinutes ?? 0),
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    repeatRule: data.repeatRule ?? 'none',
    repeatUntil: toMillis(data.repeatUntil),
  }
}

function sortEvents(list: CalendarEvent[]) {
  const min = new Date('2026-10-01T00:00:00').getTime()
  const max = new Date('2027-12-31T23:59:59.999').getTime()
  return list.filter((e) => e.startAt === null || (e.startAt >= min && e.startAt <= max)).sort((a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity))
}

function seedDemoEvents(): CalendarEvent[] {
  const now = Date.now()
  const roundedHour = Math.ceil(now / (60 * MINUTE)) * 60 * MINUTE
  const make = (
    name: string,
    offsetMinutes: number,
    deviationMinutes: number | null,
  ): CalendarEvent => ({
    id: crypto.randomUUID(),
    name,
    startAt: roundedHour + offsetMinutes * MINUTE,
    deviationMinutes,
    status: 'scheduled',
    startedAt: null,
    shiftedMinutes: 0,
    createdAt: now,
  })
  return sortEvents([
    make('Morning run', 30, 15),
    make('Team standup', 24 * 60 - 120, 5),
    make('Lunch with Sam', 24 * 60 + 90, 20),
    make('Dentist', 3 * 24 * 60 - 60, null),
    make('Grocery run', 5 * 24 * 60 + 180, 30),
  ])
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true

  if (MODE === 'demo') {
    setSnapshot({ events: seedDemoEvents(), status: 'ready' })
    return
  }

  const q = query(collection(getDb(), COLLECTION), orderBy('startAt', 'asc'))
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

function updateDemo(id: string, patch: (e: CalendarEvent) => Partial<CalendarEvent>) {
  setSnapshot({
    events: sortEvents(
      snapshot.events.map((e) => (e.id === id ? { ...e, ...patch(e) } : e)),
    ),
  })
}

export async function createEvent(input: NewEventInput) {
  const dates: (number | null)[] = []
  const first = input.startAt
  const until = input.repeatUntil ?? first
  if (first === null || !input.repeatRule || input.repeatRule === 'none' || input.repeatUntil == null) {
    dates.push(first)
  } else {
    let cursor = first
    const max = new Date('2027-12-31T23:59:59.999').getTime()
    const limit = Math.min(until, max)
    while (cursor <= limit && dates.length < 460) {
      dates.push(cursor)
      const d = new Date(cursor)
      if (input.repeatRule === 'daily') d.setDate(d.getDate() + 1)
      else if (input.repeatRule === 'weekly') d.setDate(d.getDate() + 7)
      else d.setMonth(d.getMonth() + 1)
      cursor = d.getTime()
    }
  }
  for (const startAt of dates) {
    const endAt = startAt !== null && input.startAt !== null && input.endAt != null
      ? startAt + (input.endAt - input.startAt) : input.endAt ?? null
    const eventInput = { ...input, startAt, endAt, repeatRule: input.repeatRule ?? 'none', repeatUntil: input.repeatUntil ?? null }
    if (MODE === 'demo') {
      const event: CalendarEvent = {
        id: crypto.randomUUID(), ...eventInput, status: 'scheduled',
        startedAt: null, shiftedMinutes: 0, createdAt: Date.now(),
      }
      setSnapshot({ events: sortEvents([...snapshot.events, event]) })
    } else {
      await addDoc(collection(getDb(), COLLECTION), {
        name: eventInput.name,
        startAt: startAt === null ? null : Timestamp.fromMillis(startAt),
        endAt: endAt == null ? null : Timestamp.fromMillis(endAt),
        deviationMinutes: eventInput.deviationMinutes,
        repeatRule: eventInput.repeatRule,
        repeatUntil: eventInput.repeatUntil == null ? null : Timestamp.fromMillis(eventInput.repeatUntil),
        status: 'scheduled', startedAt: null, shiftedMinutes: 0, createdAt: serverTimestamp(),
      })
    }
  }
}

export async function shiftEvent(event: CalendarEvent, minutes: number) {
  if (event.startAt === null) throw new Error('Set a scheduled start time before shifting this event.')
  const startAt = event.startAt + minutes * MINUTE
  if (MODE === 'demo') {
    updateDemo(event.id, (e) => ({ startAt, shiftedMinutes: e.shiftedMinutes + minutes }))
    return
  }
  await updateDoc(doc(getDb(), COLLECTION, event.id), {
    startAt: Timestamp.fromMillis(startAt),
    shiftedMinutes: increment(minutes),
  })
}

export async function startEventNow(event: CalendarEvent) {
  const now = Date.now()
  if (MODE === 'demo') {
    updateDemo(event.id, (e) => ({
      status: 'in_progress',
      startedAt: now,
      shiftedMinutes: e.shiftedMinutes,
    }))
    return
  }
  await updateDoc(doc(getDb(), COLLECTION, event.id), {
    status: 'in_progress',
    startedAt: Timestamp.fromMillis(now),

  })
}

export async function completeEvent(event: CalendarEvent) {
  if (MODE === 'demo') {
    updateDemo(event.id, () => ({ status: 'done' }))
    return
  }
  await updateDoc(doc(getDb(), COLLECTION, event.id), { status: 'done' })
}

export async function removeEvent(event: CalendarEvent) {
  if (MODE === 'demo') {
    setSnapshot({ events: snapshot.events.filter((e) => e.id !== event.id) })
    return
  }
  await deleteDoc(doc(getDb(), COLLECTION, event.id))
}

export async function updateEvent(event: CalendarEvent, input: NewEventInput & { status?: CalendarEvent['status'] }) {
  const patch = {
    name: input.name,
    startAt: input.startAt === null ? null : Timestamp.fromMillis(input.startAt),
    endAt: input.endAt == null ? null : Timestamp.fromMillis(input.endAt),
    deviationMinutes: input.deviationMinutes,
    repeatRule: input.repeatRule ?? 'none',
    repeatUntil: input.repeatUntil == null ? null : Timestamp.fromMillis(input.repeatUntil),
    ...(input.status ? { status: input.status } : {}),
  }
  if (MODE === 'demo') {
    updateDemo(event.id, () => ({
      name: input.name, startAt: input.startAt, endAt: input.endAt ?? null,
      deviationMinutes: input.deviationMinutes, repeatRule: input.repeatRule ?? 'none',
      repeatUntil: input.repeatUntil ?? null, ...(input.status ? { status: input.status } : {}),
    }))
    return
  }
  await updateDoc(doc(getDb(), COLLECTION, event.id), patch)
}
