'use client'

import { useSyncExternalStore } from 'react'

const TICK_MS = 15_000
let current = 0
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    current = Date.now()
    timer = setInterval(() => {
      current = Date.now()
      listeners.forEach((l) => l())
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

function getSnapshot() {
  if (!current) current = Date.now()
  return current
}

/** Returns the current time in ms, refreshed every 15s. Returns null during SSR. */
export function useNow(): number | null {
  return useSyncExternalStore<number | null>(subscribe, getSnapshot, () => null)
}
