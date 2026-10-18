export type EventStatus = 'scheduled' | 'in_progress' | 'done'
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly'

/** A window the user thinks something might happen in, in minutes from the scheduled time (negative = before). */
export interface ManualWindow {
  fromMinutes: number
  toMinutes: number
}

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
  /** The user's own buffer for the start (or, for instant events, when it happens), around the scheduled start. */
  manualStart?: ManualWindow | null
  /** The user's own buffer for the end, around the scheduled end. */
  manualEnd?: ManualWindow | null
}

export interface NewEventInput {
  name: string
  detail?: string
  startAt: number | null
  endAt?: number | null
  repeatRule?: RepeatRule
  repeatUntil?: number | null
  manualStart?: ManualWindow | null
  manualEnd?: ManualWindow | null
}
