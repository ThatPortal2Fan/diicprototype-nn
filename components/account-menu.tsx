'use client'

import { useState } from 'react'
import { Loader2, LogOut, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useAuth } from '@/hooks/use-auth'
import { signOut } from '@/lib/auth'
import { cn } from '@/lib/utils'

/** The signed-in user's initial; opens "Switch user" and "Log out". Shown in the header of every page. */
export function AccountMenu({ className }: { className?: string }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState<'switch' | 'logout' | null>(null)
  if (!user) return null

  async function leave(kind: 'switch' | 'logout') {
    setBusy(kind)
    try {
      // Switching keeps this account in the device's quick-switch list; logging out removes it.
      await signOut({ forget: kind === 'logout' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex size-9 items-center justify-center rounded-full bg-card text-sm font-semibold text-foreground uppercase shadow-sm ring-1 ring-border transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          className,
        )}
        aria-label={`Account, logged in as ${user.username}`}
      >
        {user.username.charAt(0)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <p className="px-1 text-xs text-muted-foreground">
          Logged in as <span className="font-semibold text-foreground">{user.username}</span>
        </p>
        <div className="flex flex-col gap-1">
          <Button variant="ghost" className="justify-start" disabled={busy !== null} onClick={() => leave('switch')}>
            {busy === 'switch' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Users aria-hidden="true" />}
            Switch user
          </Button>
          <Button variant="ghost" className="justify-start text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => leave('logout')}>
            {busy === 'logout' ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
            Log out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
