import type { Metadata } from 'next'
import { AddEventForm } from '@/components/add-event-form'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Add event · SteadyPace' }

export default function AddEventPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-10">
      <PageHeader title="New event" />
      <AddEventForm />
    </main>
  )
}
