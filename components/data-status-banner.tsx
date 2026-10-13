'use client'

import { AlertTriangle, Database } from 'lucide-react'
import { useEvents } from '@/hooks/use-events'

export function DataStatusBanner() {
  const { mode, status, error } = useEvents()

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          {"Couldn't reach Firestore: "}
          {error}
        </p>
      </div>
    )
  }

  if (mode !== 'demo') return null

  return (
    <div className="flex items-start gap-2 rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm text-muted-foreground">
      <Database className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-medium text-foreground">Demo mode.</span> Add your Firebase keys
        in Vars to save events to Firestore. Changes now are kept in memory only.
      </p>
    </div>
  )
}
