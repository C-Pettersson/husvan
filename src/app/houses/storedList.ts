'use client'

import { useMemo, useSyncExternalStore } from 'react'
import type { RouterOutputs } from '@/lib/trpc'

export type House = RouterOutputs['house']['list'][number]

// The last list this browser saw, shown while the fresh one is on its way.
// The version changes when House changes shape, so an old copy is dropped
// instead of rendered.
const STORAGE_KEY = 'husvan.houses.v1'

export function saveHouses(houses: House[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(houses))
  } catch {
    // Private window or blocked storage: the next visit shows a spinner.
  }
}

// Signing out takes the list with it.
export function forgetHouses() {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing was stored.
  }
}

const read = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

// Null on the server and during hydration, so the server's HTML matches.
export function useStoredHouses(): House[] | null {
  const raw = useSyncExternalStore(
    () => () => {},
    read,
    () => null
  )
  return useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as House[]) : null
    } catch {
      return null
    }
  }, [raw])
}
