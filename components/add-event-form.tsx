'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { addHours, format, startOfHour } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NameCombobox } from '@/components/name-combobox'
import { createEvent } from '@/lib/events-store'
import { useEvents } from '@/hooks/use-events'
import { canonical, detailOptions, distinctOptions } from '@/lib/event-utils'
import { BOUNDS_LABEL, MAX_DATE, MAX_LABEL, MIN_DATE } from '@/lib/bounds'
import type { RepeatRule } from '@/lib/types'

const MAX_NAME = 100

function defaultDateTime() {
  const next = addHours(startOfHour(new Date()), 1)
  const date = format(next, 'yyyy-MM-dd')
  return { date: date < MIN_DATE ? MIN_DATE : date > MAX_DATE ? MAX_DATE : date, time: format(next, 'HH:mm') }
}
function toMillis(date: string, time: string) {
  if (!date || !time) return null
  const value = new Date(`${date}T${time}`).getTime()
  return Number.isNaN(value) ? null : value
}

export function AddEventForm() {
  const router = useRouter()
  const [initial] = useState(defaultDateTime)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [detailInput, setDetailInput] = useState('')
  const { events } = useEvents()
  const existingNames = distinctOptions(events.map((event) => event.name))
  const existingDetails = detailOptions(events, nameInput)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const data = new FormData(e.currentTarget)
    const typedName = String(data.get('name') ?? '').trim()
    const name = canonical(typedName, existingNames)
    const detail = canonical(String(data.get('detail') ?? ''), existingDetails)
    const date = String(data.get('date') ?? '')
    const time = String(data.get('time') ?? '')
    const endTime = String(data.get('endTime') ?? '')
    const repeatRule = String(data.get('repeatRule') ?? 'none') as RepeatRule
    const repeatUntilDate = String(data.get('repeatUntil') ?? '')
    if (!name) return setError('Please give the event a name.')
    if (name.length > MAX_NAME) return setError(`Name must be ${MAX_NAME} characters or fewer.`)
    if (detail.length > MAX_NAME) return setError(`Detail must be ${MAX_NAME} characters or fewer.`)
    if (date && (date < MIN_DATE || date > MAX_DATE)) return setError(`Events must be between ${BOUNDS_LABEL}.`)
    const startAt = toMillis(date, time)
    const endAt = toMillis(date, endTime)
    if (time && startAt === null) return setError('Please choose a valid start time.')
    if (endTime && endAt === null) return setError('Please choose a valid end time.')
    if (startAt !== null && endAt !== null && endAt < startAt) return setError('End time must be after the start time.')
    let repeatUntil: number | null = null
    if (repeatRule !== 'none') {
      if (!date || !repeatUntilDate || repeatUntilDate < date || repeatUntilDate > MAX_DATE || repeatUntilDate < MIN_DATE) {
        return setError(`Choose a repeat-until date between the event date and ${MAX_LABEL}.`)
      }
      repeatUntil = toMillis(repeatUntilDate, time || '00:00')
    }
    setSubmitting(true)
    try {
      await createEvent({ name, detail, startAt, endAt, repeatRule, repeatUntil })
      router.push('/calendar')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong saving the event.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Event name</Label>
          <NameCombobox
            id="name"
            name="name"
            value={nameInput}
            onValueChange={setNameInput}
            options={existingNames}
            placeholder="e.g. Morning run"
            maxLength={MAX_NAME}
          />
          <p className="text-xs text-muted-foreground">Start typing, or tap the arrow, to pick an existing event name. Matching is case-insensitive, and choosing an existing name groups the event with its past occurrences, which the app uses to predict its timing automatically.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="detail">Detail (optional)</Label>
          <NameCombobox
            id="detail"
            name="detail"
            value={detailInput}
            onValueChange={setDetailInput}
            options={existingDetails}
            placeholder="e.g. School, Grandma's"
            maxLength={MAX_NAME}
            required={false}
            optionsLabel="existing details"
          />
          <p className="text-xs text-muted-foreground">Predictions are calculated from past events with the same name and detail.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2"><Label htmlFor="date">Date</Label><Input id="date" name="date" type="date" min={MIN_DATE} max={MAX_DATE} defaultValue={initial.date} className="h-11 text-base" /></div>
          <div className="flex flex-col gap-2"><Label htmlFor="time">Start time (optional)</Label><Input id="time" name="time" type="time" defaultValue={initial.time} className="h-11 text-base" /></div>
          <div className="col-span-2 flex flex-col gap-2"><Label htmlFor="endTime">End time (optional)</Label><Input id="endTime" name="endTime" type="time" className="h-11 text-base" /></div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="repeatRule">Repeat event</Label>
          <select id="repeatRule" name="repeatRule" className="h-11 rounded-md border border-input bg-background px-3 text-sm">
            <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
          <Label htmlFor="repeatUntil">Repeat until (required for repeats)</Label>
          <Input id="repeatUntil" name="repeatUntil" type="date" min={initial.date} max={MAX_DATE} className="h-11 text-base" />
        </div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" size="lg" className="h-12 rounded-xl text-base" disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}{submitting ? 'Saving…' : 'Add event'}
      </Button>
    </form>
  )
}
