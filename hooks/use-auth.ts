'use client'

import { useSyncExternalStore } from 'react'
import { getAuthServerSnapshot, getAuthSnapshot, subscribeAuth } from '@/lib/auth'

export function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthServerSnapshot)
}
