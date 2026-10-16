'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ActualTimesFields, useActualTimes } from '@/components/actual-times'
import { updateEvent } from '@/lib/events-store'
import type { CalendarEvent } from '@/lib/types'

/** Edit the actual start / end (or "happened") times and the status of one event. */
export function ActualTimesSection({ event, events }: { event: CalendarEvent; events: CalendarEvent[] }) {
  const times = useActualTimes(event, events, { startAt: event.startAt, endAt: event.endAt })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const actual = times.resolve(event.startAt, event.endAt)
    if (typeof actual === 'string') return setError(actual)
    setSaving(true)
    try {
      await updateEvent(event, {
        name: event.name, detail: event.detail, startAt: event.startAt, endAt: event.endAt,
        repeatRule: event.repeatRule, repeatUntil: event.repeatUntil,
        status: times.status, ...actual,
      })
      times.reset()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.') }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
      <h2 className="font-semibold">Actual times</h2>
      <ActualTimesFields id={`page-${event.id}`} times={times} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="rounded-xl" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}
