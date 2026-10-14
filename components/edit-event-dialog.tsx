'use client'

import { EventForm } from '@/components/event-form'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { updateEvent } from '@/lib/events-store'
import type { CalendarEvent } from '@/lib/types'

interface EditEventDialogProps {
  event: CalendarEvent | null
  onOpenChange: (open: boolean) => void
}

export function EditEventDialog({ event, onOpenChange }: EditEventDialogProps) {
  return (
    <Dialog open={event !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit event</DialogTitle>
          <DialogDescription>
            {event?.seriesId ? 'Changes apply to this occurrence only.' : 'Update any detail of this event.'}
          </DialogDescription>
        </DialogHeader>
        {event ? (
          <EventForm
            key={event.id}
            mode="edit"
            event={event}
            submitLabel="Save changes"
            onSubmit={async (patch) => {
              await updateEvent(event.id, patch)
              onOpenChange(false)
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
