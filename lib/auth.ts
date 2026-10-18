import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { getFirebaseAuth, isFirebaseConfigured } from './firebase'

export interface AuthUser {
  uid: string
  username: string
}

export interface AuthSnapshot {
  status: 'loading' | 'signed_out' | 'signed_in'
  user: AuthUser | null
}

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/
export const MIN_PASSWORD = 6
/** Firebase Auth signs in with an email, so each username maps to an address nobody receives mail at. */
const EMAIL_DOMAIN = 'users.steadypace.example.com'
const RECENT_KEY = 'steadypace-recent-users'
const DEMO_USERS_KEY = 'steadypace-demo-users'
const DEMO_SESSION_KEY = 'steadypace-demo-session'

const MODE = isFirebaseConfigured ? 'firebase' : 'demo'
const serverSnapshot: AuthSnapshot = { status: 'loading', user: null }
let snapshot: AuthSnapshot = serverSnapshot
let started = false
const listeners = new Set<() => void>()

function setSnapshot(next: AuthSnapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

export const normalizeUsername = (username: string) => username.trim().toLocaleLowerCase()
const toEmail = (username: string) => `${username}@${EMAIL_DOMAIN}`
const fromEmail = (email: string | null) => (email ?? '').split('@')[0]

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/** Usernames signed in on this device, most recent first, for switching between them. */
export function getRecentUsers(): string[] {
  return readJson<string[]>(RECENT_KEY, [])
}
function rememberUser(username: string) {
  writeJson(RECENT_KEY, [username, ...getRecentUsers().filter((u) => u !== username)].slice(0, 5))
}
function forgetUser(username: string) {
  writeJson(RECENT_KEY, getRecentUsers().filter((u) => u !== username))
}

function start() {
  if (started || typeof window === 'undefined') return
  started = true
  if (MODE === 'demo') {
    const username = readJson<string | null>(DEMO_SESSION_KEY, null)
    const account = username ? demoUsers()[username] : undefined
    setSnapshot(account ? { status: 'signed_in', user: { uid: account.uid, username: username! } } : { status: 'signed_out', user: null })
    return
  }
  onAuthStateChanged(getFirebaseAuth(), (user) =>
    setSnapshot(user ? { status: 'signed_in', user: { uid: user.uid, username: fromEmail(user.email) } } : { status: 'signed_out', user: null }),
  )
}

export function subscribeAuth(listener: () => void) {
  listeners.add(listener)
  start()
  return () => {
    listeners.delete(listener)
  }
}

export const getAuthSnapshot = () => snapshot
export const getAuthServerSnapshot = () => serverSnapshot

function validate(username: string, password: string) {
  if (!USERNAME_PATTERN.test(username)) return 'Usernames are 3 to 30 characters: letters, numbers, dots, dashes or underscores.'
  if (password.length < MIN_PASSWORD) return `Passwords need at least ${MIN_PASSWORD} characters.`
  return null
}

function authError(err: unknown) {
  const code = (err as { code?: string })?.code ?? ''
  if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password', 'auth/invalid-email'].includes(code)) return 'Wrong username or password.'
  if (code === 'auth/email-already-in-use') return 'That username is taken.'
  if (code === 'auth/weak-password') return `Passwords need at least ${MIN_PASSWORD} characters.`
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a moment and try again.'
  if (code === 'auth/network-request-failed') return 'No connection. Check your internet and try again.'
  if (code === 'auth/operation-not-allowed') return 'Username and password sign-in is not enabled for this Firebase project yet.'
  return err instanceof Error ? err.message : 'Something went wrong. Try again.'
}

/** Log in, or create the account first when `create` is set. Resolves to an error message, or null on success. */
export async function signIn(rawUsername: string, password: string, create = false): Promise<string | null> {
  const username = normalizeUsername(rawUsername)
  const invalid = create ? validate(username, password) : !username || !password ? 'Enter your username and password.' : null
  if (invalid) return invalid
  try {
    if (MODE === 'demo') {
      const error = await demoSignIn(username, password, create)
      if (error) return error
    } else if (create) {
      await createUserWithEmailAndPassword(getFirebaseAuth(), toEmail(username), password)
    } else {
      await signInWithEmailAndPassword(getFirebaseAuth(), toEmail(username), password)
    }
  } catch (err) {
    return authError(err)
  }
  rememberUser(username)
  return null
}

/** Sign out. `forget` also removes the account from this device's quick-switch list (log out vs. switch user). */
export async function signOut({ forget }: { forget: boolean }) {
  const username = snapshot.user?.username
  if (forget && username) forgetUser(username)
  if (MODE === 'demo') {
    writeJson(DEMO_SESSION_KEY, null)
    setSnapshot({ status: 'signed_out', user: null })
    return
  }
  await firebaseSignOut(getFirebaseAuth())
}

// Demo mode (no Firebase keys): accounts live in this browser only, with hashed passwords.
type DemoUsers = Record<string, { uid: string; hash: string }>
const demoUsers = () => readJson<DemoUsers>(DEMO_USERS_KEY, {})

async function hash(username: string, password: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${username}\u0000${password}`))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function demoSignIn(username: string, password: string, create: boolean) {
  const users = demoUsers()
  const digest = await hash(username, password)
  if (create) {
    if (users[username]) return 'That username is taken.'
    users[username] = { uid: crypto.randomUUID(), hash: digest }
    writeJson(DEMO_USERS_KEY, users)
  } else if (users[username]?.hash !== digest) {
    return 'Wrong username or password.'
  }
  writeJson(DEMO_SESSION_KEY, username)
  setSnapshot({ status: 'signed_in', user: { uid: users[username].uid, username } })
  return null
}
