'use client'

import Link from 'next/link'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { format } from 'date-fns'
import { Clock, Timer, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { removeEvent } from '@/lib/events-store'
import type { CalendarEvent } from '@/lib/types'

const STATUS_LABEL: Record<CalendarEvent['status'], string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  done: 'Done',
}

interface EventPopoverProps {
  event: CalendarEvent
  className?: string
  style?: CSSProperties
  children: ReactNode
}

export function EventPopover({ event, className, style, children }: EventPopoverProps) {
  const [deleting, setDeleting] = useState(false)
  const dev = event.deviationMinutes

  return (
    <Popover>
      <PopoverTrigger
        className={className}
        style={style}
        aria-label={`${event.name}, ${format(event.startAt, 'EEEE MMMM d, p')}`}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-balance">{event.name}</p>
          <Badge variant={event.status === 'scheduled' ? 'secondary' : 'outline'}>
            {STATUS_LABEL[event.status]}
          </Badge>
        </div>
        <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <Clock className="size-4" aria-hidden="true" />
            {format(event.startAt, 'EEE, MMM d · p')}
          </p>
          {dev !== null ? (
            <p className="flex items-center gap-2">
              <Timer className="size-4" aria-hidden="true" />
              {`Usually ±${dev}m (${format(event.startAt - dev * 60_000, 'p')} – ${format(event.startAt + dev * 60_000, 'p')})`}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          {event.status === 'scheduled' ? (
            <Button render={<Link href="/next" />} nativeButton={false} size="sm" className="flex-1">
              Go to next event
            </Button>
          ) : null}
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true)
              try {
                await removeEvent(event)
              } finally {
                setDeleting(false)
              }
            }}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
