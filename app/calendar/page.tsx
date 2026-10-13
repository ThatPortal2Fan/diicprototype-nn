import type { Metadata } from 'next'
import { CalendarView } from '@/components/calendar/calendar-view'

export const metadata: Metadata = { title: 'Calendar · Cadence' }

export default function CalendarPage() {
  return <CalendarView />
}
