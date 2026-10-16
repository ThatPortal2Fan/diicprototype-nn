import type { Metadata } from 'next'
import { NextEventView } from '@/components/next-event/next-event-view'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Nearest event · SteadyPace' }

export default async function NextEventPage({ searchParams }: { searchParams: Promise<{ event?: string | string[] }> }) {
  // ?event=<id> (e.g. from a notification) shows that event instead of the nearest one.
  const { event } = await searchParams
  const eventId = typeof event === 'string' && event ? event : undefined
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-10">
      <PageHeader title={eventId ? 'Event' : 'Nearest event'} />
      <NextEventView eventId={eventId} />
    </main>
  )
}
