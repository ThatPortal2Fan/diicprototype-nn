export type EventStatus = 'scheduled' | 'in_progress' | 'done'

export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly'

export interface CalendarEvent {
  id: string
  name: string
  /** Planned start. Never changed by starting the event. */
  startAt: number
  endAt: number
  /** The user's own signed estimate: negative = early, positive = late. */
  deviationMinutes: number | null
  /** When the event actually started. Null means it isn't counted for deviation. */
  actualStartAt: number | null
  status: EventStatus
  seriesId: string | null
  recurrence: Recurrence
  createdAt: number
  updatedAt: number
}

export interface EventInput {
  name: string
  startAt: number
  endAt: number
  deviationMinutes: number | null
}

export interface NewEventInput extends EventInput {
  recurrence: Recurrence
  repeatUntil: number | null
}

export type EventPatch = Partial<
  Pick<CalendarEvent, 'name' | 'startAt' | 'endAt' | 'deviationMinutes' | 'actualStartAt' | 'status'>
>
