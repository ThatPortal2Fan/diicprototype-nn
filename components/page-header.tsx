import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

export function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2 pt-4 pb-2">
      <div className="flex min-h-9 items-center justify-between gap-3">
        <Link
          href="/"
          className="-ml-2 inline-flex items-center gap-0.5 rounded-lg px-2 py-1.5 text-sm font-medium text-primary hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
          Menu
        </Link>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-balance">{title}</h1>
    </header>
  )
}
