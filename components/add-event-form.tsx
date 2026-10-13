'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { addHours, format, startOfHour } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createEvent } from '@/lib/events-store'

const MAX_NAME = 100
const MAX_DEVIATION = 720

function defaultDateTime() {
  const next = addHours(startOfHour(new Date()), 1)
  return { date: format(next, 'yyyy-MM-dd'), time: format(next, 'HH:mm') }
}

export function AddEventForm() {
  const router = useRouter()
  const [initial] = useState(defaultDateTime)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const data = new FormData(e.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const date = String(data.get('date') ?? '')
    const time = String(data.get('time') ?? '')
    const deviationRaw = String(data.get('deviation') ?? '').trim()

    if (!name) return setError('Please give the event a name.')
    if (name.length > MAX_NAME) return setError(`Name must be ${MAX_NAME} characters or fewer.`)

    const startAt = new Date(`${date}T${time}`).getTime()
    if (!date || !time || Number.isNaN(startAt)) return setError('Please choose a valid date and time.')

    let deviationMinutes: number | null = null
    if (deviationRaw) {
      const parsed = Number(deviationRaw)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_DEVIATION) {
        return setError(`Usual deviation must be a whole number between 0 and ${MAX_DEVIATION} minutes.`)
      }
      deviationMinutes = parsed
    }

    setSubmitting(true)
    try {
      await createEvent({ name, startAt, deviationMinutes })
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
          <Input
            id="name"
            name="name"
            placeholder="e.g. Morning run"
            maxLength={MAX_NAME}
            required
            autoComplete="off"
            className="h-11 text-base"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="date">Date</Label>
            <Input id="date" name="date" type="date" defaultValue={initial.date} required className="h-11 text-base" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="time">Time</Label>
            <Input id="time" name="time" type="time" defaultValue={initial.time} required className="h-11 text-base" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="deviation">
            Usual deviation <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
              ±
            </span>
            <Input
              id="deviation"
              name="deviation"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_DEVIATION}
              step={1}
              placeholder="10"
              aria-describedby="deviation-help"
              className="h-11 pr-16 pl-7 text-base"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
              minutes
            </span>
          </div>
          <p id="deviation-help" className="text-xs text-muted-foreground">
            How early or late this event typically starts. Used for reminders and the expected window.
          </p>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-12 rounded-xl text-base" disabled={submitting}>
        {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {submitting ? 'Saving…' : 'Add event'}
      </Button>
    </form>
  )
}
