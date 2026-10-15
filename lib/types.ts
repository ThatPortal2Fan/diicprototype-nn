export type EventStatus = 'scheduled' | 'in_progress' | 'done'
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly'

export interface CalendarEvent {
  id: string
  name: string
  /** Extra text that, together with the name, identifies similar occurrences (e.g. a place or person). */
  detail?: string
  startAt: number | null
  endAt?: number | null
  status: EventStatus
  startedAt: number | null
  completedAt?: number | null
  shiftedMinutes: number
  createdAt: number
  repeatRule?: RepeatRule
  repeatUntil?: number | null
  /** Shared by the occurrences of a repeating event. */
  seriesId?: string | null
}

export interface NewEventInput {
  name: string
  detail?: string
  startAt: number | null
  endAt?: number | null
  repeatRule?: RepeatRule
  repeatUntil?: number | null
}
