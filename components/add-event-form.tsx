'use client'

import { useRouter } from 'next/navigation'
import { EventForm } from '@/components/event-form'
import { createEvents } from '@/lib/events-store'

export function AddEventForm() {
  const router = useRouter()
  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
      <EventForm
        mode="create"
        submitLabel="Add event"
        onSubmit={async (input) => {
          const count = await createEvents(input)
          if (count === 0) throw new Error('No occurrences fall inside October 2026 – December 2027.')
          router.push('/calendar')
        }}
      />
    </div>
  )
}
