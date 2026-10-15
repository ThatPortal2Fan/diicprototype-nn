import {
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
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { addDays, addMonths, addWeeks, format } from 'date-fns'
import { MAX_AT, MIN_AT } from './bounds'
import { getDb, isFirebaseConfigured } from './firebase'
import type { CalendarEvent, NewEventInput, RepeatRule } from './types'

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
    detail: String(data.detail ?? ''),
    startAt: toMillis(data.startAt),
    endAt: toMillis(data.endAt),
    status: data.status ?? 'scheduled',
    startedAt: toMillis(data.startedAt),
    completedAt: toMillis(data.completedAt),
    shiftedMinutes: Number(data.shiftedMinutes ?? 0),
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    repeatRule: data.repeatRule ?? 'none',
    repeatUntil: toMillis(data.repeatUntil),
    seriesId: data.seriesId ?? null,
  }
}

function sortEvents(list: CalendarEvent[]) {
  return list.filter((e) => e.startAt === null || (e.startAt >= MIN_AT && e.startAt <= MAX_AT)).sort((a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity))
}

function seedDemoEvents(): CalendarEvent[] {
  const now = Date.now()
  const roundedHour = Math.ceil(now / (60 * MINUTE)) * 60 * MINUTE
  const make = (
    name: string,
    offsetMinutes: number,
  ): CalendarEvent => ({
    id: crypto.randomUUID(),
    name,
    startAt: roundedHour + offsetMinutes * MINUTE,
    status: 'scheduled',
    startedAt: null,
    shiftedMinutes: 0,
    createdAt: now,
  })
  return sortEvents([
    make('Morning run', 30),
    make('Team standup', 24 * 60 - 120),
    make('Lunch with Sam', 24 * 60 + 90),
    make('Dentist', 3 * 24 * 60 - 60),
    make('Grocery run', 5 * 24 * 60 + 180),
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

// Enough for a daily repeat across the whole range.
const MAX_OCCURRENCES = 3700

/** Occurrence times from `first` (inclusive) up to `until`, stepped from the first date so monthly repeats don't drift. */
function repeatDates(first: number, rule: RepeatRule, until: number) {
  const limit = Math.min(until, MAX_AT)
  const step = rule === 'daily' ? addDays : rule === 'weekly' ? addWeeks : addMonths
  const dates: number[] = []
  for (let i = 0; dates.length < MAX_OCCURRENCES; i++) {
    const at = step(first, i).getTime()
    if (at > limit) break
    dates.push(at)
  }
  return dates
}

type Occurrence = Pick<CalendarEvent, 'name' | 'detail' | 'startAt' | 'endAt' | 'repeatRule' | 'repeatUntil' | 'seriesId'>

/** Copies of `base` (keeping its duration) at each of `dates`, all scheduled. */
function occurrences(base: Occurrence, dates: (number | null)[]): Occurrence[] {
  // Only the occurrence fields are copied: never the id, status or recorded times of an edited event.
  return dates.map((startAt) => ({
    name: base.name,
    detail: base.detail ?? '',
    repeatRule: base.repeatRule ?? 'none',
    repeatUntil: base.repeatUntil ?? null,
    seriesId: base.seriesId ?? null,
    startAt,
    endAt: startAt !== null && base.startAt !== null && base.endAt != null ? startAt + (base.endAt - base.startAt) : base.endAt ?? null,
  }))
}

/** Add new scheduled events and delete others, in Firestore batches (or in memory in demo mode). */
async function writeEvents(added: Occurrence[], removedIds: string[] = []) {
  if (MODE === 'demo') {
    const removed = new Set(removedIds)
    const fresh: CalendarEvent[] = added.map((o) => ({
      id: crypto.randomUUID(), ...o, status: 'scheduled', startedAt: null, shiftedMinutes: 0, createdAt: Date.now(),
    }))
    setSnapshot({ events: sortEvents([...snapshot.events.filter((e) => !removed.has(e.id)), ...fresh]) })
    return
  }
  const ops = [
    ...removedIds.map((id) => (batch: ReturnType<typeof writeBatch>) => batch.delete(doc(getDb(), COLLECTION, id))),
    ...added.map((o) => (batch: ReturnType<typeof writeBatch>) =>
      batch.set(doc(collection(getDb(), COLLECTION)), {
        name: o.name,
        detail: o.detail ?? '',
        startAt: o.startAt === null ? null : Timestamp.fromMillis(o.startAt),
        endAt: o.endAt == null ? null : Timestamp.fromMillis(o.endAt),
        repeatRule: o.repeatRule ?? 'none',
        repeatUntil: o.repeatUntil == null ? null : Timestamp.fromMillis(o.repeatUntil),
        seriesId: o.seriesId ?? null,
        status: 'scheduled', startedAt: null, shiftedMinutes: 0, createdAt: serverTimestamp(),
      }),
    ),
  ]
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(getDb())
    ops.slice(i, i + 400).forEach((op) => op(batch))
    await batch.commit()
  }
}

export async function createEvent(input: NewEventInput) {
  const repeatRule = input.repeatRule ?? 'none'
  const repeats = input.startAt !== null && repeatRule !== 'none' && input.repeatUntil != null
  const dates = repeats ? repeatDates(input.startAt!, repeatRule, input.repeatUntil!) : [input.startAt]
  const base: Occurrence = {
    name: input.name,
    detail: input.detail ?? '',
    startAt: input.startAt,
    endAt: input.endAt ?? null,
    repeatRule,
    repeatUntil: input.repeatUntil ?? null,
    seriesId: repeats ? crypto.randomUUID() : null,
  }
  await writeEvents(occurrences(base, dates))
}

const dayKey = (ms: number | null | undefined) => (ms == null ? '' : format(ms, 'yyyy-MM-dd'))
const nameKey = (e: CalendarEvent) => `${e.name.trim().toLocaleLowerCase()}\u0000${(e.detail ?? '').trim().toLocaleLowerCase()}`

function sameSeries(a: CalendarEvent, b: CalendarEvent) {
  if (a.seriesId || b.seriesId) return a.seriesId === b.seriesId
  // Occurrences created before series ids existed: same name, detail and repeat settings.
  return (a.repeatRule ?? 'none') !== 'none' && nameKey(a) === nameKey(b) && a.repeatRule === b.repeatRule && dayKey(a.repeatUntil) === dayKey(b.repeatUntil)
}

/**
 * After an occurrence's repeat settings were edited, apply them to it and the occurrences that follow:
 * later occurrences in its series that haven't started are replaced by copies of this one (name, detail,
 * time and duration) up to the repeat-until date. "Never" just removes them. Started or done ones are kept.
 */
export async function applyRepeatChange(before: CalendarEvent, after: CalendarEvent, events: CalendarEvent[]) {
  const changed = (before.repeatRule ?? 'none') !== (after.repeatRule ?? 'none') || dayKey(before.repeatUntil) !== dayKey(after.repeatUntil)
  if (!changed || before.startAt === null) return
  const following = events.filter(
    (e) => e.id !== before.id && e.startAt !== null && e.startAt > before.startAt! && sameSeries(e, before),
  )
  const removed = following.filter((e) => e.status === 'scheduled')
  const keptDays = new Set(following.filter((e) => e.status !== 'scheduled').map((e) => dayKey(e.startAt)))
  const rule = after.repeatRule ?? 'none'
  const repeats = rule !== 'none' && after.repeatUntil != null && after.startAt !== null
  const seriesId = repeats ? before.seriesId ?? crypto.randomUUID() : before.seriesId ?? null
  const dates = repeats
    ? repeatDates(after.startAt!, rule, after.repeatUntil!).slice(1).filter((at) => !keptDays.has(dayKey(at)))
    : []
  await writeEvents(occurrences({ ...after, seriesId }, dates), removed.map((e) => e.id))
  if (seriesId !== (before.seriesId ?? null)) {
    if (MODE === 'demo') updateDemo(before.id, () => ({ seriesId }))
    else await updateDoc(doc(getDb(), COLLECTION, before.id), { seriesId })
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
  const now = Date.now()
  if (MODE === 'demo') {
    updateDemo(event.id, () => ({ status: 'done', completedAt: now }))
    return
  }
  await updateDoc(doc(getDb(), COLLECTION, event.id), {
    status: 'done',
    completedAt: Timestamp.fromMillis(now),
  })
}

export async function removeEvent(event: CalendarEvent) {
  if (MODE === 'demo') {
    setSnapshot({ events: snapshot.events.filter((e) => e.id !== event.id) })
    return
  }
  await deleteDoc(doc(getDb(), COLLECTION, event.id))
}

export async function updateEvent(
  event: CalendarEvent,
  input: NewEventInput & { status?: CalendarEvent['status']; startedAt?: number | null; completedAt?: number | null },
) {
  // Marking an event done from the edit form records the completion time, like the "Done" button does,
  // unless a finish time was entered.
  const completedNow =
    input.completedAt === undefined && input.status === 'done' && event.status !== 'done' && event.completedAt == null
  const now = Date.now()
  const patch = {
    name: input.name,
    detail: input.detail ?? '',
    startAt: input.startAt === null ? null : Timestamp.fromMillis(input.startAt),
    endAt: input.endAt == null ? null : Timestamp.fromMillis(input.endAt),
    repeatRule: input.repeatRule ?? 'none',
    repeatUntil: input.repeatUntil == null ? null : Timestamp.fromMillis(input.repeatUntil),
    ...(input.status ? { status: input.status } : {}),
    // undefined = leave untouched; null = clear the recorded actual start
    ...(input.startedAt !== undefined ? { startedAt: input.startedAt === null ? null : Timestamp.fromMillis(input.startedAt) } : {}),
    // undefined = leave untouched; null = clear the recorded finish
    ...(input.completedAt !== undefined ? { completedAt: input.completedAt === null ? null : Timestamp.fromMillis(input.completedAt) } : {}),
    ...(completedNow ? { completedAt: Timestamp.fromMillis(now) } : {}),
  }
  if (MODE === 'demo') {
    updateDemo(event.id, () => ({
      name: input.name, detail: input.detail ?? '', startAt: input.startAt, endAt: input.endAt ?? null,
      repeatRule: input.repeatRule ?? 'none',
      repeatUntil: input.repeatUntil ?? null, ...(input.status ? { status: input.status } : {}),
      ...(input.startedAt !== undefined ? { startedAt: input.startedAt } : {}),
      ...(input.completedAt !== undefined ? { completedAt: input.completedAt } : {}),
      ...(completedNow ? { completedAt: now } : {}),
    }))
    return
  }
  await updateDoc(doc(getDb(), COLLECTION, event.id), patch)
}
