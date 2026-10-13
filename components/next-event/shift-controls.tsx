'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CalendarEvent } from '@/lib/types'
import { cn } from '@/lib/utils'

const PRESETS = [5, 10, 15, 30, 60]
const MAX_SHIFT = 24 * 60

interface ShiftControlsProps {
  event: CalendarEvent
  busy: boolean
  onShift: (minutes: number) => void
}

export function ShiftControls({ event, busy, onShift }: ShiftControlsProps) {
  const [amount, setAmount] = useState(event.deviationMinutes || 15)
  const valid = Number.isInteger(amount) && amount > 0 && amount <= MAX_SHIFT

  return (
    <section
      aria-labelledby="shift-heading"
      className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border"
    >
      <div>
        <h2 id="shift-heading" className="font-semibold">
          Anticipate or delay
        </h2>
        <p className="text-sm text-muted-foreground">Move the start time by a set amount.</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Preset amounts">
        {PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setAmount(m)}
            aria-pressed={amount === m}
            className={cn(
              'h-9 rounded-full px-3.5 text-sm font-medium ring-1 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
              amount === m
                ? 'bg-foreground text-background ring-foreground'
                : 'bg-background text-foreground ring-border hover:bg-secondary',
            )}
          >
            {m >= 60 ? `${m / 60}h` : `${m}m`}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="shift-amount">Custom amount</Label>
        <div className="relative">
          <Input
            id="shift-amount"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_SHIFT}
            value={Number.isNaN(amount) ? '' : amount}
            onChange={(e) => setAmount(e.target.valueAsNumber)}
            className="h-11 pr-20 text-base"
            aria-invalid={!valid}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            minutes
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          size="lg"
          className="h-auto flex-col gap-0.5 rounded-xl py-3"
          disabled={!valid || busy}
          onClick={() => onShift(-amount)}
        >
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <ChevronsLeft aria-hidden="true" />
            Anticipate
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {valid ? `to ${format(event.startAt - amount * 60_000, 'p')}` : '—'}
          </span>
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="h-auto flex-col gap-0.5 rounded-xl py-3"
          disabled={!valid || busy}
          onClick={() => onShift(amount)}
        >
          <span className="inline-flex items-center gap-1.5 font-semibold">
            Delay
            <ChevronsRight aria-hidden="true" />
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            {valid ? `to ${format(event.startAt + amount * 60_000, 'p')}` : '—'}
          </span>
        </Button>
      </div>
    </section>
  )
}
