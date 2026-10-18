'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { getRecentUsers, MIN_PASSWORD, signIn } from '@/lib/auth'
import { isFirebaseConfigured } from '@/lib/firebase'
import { cn } from '@/lib/utils'

/** Shows the app only to a signed-in user; everyone else gets the login screen, whatever page they opened. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  if (status === 'signed_in') return children
  if (status === 'signed_out') return <LoginScreen />
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center justify-center px-5">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </main>
  )
}

type Mode = 'login' | 'create'

function LoginScreen() {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const passwordRef = useRef<HTMLInputElement>(null)

  // Read after mounting: the list lives in this browser's storage.
  useEffect(() => setRecent(getRecentUsers()), [])

  function pick(name: string) {
    setMode('login')
    setUsername(name)
    setError(null)
    passwordRef.current?.focus()
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const message = await signIn(username, password, mode === 'create')
    // On success the gate swaps this screen for the app.
    if (message) {
      setError(message)
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">SteadyPace</h1>
        <p className="text-sm text-muted-foreground">
          {mode === 'login' ? 'Log in to see your events.' : 'Create an account. Your events are only visible to you.'}
        </p>
      </header>

      {recent.length > 0 && mode === 'login' ? (
        <section aria-labelledby="recent-heading" className="flex flex-col gap-2">
          <h2 id="recent-heading" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">On this device</h2>
          <div className="flex flex-wrap gap-2">
            {recent.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => pick(name)}
                aria-pressed={username === name}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full bg-card py-1 pr-3 pl-1 text-sm font-medium shadow-sm ring-1 ring-border transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  username === name && 'ring-2 ring-primary',
                )}
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground uppercase" aria-hidden="true">
                  {name.charAt(0)}
                </span>
                {name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border" noValidate>
        <div role="tablist" aria-label="Account" className="grid grid-cols-2 rounded-lg bg-secondary p-0.5">
          {(['login', 'create'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => { setMode(m); setError(null) }}
              className={cn(
                'h-8 rounded-md text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'login' ? 'Log in' : 'Create account'}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            className="h-11 text-base"
          />
          {mode === 'create' ? <p className="text-xs text-muted-foreground">3 to 30 characters: letters, numbers, dots, dashes or underscores. Not case-sensitive.</p> : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="h-11 text-base"
          />
          {mode === 'create' ? <p className="text-xs text-muted-foreground">At least {MIN_PASSWORD} characters.</p> : null}
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="lg" className="h-12 rounded-xl text-base" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {mode === 'login' ? 'Log in' : 'Create account'}
        </Button>
      </form>

      {isFirebaseConfigured ? null : (
        <p className="text-center text-xs text-muted-foreground">Demo mode: accounts are kept in this browser only.</p>
      )}
    </main>
  )
}
