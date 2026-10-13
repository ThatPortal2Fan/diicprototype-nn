'use client'

import { useSyncExternalStore } from 'react'
import {
  getEventsServerSnapshot,
  getEventsSnapshot,
  subscribeEvents,
} from '@/lib/events-store'

export function useEvents() {
  return useSyncExternalStore(subscribeEvents, getEventsSnapshot, getEventsServerSnapshot)
}
