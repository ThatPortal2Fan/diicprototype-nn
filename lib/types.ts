export type EventStatus = 'scheduled' | 'in_progress' | 'done'
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly'

export interface CalendarEvent {
  id: string
  name: string
  startAt: number | null
  endAt?: number | null
  deviationMinutes: number | null
  status: EventStatus
  startedAt: number | null
  shiftedMinutes: number
  createdAt: number
  repeatRule?: RepeatRule
  repeatUntil?: number | null
}

export interface NewEventInput {
  name: string
  startAt: number | null
  endAt?: number | null
  deviationMinutes: number | null
  repeatRule?: RepeatRule
  repeatUntil?: number | null
}
