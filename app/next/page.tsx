import type { Metadata } from 'next'
import { NextEventView } from '@/components/next-event/next-event-view'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Next event · Cadence' }

export default function NextEventPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-5 pb-10">
      <PageHeader title="Up next" />
      <NextEventView />
    </main>
  )
}
