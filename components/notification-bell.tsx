'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { format } from 'date-fns'
import { AlarmClock, Bell, Clock, PlayCircle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useEvents } from '@/hooks/use-events'
import { useNow } from '@/hooks/use-now'
import { eventTitle, getNotifications, type NotificationKind } from '@/lib/event-utils'
import { cn } from '@/lib/utils'

const KIND_STYLES: Record<NotificationKind, { icon: typeof Bell; className: string; label: string }> = {
  overdue: { icon: AlarmClock, className: 'bg-destructive/10 text-destructive', label: 'Overdue' },
  soon: { icon: Clock, className: 'bg-accent text-accent-foreground', label: 'Starting soon' },
  in_progress: { icon: PlayCircle, className: 'bg-emerald-100 text-emerald-700', label: 'In progress' },
}

export function NotificationBell() {
  const { events } = useEvents()
  const now = useNow()
  const notifications = useMemo(
    () => (now ? getNotifications(events, now) : []),
    [events, now],
  )
  const urgentCount = notifications.filter((n) => n.kind !== 'in_progress').length

  return (
    <Popover>
      <PopoverTrigger
        className="relative inline-flex size-11 items-center justify-center rounded-full bg-card text-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        aria-label={
          notifications.length
            ? `Notifications, ${notifications.length} active`
            : 'Notifications, none active'
        }
      >
        <Bell className="size-5" aria-hidden="true" />
        {urgentCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-5 font-semibold text-primary-foreground">
            {urgentCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
        </div>
        {notifications.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {"You're all caught up. Nothing due in the next hour."}
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {notifications.map((n) => {
              const style = KIND_STYLES[n.kind]
              const Icon = style.icon
              return (
                <li key={n.id}>
                  <Link
                    href={`/next?event=${encodeURIComponent(n.event.id)}`}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
                  >
                    <span
                      className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', style.className)}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      <span className="sr-only">{style.label}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{eventTitle(n.event)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {n.message} · {n.event.startAt === null ? 'Time unset' : format(n.event.startAt, 'EEE p')}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
