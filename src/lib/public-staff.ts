import type { Staff } from '../types'
import { getStaff } from './staff'

// Reuse a single request during navigation. A short TTL keeps editor updates
// discoverable while avoiding repeated Supabase egress on every route change.
const MAX_AGE_MS = 5 * 60 * 1000
let cached: Staff[] | null = null
let loadedAt = 0
let inFlight: Promise<Staff[]> | null = null
let generation = 0

export function invalidatePublicStaffCache(): void {
 cached = null
 loadedAt = 0
 inFlight = null
 generation++
}

export function getCachedPublicStaff(): Staff[] | null {
 return cached && Date.now() - loadedAt < MAX_AGE_MS ? cached : null
}

export function loadPublicStaff(): Promise<Staff[]> {
 const existing = getCachedPublicStaff()
 if (existing) return Promise.resolve(existing)
 if (inFlight) return inFlight
 const requestGeneration = generation
 const request = getStaff()
  .then(rows => {
   if (requestGeneration === generation) {
    cached = rows
    loadedAt = Date.now()
   }
   return rows
  })
  .finally(() => { if (inFlight === request) inFlight = null })
 inFlight = request
 return request
}
