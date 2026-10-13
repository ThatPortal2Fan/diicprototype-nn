export type EventStatus = 'scheduled' | 'in_progress' | 'done'

export interface CalendarEvent {
  id: string
  name: string
  startAt: number
  deviationMinutes: number | null
  status: EventStatus
  startedAt: number | null
  shiftedMinutes: number
  createdAt: number
}

export interface NewEventInput {
  name: string
  startAt: number
  deviationMinutes: number | null
}
