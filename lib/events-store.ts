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
    startAt: toMillis(data.startAt) ?? Date.now(),
    deviationMinutes:
      typeof data.deviationMinutes === 'number' ? data.deviationMinutes : null,
    status: data.status ?? 'scheduled',
    startedAt: toMillis(data.startedAt),
    shiftedMinutes: Number(data.shiftedMinutes ?? 0),
    createdAt: toMillis(data.createdAt) ?? Date.now(),
  }
}

function sortEvents(list: CalendarEvent[]) {
  return [...list].sort((a, b) => a.startAt - b.startAt)
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
  if (MODE === 'demo') {
    const event: CalendarEvent = {
      id: crypto.randomUUID(),
      ...input,
      status: 'scheduled',
      startedAt: null,
      shiftedMinutes: 0,
      createdAt: Date.now(),
    }
    setSnapshot({ events: sortEvents([...snapshot.events, event]) })
    return
  }
  await addDoc(collection(getDb(), COLLECTION), {
    name: input.name,
    startAt: Timestamp.fromMillis(input.startAt),
    deviationMinutes: input.deviationMinutes,
    status: 'scheduled',
    startedAt: null,
    shiftedMinutes: 0,
    createdAt: serverTimestamp(),
  })
}

export async function shiftEvent(event: CalendarEvent, minutes: number) {
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
  const diffMinutes = Math.round((now - event.startAt) / MINUTE)
  if (MODE === 'demo') {
    updateDemo(event.id, (e) => ({
      status: 'in_progress',
      startedAt: now,
      startAt: now,
      shiftedMinutes: e.shiftedMinutes + diffMinutes,
    }))
    return
  }
  await updateDoc(doc(getDb(), COLLECTION, event.id), {
    status: 'in_progress',
    startedAt: Timestamp.fromMillis(now),
    startAt: Timestamp.fromMillis(now),
    shiftedMinutes: increment(diffMinutes),
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
